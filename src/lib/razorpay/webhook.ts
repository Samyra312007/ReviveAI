import crypto from "node:crypto";
import { SyntheticRecord } from "@/lib/data/schema";

/**
 * Razorpay webhook signature verification + event mapping.
 *
 * Razorpay signs the raw request body with HMAC-SHA256 using the webhook
 * secret configured in the dashboard; the signature arrives in the
 * `X-Razorpay-Signature` header.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): boolean {
  if (!signature || !webhookSecret) return false;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface RazorpayWebhookEvent {
  entity: string;
  account_id?: string;
  event: string;
  contains: string[];
  payload: Record<string, { entity: Record<string, unknown> }>;
  created_at: number;
}

const FAILURE_SUBCATEGORY_MAP: Record<string, string> = {
  BANK_DECLINED: "bank_declined",
  INSUFFICIENT_FUNDS: "insufficient_funds",
  CARD_EXPIRED: "card_expired",
  CARD_DECLINED: "bank_declined",
  NETWORK_ISSUE: "network_timeout",
  TIMEOUT: "network_timeout",
  FRAUD: "fraud_hold",
  "FRAUD-OTHER": "fraud_hold",
  AUTH_FAILED: "bank_declined",
  APPROVAL_FAILED: "bank_declined",
  CONTACT_SUPPORT: "bank_declined",
};

function subcategoryForErrorCode(code: string | undefined): string {
  if (!code) return "bank_declined";
  const upper = code.toUpperCase();
  for (const [key, value] of Object.entries(FAILURE_SUBCATEGORY_MAP)) {
    if (upper.includes(key)) return value;
  }
  return "bank_declined";
}

function customerFields(entity: Record<string, unknown>) {
  const email =
    (entity.email as string) ??
    (entity.customer_email as string) ??
    "unknown@example.com";
  const phoneRaw = String(entity.contact ?? entity.customer_phone ?? "");
  const phone = phoneRaw.replace(/\D/g, "").slice(-10) || "9999999999";
  const name = (entity.name as string) ?? email.split("@")[0] ?? "Customer";
  return { email, phone, name };
}

/**
 * Map a Razorpay webhook event to a SyntheticRecord for ingestion.
 * Returns null for events that are not failure events (captured, refunded…).
 */
export function mapRazorpayEvent(
  event: RazorpayWebhookEvent,
  merchantId: string,
): SyntheticRecord | null {
  const entity = event.payload?.payment?.entity ?? event.payload?.subscription?.entity ?? event.payload?.invoice?.entity;

  if (!entity) return null;

  const tsMs = (entity.created_at as number) ?? event.created_at ?? Math.floor(Date.now() / 1000);
  const ts = new Date(tsMs * 1000).toISOString();
  const amount = Number(entity.amount ?? 0);

  let type: SyntheticRecord["type"] | null = null;
  let subcategory = "bank_declined";
  let failureReason = "Payment failed";

  const errorObj =
    entity.error && typeof entity.error === "object"
      ? (entity.error as Record<string, unknown>)
      : undefined;
  const errorCode =
    (entity.error_code as string) ?? (errorObj?.code as string | undefined);
  const errorDescription =
    (entity.error_description as string) ??
    (errorObj?.description as string | undefined);

  if (event.event === "payment.failed") {
    type = "payment_failure";
    subcategory = subcategoryForErrorCode(errorCode);
    failureReason = errorDescription ?? failureReason;
  } else if (event.event === "subscription.failed") {
    type = "subscription_failure";
    subcategory = subcategoryForErrorCode(errorCode);
    failureReason = errorDescription ?? "Subscription retry failed";
  } else if (event.event === "invoice.expired" || event.event === "invoice.partially_paid") {
    type = "overdue_invoice";
    subcategory = "30_day_late";
    failureReason = "Invoice overdue — payment link expired";
  } else {
    // payment.captured, refund.*, etc. are not failure events.
    return null;
  }

  const customer = customerFields(entity);
  const recordId = (entity.id as string) ?? `rzp_${tsMs}_${merchantId}`;

  return {
    record_id: recordId,
    merchant_id: merchantId,
    customer_id: `cust_${recordId.replace(/[^a-zA-Z0-9]/g, "")}`,
    type,
    subcategory,
    amount,
    currency: "INR",
    failure_timestamp: ts,
    days_since_last_order: 0,
    customer_email: customer.email,
    customer_phone: `+91${customer.phone}`,
    customer_name: customer.name,
    customer_segment: "mid_value",
    previous_payments: 0,
    avg_order_value: amount,
    failure_reason: failureReason,
    lifecycle_stage: "at_risk",
    recovery_window_hours: 72,
    preferred_language: "hinglish",
    voice_opt_in: false,
    ground_truth: {
      recoverable: true,
      recommended_intervention: "RETRY_IN_24H",
      expected_recovery_probability: 0.5,
      max_retries_allowed: 2,
      recoverable_amount: amount,
    },
  };
}

/** Call the Razorpay API with a merchant's keys (used by connect + import). */
export async function razorpayApiCall(
  method: "GET" | "POST",
  path: string,
  keyId: string,
  keySecret: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}