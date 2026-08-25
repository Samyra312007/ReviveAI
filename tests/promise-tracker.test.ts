import { describe, it, expect } from "vitest";
import { processPromises } from "@/lib/promise/tracker";
import { SyntheticRecord } from "@/lib/data/schema";

const NOW = Date.UTC(2026, 8, 1, 6, 0);
const DAY = 24 * 3600 * 1000;

function makeInvoiceRecord(promise: Partial<{
  status: string;
  dueOffsetDays: number;
  renewalCount: number;
}>): SyntheticRecord {
  const now = NOW;
  const due = new Date(now + (promise.dueOffsetDays ?? 5) * DAY).toISOString();
  return {
    record_id: "rec_inv",
    customer_id: "cus_1",
    merchant_id: "mer_x",
    type: "overdue_invoice",
    subcategory: "7_day_late",
    amount: 2500000,
    currency: "INR",
    failure_timestamp: new Date(now - 10 * DAY).toISOString(),
    days_since_last_order: 5,
    customer_email: "c@corp.in",
    customer_phone: "+919812345678",
    customer_name: "Amit Mehta",
    customer_segment: "high_value",
    previous_payments: 9,
    avg_order_value: 2000000,
    failure_reason: "Invoice overdue",
    voice_opt_in: false,
    preferred_language: "hinglish",
    promise_status: "pending",
    promise_history: [
      {
        promise_id: "prom_test",
        record_id: "rec_inv",
        customer_id: "cus_1",
        merchant_id: "mer_x",
        promised_amount: 2500000,
        promised_date: new Date(now - 20 * DAY).toISOString(),
        due_date: due,
        promise_source: "chat",
        status: (promise.status ?? "pending") as never,
        renewal_count: promise.renewalCount ?? 0,
        reminders_sent: [],
        created_at: new Date(now - 20 * DAY).toISOString(),
        updated_at: new Date(now - 20 * DAY).toISOString(),
      },
    ],
    ground_truth: {
      recoverable: true,
      recommended_intervention: "",
      expected_recovery_probability: 0.6,
      max_retries_allowed: 2,
      recoverable_amount: 2500000,
    },
  };
}

describe("promise lifecycle tracker", () => {
  it("G2 — auto-marks broken when due date passed by more than 3 days", () => {
    const record = makeInvoiceRecord({ status: "pending", dueOffsetDays: -5 });
    const result = processPromises([record], NOW, () => 0.9);
    expect(result.promisesBroken).toBe(1);
    expect(result.updatedPromises[0].status).toBe("broken");
    expect(
      result.events.some((e) => e.event === "MARK_BROKEN" && e.detail.includes("G2")),
    ).toBe(true);
  });

  it("does NOT mark broken within the 3-day grace window", () => {
    const record = makeInvoiceRecord({ status: "pending", dueOffsetDays: -2 });
    const result = processPromises([record], NOW, () => 0.9);
    expect(result.promisesBroken).toBe(0);
    expect(result.events.some((e) => e.event === "MARK_BROKEN")).toBe(false);
  });

  it("G1/tier-6 — escalates broken promises with 2+ renewals", () => {
    const record = makeInvoiceRecord({ status: "pending", dueOffsetDays: -6, renewalCount: 2 });
    const result = processPromises([record], NOW, () => 0.9);
    expect(result.updatedPromises[0].status).toBe("escalated");
    expect(result.promisesEscalated).toBe(1);
  });

  it("sends pre-due/on-due/post-due reminder near the due date", () => {
    const preDue = makeInvoiceRecord({ status: "pending", dueOffsetDays: 0.5 });
    const r1 = processPromises([preDue], NOW, () => 0.9);
    expect(r1.remindersCreated).toBe(1);

    const onDue = makeInvoiceRecord({ status: "pending", dueOffsetDays: 0 });
    const r2 = processPromises([onDue], NOW, () => 0.9);
    expect(r2.remindersCreated).toBe(1);

    const postDue = makeInvoiceRecord({ status: "pending", dueOffsetDays: -0.5 });
    const r3 = processPromises([postDue], NOW, () => 0.9);
    expect(r3.remindersCreated).toBe(1);
  });

  it("logs fulfilled promises without action", () => {
    const record = makeInvoiceRecord({ status: "fulfilled" });
    const result = processPromises([record], NOW, () => 0.9);
    expect(result.events[0].event).toBe("FULFILLED");
    expect(result.updatedPromises).toHaveLength(0);
  });

  it("handles renewal requests via the parser and increments renewal count", () => {
    const record = makeInvoiceRecord({ status: "pending", dueOffsetDays: 4 });
    const result = processPromises([record], NOW, () => 0.1);
    const renewed = result.updatedPromises.find((p) => p.renewal_count > 0);
    expect(renewed).toBeDefined();
    expect(result.events.some((e) => e.event === "RENEWAL_REQUESTED")).toBe(true);
    expect(renewed!.status === "renewed" || renewed!.status === "escalated").toBe(true);
  });

  it("ignores non-invoice records entirely", () => {
    const paymentRecord = { ...makeInvoiceRecord({}), type: "payment_failure" as const };
    const result = processPromises([paymentRecord], NOW, () => 0.9);
    expect(result.events).toHaveLength(0);
  });
});
