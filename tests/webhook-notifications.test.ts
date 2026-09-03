import { describe, it, expect } from "vitest";
import crypto from "node:crypto";

// ── Razorpay webhook signature verification ─────────────────────────────────

describe("Razorpay webhook signature verification", () => {
  it("accepts a valid HMAC-SHA256 signature", async () => {
    const { verifyRazorpaySignature } = await import("@/lib/razorpay/webhook");
    const secret = "whsec_test_secret";
    const rawBody = JSON.stringify({ event: "payment.failed", payload: {} });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    expect(verifyRazorpaySignature(rawBody, signature, secret)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    const { verifyRazorpaySignature } = await import("@/lib/razorpay/webhook");
    const rawBody = JSON.stringify({ event: "payment.failed" });
    const signature = crypto
      .createHmac("sha256", "wrong_secret")
      .update(rawBody)
      .digest("hex");

    expect(verifyRazorpaySignature(rawBody, signature, "right_secret")).toBe(false);
  });

  it("rejects a tampered body", async () => {
    const { verifyRazorpaySignature } = await import("@/lib/razorpay/webhook");
    const secret = "whsec_test_secret";
    const rawBody = JSON.stringify({ event: "payment.failed", amount: 100 });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const tampered = JSON.stringify({ event: "payment.failed", amount: 999999 });
    expect(verifyRazorpaySignature(tampered, signature, secret)).toBe(false);
  });

  it("rejects missing signature or secret", async () => {
    const { verifyRazorpaySignature } = await import("@/lib/razorpay/webhook");
    expect(verifyRazorpaySignature("body", null, "secret")).toBe(false);
    expect(verifyRazorpaySignature("body", "sig", "")).toBe(false);
  });
});

// ── Razorpay event → SyntheticRecord mapping ────────────────────────────────

describe("Razorpay webhook event mapping", () => {
  it("maps payment.failed to a payment_failure record", async () => {
    const { mapRazorpayEvent } = await import("@/lib/razorpay/webhook");
    const record = mapRazorpayEvent(
      {
        entity: "event",
        event: "payment.failed",
        contains: ["payment"],
        created_at: 1756100000,
        payload: {
          payment: {
            entity: {
              id: "pay_abc123",
              amount: 49900,
              currency: "INR",
              created_at: 1756100000,
              error_code: "INSUFFICIENT_FUNDS",
              error_description: "Your card does not have sufficient funds",
              email: "amit@example.com",
              contact: "+919876543210",
              name: "Amit Sharma",
            },
          },
        },
      },
      "mer_kirana_plus",
    );

    expect(record).not.toBeNull();
    expect(record!.record_id).toBe("pay_abc123");
    expect(record!.merchant_id).toBe("mer_kirana_plus");
    expect(record!.type).toBe("payment_failure");
    expect(record!.subcategory).toBe("insufficient_funds");
    expect(record!.amount).toBe(49900);
    expect(record!.currency).toBe("INR");
    expect(record!.customer_email).toBe("amit@example.com");
    expect(record!.customer_phone).toBe("+919876543210");
    expect(record!.failure_reason).toContain("sufficient funds");
    expect(record!.ground_truth.recoverable).toBe(true);
  });

  it("maps subscription.failed to a subscription_failure record", async () => {
    const { mapRazorpayEvent } = await import("@/lib/razorpay/webhook");
    const record = mapRazorpayEvent(
      {
        entity: "event",
        event: "subscription.failed",
        contains: ["subscription"],
        created_at: 1756100000,
        payload: {
          subscription: {
            entity: {
              id: "sub_xyz789",
              amount: 99900,
              created_at: 1756100000,
              error_code: "BANK_DECLINED",
              email: "priya@example.com",
              contact: "9876501234",
            },
          },
        },
      },
      "mer_saasflow",
    );

    expect(record).not.toBeNull();
    expect(record!.type).toBe("subscription_failure");
    expect(record!.subcategory).toBe("bank_declined");
    expect(record!.customer_phone).toBe("+919876501234");
  });

  it("maps invoice.expired to an overdue_invoice record", async () => {
    const { mapRazorpayEvent } = await import("@/lib/razorpay/webhook");
    const record = mapRazorpayEvent(
      {
        entity: "event",
        event: "invoice.expired",
        contains: ["invoice"],
        created_at: 1756100000,
        payload: {
          invoice: {
            entity: {
              id: "inv_001",
              amount: 250000,
              created_at: 1756100000,
              customer_email: "rahul@example.com",
              customer_phone: "9812345678",
            },
          },
        },
      },
      "mer_fashionhub",
    );

    expect(record).not.toBeNull();
    expect(record!.type).toBe("overdue_invoice");
    expect(record!.subcategory).toBe("30_day_late");
  });

  it("returns null for non-failure events (payment.captured, refund.*)", async () => {
    const { mapRazorpayEvent } = await import("@/lib/razorpay/webhook");
    const captured = mapRazorpayEvent(
      {
        entity: "event",
        event: "payment.captured",
        contains: ["payment"],
        created_at: 1756100000,
        payload: {
          payment: { entity: { id: "pay_ok", amount: 100 } },
        },
      },
      "mer_kirana_plus",
    );
    expect(captured).toBeNull();

    const refunded = mapRazorpayEvent(
      {
        entity: "event",
        event: "refund.processed",
        contains: ["refund"],
        created_at: 1756100000,
        payload: { refund: { entity: { id: "rfnd_1" } } },
      },
      "mer_kirana_plus",
    );
    expect(refunded).toBeNull();
  });
});

// ── Secret encryption round-trip ────────────────────────────────────────────

describe("at-rest secret encryption", () => {
  it("encrypts and decrypts a Razorpay key secret", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const plaintext = "rzp_live_secret_very_long_value";
    const enc = encryptSecret(plaintext);

    expect(enc).not.toContain(plaintext);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(plaintext);
  });

  it("produces unique ciphertext per call (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("falls back to plaintext for legacy unencrypted values", async () => {
    const { decryptSecret } = await import("@/lib/crypto");
    expect(decryptSecret("legacy-plaintext")).toBe("legacy-plaintext");
  });
});

