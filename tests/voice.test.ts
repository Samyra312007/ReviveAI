import { describe, it, expect } from "vitest";
import { selectVoiceStrategy, buildVoiceNotification, isWithinVoiceWindow } from "@/lib/voice/generator";
import { deliverVoice } from "@/lib/voice/delivery";
import { computeVoiceMetrics } from "@/lib/voice/tracker";
import { Rng } from "@/lib/data/seed";
import { VoiceNotification } from "@/lib/data/schema";

const rng = new Rng(7);
const NOW_IST_NOON = Date.UTC(2026, 7, 25, 6, 30);
const NOW_IST_NIGHT = Date.UTC(2026, 7, 25, 17, 0);

const record = {
  record_id: "rec_v01",
  customer_id: "cus_v1",
  type: "payment_failure" as const,
  subcategory: "insufficient_funds",
  amount: 249900,
  failure_reason: "Insufficient funds",
  customer_name: "Ravi Kumar",
  merchant_id: "mer_kirana_plus",
  preferred_language: "hinglish" as const,
  voice_opt_in: true,
};

describe("voice strategy selection", () => {
  it("maps retry actions to payment nudge template VT-01", () => {
    const s = selectVoiceStrategy(record as never, {
      action: "RETRY_IN_24H",
      reasoning: "",
    });
    expect(s.action).toBe("VOICE_PAYMENT_NUDGE");
    expect(s.templateId).toBe("VT-01");
    expect(s.language).toBe("hinglish");
  });

  it("never sends voice to control group (NO_VOICE)", () => {
    const s = selectVoiceStrategy({ ...record, type: "control" } as never, {
      action: "NO_ACTION",
      reasoning: "",
    });
    expect(s.action).toBe("NO_VOICE");
  });

  it("respects voice opt-out (F4)", () => {
    const s = selectVoiceStrategy(
      { ...record, voice_opt_in: false } as never,
      { action: "RETRY_IMMEDIATELY", reasoning: "" },
    );
    expect(s.action).toBe("SKIP_VOICE");
    expect(s.reasoning).toContain("opted into voice");
  });

  it("maps invoice reminders by severity", () => {
    const gentle = selectVoiceStrategy(
      { ...record, type: "overdue_invoice" } as never,
      { action: "GENTLE_REMINDER", reasoning: "" },
    );
    const firm = selectVoiceStrategy(
      { ...record, type: "overdue_invoice" } as never,
      { action: "FIRM_NOTICE", reasoning: "" },
    );
    expect(gentle.templateId).toBe("VT-06");
    expect(firm.templateId).toBe("VT-07");
  });
});

describe("voice window and delivery", () => {
  it("F2 — allows 09:00-20:00 IST only", () => {
    expect(isWithinVoiceWindow(NOW_IST_NOON)).toBe(true);
    expect(isWithinVoiceWindow(NOW_IST_NIGHT)).toBe(false);
  });

  it("personalizes templates with customer name and amount", () => {
    const strategy = selectVoiceStrategy(record as never, {
      action: "RETRY_IN_24H",
      reasoning: "",
    });
    const n = buildVoiceNotification(() => rng.float(), 1, record as never, strategy, NOW_IST_NOON);
    expect(n.personalized_text).toContain("Ravi");
    expect(n.personalized_text).toContain("2,499");
    expect(n.simulated).toBe(true);
  });

  it("delivers via whatsapp with occasional sms fallback", () => {
    const results = [];
    for (let i = 0; i < 200; i++) {
      const strategy = selectVoiceStrategy(record as never, { action: "RETRY_IN_24H", reasoning: "" });
      const base = buildVoiceNotification(() => rng.float(), i + 1, record as never, strategy, NOW_IST_NOON);
      const { notification } = deliverVoice(() => rng.float(), base, NOW_IST_NOON);
      results.push(notification);
    }
    const delivered = results.filter((n) => n.delivery_status === "delivered");
    const viaSms = delivered.filter((n) => n.channel === "sms");
    expect(delivered.length).toBeGreaterThan(160);
    expect(viaSms.length).toBeGreaterThan(0);
    expect(results.every((n) => ["delivered", "failed"].includes(n.delivery_status))).toBe(true);
  });

  it("tracks responses only on delivered notifications", () => {
    const rng2 = new Rng(99);
    let respondedUndelivered = false;
    for (let i = 0; i < 100; i++) {
      const strategy = selectVoiceStrategy(record as never, { action: "RETRY_IN_24H", reasoning: "" });
      const base = buildVoiceNotification(() => rng2.float(), i + 1, record as never, strategy, NOW_IST_NOON);
      const { notification } = deliverVoice(() => rng2.float(), base, NOW_IST_NOON);
      if (notification.customer_responded && notification.delivery_status !== "delivered") {
        respondedUndelivered = true;
      }
    }
    expect(respondedUndelivered).toBe(false);
  });
});

describe("voice metrics", () => {
  it("computes delivery/response/recovery rates correctly", () => {
    const mk = (
      id: string,
      status: VoiceNotification["delivery_status"],
      responded: boolean,
    ): VoiceNotification => ({
      notification_id: id,
      record_id: id,
      customer_id: id,
      template_id: "VT-01",
      language: "hinglish",
      personalized_text: "x",
      tone: "friendly",
      channel: "whatsapp",
      delivery_status: status,
      audio_duration_seconds: 15,
      tts_engine: "simulated-tts-v1",
      customer_responded: responded,
      response_type: responded ? "clicked_link" : undefined,
      created_at: "2026-08-25T06:00:00Z",
      simulated: true,
    });

    const notifications = [
      mk("a", "delivered", true),
      mk("b", "delivered", false),
      mk("c", "delivered", true),
      mk("d", "failed", false),
    ];
    const decisions = [
      { record: { record_id: "a" }, outcome: "recovered" },
      { record: { record_id: "b" }, outcome: "failed" },
    ];

    const m = computeVoiceMetrics(notifications, decisions);
    expect(m.sent).toBe(4);
    expect(m.delivered).toBe(3);
    expect(m.delivery_rate).toBe(0.75);
    expect(m.response_rate).toBeCloseTo(0.667, 2);
    expect(m.recovered_via_voice).toBe(1);
    expect(m.voice_recovery_rate).toBe(0.25);
  });

  it("handles empty input without division errors", () => {
    const m = computeVoiceMetrics([]);
    expect(m.sent).toBe(0);
    expect(m.delivery_rate).toBeNull();
  });
});
