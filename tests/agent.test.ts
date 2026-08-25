import { describe, it, expect } from "vitest";
import { selectStrategy, invoiceDaysOverdue } from "@/lib/agent/strategy";
import {
  CustomerContext,
  BatchState,
  createBatchState,
  buildContext,
} from "@/lib/agent/context";
import { SyntheticRecord } from "@/lib/data/schema";

const baseRecord: SyntheticRecord = {
  record_id: "rec_001",
  merchant_id: "mer_x",
  customer_id: "cus_1",
  type: "payment_failure",
  subcategory: "insufficient_funds",
  amount: 249900,
  currency: "INR",
  failure_timestamp: new Date(Date.now() - 3600 * 1000).toISOString(),
  days_since_last_order: 2,
  customer_email: "ravi@gmail.com",
  customer_phone: "+919876543210",
  customer_name: "Ravi Kumar",
  customer_segment: "high_value",
  previous_payments: 8,
  avg_order_value: 300000,
  failure_reason: "Insufficient funds in account",
  voice_opt_in: true,
  preferred_language: "hinglish",
  ground_truth: {
    recoverable: true,
    recommended_intervention: "RETRY_IN_24H",
    expected_recovery_probability: 0.75,
    max_retries_allowed: 2,
    recoverable_amount: 249900,
  },
};

function ctx(overrides: Partial<CustomerContext> = {}): CustomerContext {
  return {
    customerValue: "high",
    clvPaise: 2650000,
    retryCount: 0,
    lastContactAt: null,
    ...overrides,
  };
}

describe("strategy selection — payment failures", () => {
  it("retries in 24h for high-value customers", () => {
    const s = selectStrategy(baseRecord, ctx());
    expect(s.action).toBe("RETRY_IN_24H");
    expect(s.reasoning).toContain("High value");
  });

  it("escalates when retry limit reached", () => {
    const s = selectStrategy(baseRecord, ctx({ retryCount: 2 }));
    expect(s.action).toBe("ESCALATE_TO_MANUAL");
  });

  it("retries in 48h for lower-value customers", () => {
    const s = selectStrategy(baseRecord, ctx({ customerValue: "low" }));
    expect(s.action).toBe("RETRY_IN_48H");
  });

  it("retries immediately on network timeout", () => {
    const s = selectStrategy(
      { ...baseRecord, subcategory: "network_timeout", failure_reason: "Network timeout" },
      ctx(),
    );
    expect(s.action).toBe("RETRY_IMMEDIATELY");
  });

  it("requests card update for expired cards", () => {
    const s = selectStrategy(
      { ...baseRecord, subcategory: "card_expired", failure_reason: "Card expired" },
      ctx(),
    );
    expect(s.action).toBe("REQUEST_CARD_UPDATE");
  });

  it("escalates bank declines to manual review", () => {
    const s = selectStrategy(
      { ...baseRecord, subcategory: "bank_declined", failure_reason: "Bank declined" },
      ctx(),
    );
    expect(s.action).toBe("ESCALATE_TO_MANUAL");
  });

  it("never intervenes on fraud holds", () => {
    const s = selectStrategy(
      { ...baseRecord, subcategory: "fraud_hold", failure_reason: "Fraud flag" },
      ctx(),
    );
    expect(s.action).toBe("SKIP");
    expect(s.reasoning).toContain("never auto-intervene");
  });
});

describe("strategy selection — checkout abandonment", () => {
  const checkout: SyntheticRecord = {
    ...baseRecord,
    type: "checkout_abandonment",
    subcategory: "form_abandonment",
    recovery_window_hours: 0.03,
    failure_reason: "Customer abandoned checkout form",
  };

  it("sends WhatsApp reminder for very fresh abandonment (<5 min)", () => {
    const s = selectStrategy({ ...checkout, recovery_window_hours: 0.03 }, ctx());
    expect(s.action).toBe("CART_REMINDER_WHATSAPP");
  });

  it("sends SMS for moderate abandonment (5-30 min)", () => {
    const s = selectStrategy({ ...checkout, recovery_window_hours: 0.2 }, ctx());
    expect(s.action).toBe("SMS_PAYMENT_LINK");
  });

  it("sends email for older abandonment (30 min - 120 h)", () => {
    const s = selectStrategy({ ...checkout, recovery_window_hours: 24 }, ctx());
    expect(s.action).toBe("EMAIL_CART_RECOVERY");
  });

  it("skips when window closed (>120 h)", () => {
    const s = selectStrategy({ ...checkout, recovery_window_hours: 130 }, ctx());
    expect(s.action).toBe("SKIP");
  });
});

describe("strategy selection — subscriptions", () => {
  const sub: SyntheticRecord = {
    ...baseRecord,
    type: "subscription_failure",
    amount: 99900,
    failure_reason: "Mandate not triggered by bank",
  };

  it("retries mandate within retry window", () => {
    const s = selectStrategy(sub, ctx({ lifecycleStage: "retry_window" }));
    expect(s.action).toBe("MANDATE_RETRY");
  });

  it("requests card update during dunning", () => {
    const s = selectStrategy(sub, ctx({ lifecycleStage: "dunning_started" }));
    expect(s.action).toBe("CARD_UPDATE_REQUEST");
  });

  it("escalates near-churn subscriptions to retention", () => {
    const s = selectStrategy(sub, ctx({ lifecycleStage: "near_churn" }));
    expect(s.action).toBe("ESCALATE_TO_CHURN_PREVENTION");
  });
});

describe("strategy selection — overdue invoices", () => {
  const invoice: SyntheticRecord = {
    ...baseRecord,
    type: "overdue_invoice",
    amount: 4500000,
    failure_reason: "Invoice overdue",
  };

  it.each([
    ["7_day_late", 7, "GENTLE_REMINDER"],
    ["14_day_late", 14, "FIRM_NOTICE"],
    ["30_day_late", 30, "PAYMENT_PLAN_OFFER"],
    ["60_day_plus_late", 60, "ESCALATE_LEGAL"],
  ])("%s → %s", (subcategory, days, expected) => {
    const s = selectStrategy(
      { ...invoice, subcategory, failure_reason: `Invoice ${days} days overdue` },
      ctx(),
    );
    expect(s.action).toBe(expected);
  });

  it("parses days overdue from subcategory", () => {
    expect(invoiceDaysOverdue({ ...invoice, subcategory: "60_day_plus_late" })).toBe(60);
  });
});

describe("strategy selection — control", () => {
  it("takes no action on healthy records", () => {
    const s = selectStrategy(
      { ...baseRecord, type: "control", subcategory: "healthy" },
      ctx(),
    );
    expect(s.action).toBe("NO_ACTION");
  });
});

describe("batch state / context builder", () => {
  it("builds CLV from previous payments plus current amount", () => {
    const state: BatchState = createBatchState(10);
    state.retriesPerRecord.set(baseRecord.record_id, 1);
    const context = buildContext(baseRecord, state);
    expect(context.clvPaise).toBe(8 * 300000 + 249900);
    expect(context.retryCount).toBe(1);
    expect(context.customerValue).toBe("high");
  });
});