// ── Notification dispatch ───────────────────────────────────────────────────

function makeNotification(overrides: Partial<import("@/lib/data/schema").VoiceNotification> = {}) {
  return {
    notification_id: "n_001",
    record_id: "rec_001",
    customer_id: "cust_919876543210",
    template_id: "tpl_1",
    language: "hinglish" as const,
    personalized_text: "Hi Amit, your payment of ₹499 failed. Retry here: link",
    tone: "friendly" as const,
    channel: "whatsapp" as const,
    delivery_status: "queued" as const,
    audio_duration_seconds: 12,
    tts_engine: "elevenlabs",
    customer_responded: false,
    created_at: new Date().toISOString(),
    simulated: false,
    ...overrides,
  };
}

describe("notification dispatch", () => {
  it("falls back to simulated delivery when no provider is configured", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    const result = await dispatchNotification(makeNotification(), []);
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.status).toBe("delivered");
    expect(result.providerMessageId).toContain("sim_");
  });

  it("skips unconfigured providers and uses the simulated fallback", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    const fake = {
      name: "whatsapp" as const,
      isConfigured: () => false,
      send: async () => {
        throw new Error("should never be called");
      },
    };
    const result = await dispatchNotification(makeNotification(), [fake]);
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it("uses a configured provider when it succeeds", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    const fake = {
      name: "whatsapp" as const,
      isConfigured: () => true,
      send: async () => ({
        ok: true,
        status: "sent" as const,
        simulated: false,
        providerMessageId: "wamid.123",
      }),
    };
    const result = await dispatchNotification(makeNotification(), [fake]);
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(false);
    expect(result.providerMessageId).toBe("wamid.123");
  });

  it("falls through to the next provider when the first fails", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    const failing = {
      name: "whatsapp" as const,
      isConfigured: () => true,
      send: async () => ({
        ok: false,
        status: "failed" as const,
        simulated: false,
        error: "rate limited",
      }),
    };
    const succeeding = {
      name: "email" as const,
      isConfigured: () => true,
      send: async () => ({
        ok: true,
        status: "sent" as const,
        simulated: false,
        providerMessageId: "re_123",
      }),
    };
    const result = await dispatchNotification(makeNotification(), [failing, succeeding]);
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("re_123");
  });

  it("respects merchant prefs disabling a channel", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    const whatsapp = {
      name: "whatsapp" as const,
      isConfigured: () => true,
      send: async () => {
        throw new Error("whatsapp should be skipped");
      },
    };
    const email = {
      name: "email" as const,
      isConfigured: () => true,
      send: async () => ({
        ok: true,
        status: "sent" as const,
        simulated: false,
        providerMessageId: "re_456",
      }),
    };
    const result = await dispatchNotification(makeNotification(), [whatsapp, email], {
      merchantPrefs: { whatsappEnabled: false, emailEnabled: true },
    });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBe("re_456");
  });

  it("queues delivery during quiet hours", async () => {
    const { dispatchNotification } = await import("@/lib/notification/provider");
    // Quiet hours 23:59–00:01 can never match "now" exactly; instead verify the
    // queued path triggers by checking the inQuietHours branch via a provider
    // that would otherwise be used. We simulate quiet hours by picking a window
    // that always contains now: start 00:00, end 23:59 (start < end).
    const alwaysQuiet = { quietHoursStart: "00:00", quietHoursEnd: "23:59" };
    const whatsapp = {
      name: "whatsapp" as const,
      isConfigured: () => true,
      send: async () => {
        throw new Error("should be queued, not sent");
      },
    };
    const result = await dispatchNotification(makeNotification(), [whatsapp], {
      merchantPrefs: alwaysQuiet,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("queued");
    expect(result.error).toBe("quiet_hours");
  });
});