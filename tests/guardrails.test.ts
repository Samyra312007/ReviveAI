import { describe, it, expect } from "vitest";
import { evaluateGuardrails } from "@/lib/guardrails/engine";
import { RULES } from "@/lib/guardrails/rules";
import { createBatchState, BatchState } from "@/lib/agent/context";
import { Strategy } from "@/lib/agent/strategy";
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

const retryStrategy: Strategy = {
  action: "RETRY_IN_24H",
  reasoning: "test",
};

function makeState(overrides: Partial<BatchState> = {}, now = Date.parse("2026-08-25T12:00:00Z")): BatchState {
  return { ...createBatchState(150, now), ...overrides };
}

function evaluate(record = baseRecord, strategy = retryStrategy, state = makeState()) {
  return evaluateGuardrails(record, strategy, state);
}

describe("guardrails — retry limits", () => {
  it("A1 blocks when record already retried twice", () => {
    const state = makeState();
    state.retriesPerRecord.set(baseRecord.record_id, 2);
    const { outcome } = evaluate(baseRecord, retryStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("A1");
    expect(outcome.block?.action_taken).toBe("SKIP");
  });

  it("A2 escalates when customer contacted 3x today", () => {
    const dayKey = "2026-08-25";
    const state = makeState();
    state.contactsPerCustomerDay.set(`${baseRecord.customer_id}:${dayKey}`, 3);
    const { outcome } = evaluate(baseRecord, retryStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.action_taken).toBe("ESCALATE");
  });

  it("A3 pauses batch at 80% intervention cap", () => {
    const state = makeState();
    state.interventionCount = 120;
    state.totalRecords = 150;
    const { outcome } = evaluate(baseRecord, retryStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.action_taken).toBe("PAUSE");
  });
});

describe("guardrails — time rules", () => {
  it("B1 queues interventions during IST quiet hours (23:00 IST)", () => {
    const { outcome } = evaluate(
      baseRecord,
      retryStrategy,
      makeState({}, Date.UTC(2026, 7, 25, 17, 30)),
    );
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("B1");
    expect(outcome.block?.action_taken).toBe("QUEUE");
  });

  it("B1 passes during IST business hours", () => {
    const { outcome } = evaluate(
      baseRecord,
      retryStrategy,
      makeState({}, Date.UTC(2026, 7, 25, 4, 30)),
    );
    const b1 = outcome.checks.find((c) => c.rule_id === "B1");
    expect(b1?.passed).toBe(true);
  });

  it("B2 blocks within 4h cooling period", () => {
    const state = makeState();
    state.lastContactAt.set(baseRecord.customer_id, state.now - 2 * 3600 * 1000);
    const { outcome } = evaluate(baseRecord, retryStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("B2");
    expect(outcome.block?.reasoning).toContain("Cooling period");
  });
});

describe("guardrails — compliance", () => {
  it("C3 blocks fraud-flagged records", () => {
    const { outcome } = evaluate({
      ...baseRecord,
      subcategory: "fraud_hold",
      failure_reason: "Transaction flagged as potential fraud",
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("C3");
  });

  it("C4/D1 escalate amounts over ₹50,000", () => {
    const bigAmount = { ...baseRecord, amount: 6000000 };
    const { outcome } = evaluate(bigAmount);
    expect(outcome.passed).toBe(false);
    expect(["C4", "D1"]).toContain(outcome.block?.rule_id);
  });

  it("C2 skips customers on DND list", () => {
    const state = makeState();
    state.dndPreferences.add(baseRecord.customer_id);
    const smsStrategy: Strategy = { action: "SMS_PAYMENT_LINK", reasoning: "test" };
    const checkoutRec = { ...baseRecord, type: "checkout_abandonment" as const, recovery_window_hours: 0.2 };
    const { outcome } = evaluate(checkoutRec, smsStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("C2");
  });
});

describe("guardrails — financial caps", () => {
  it("D2 pauses when daily volume cap would be exceeded", () => {
    const state = makeState();
    state.attemptedVolumePaise = 500000 * 100;
    const { outcome } = evaluate(baseRecord, retryStrategy, state);
    expect(outcome.passed).toBe(false);
    expect(outcome.block?.rule_id).toBe("D2");
  });

  it("D3 skips when channel cost exceeds 30% of amount", () => {
    const d3 = RULES.find((r) => r.id === "D3")!;
    const ctx = {
      record: { ...baseRecord, amount: 100 },
      strategy: { action: "SMS_PAYMENT_LINK" as const, reasoning: "" },
      channel: "sms" as const,
      state: makeState(),
      istHour: 12,
      dayKey: "2026-08-25",
      weekKey: "2026-08-23",
    };
    const result = d3.check(ctx);
    expect(result.passed).toBe(false);
    expect(result.block_reason).toContain("30%");
  });

  it("D3 passes when amount comfortably exceeds channel cost", () => {
    const d3 = RULES.find((r) => r.id === "D3")!;
    const ctx = {
      record: baseRecord,
      strategy: { action: "RETRY_IN_24H" as const, reasoning: "" },
      channel: null,
      state: makeState(),
      istHour: 12,
      dayKey: "2026-08-25",
      weekKey: "2026-08-23",
    };
    expect(d3.check(ctx).passed).toBe(true);
  });
});

describe("guardrails — voice rules", () => {
  it("voice rules do not apply to non-voice channels", () => {
    const { outcome } = evaluate(baseRecord, retryStrategy, makeState());
    const voiceRuleIds = ["F1", "F2", "F3", "F4"];
    expect(outcome.checks.find((c) => voiceRuleIds.includes(c.rule_id))).toBeUndefined();
  });

  it("voice rules apply only to voice-channel actions", () => {
    const { outcome } = evaluate(baseRecord, retryStrategy, makeState());
    expect(outcome.checks.find((c) => c.rule_id === "F4")).toBeUndefined();
  });
});

describe("guardrails — most restrictive wins & audit trail", () => {
  it("returns first blocking rule and full check list", () => {
    const state = makeState();
    state.retriesPerRecord.set(baseRecord.record_id, 3);
    state.lastContactAt.set(baseRecord.customer_id, state.now - 1000);
    const { outcome, auditEntries } = evaluate(baseRecord, retryStrategy, state);

    expect(outcome.passed).toBe(false);
    expect(outcome.checks.length).toBeGreaterThan(5);
    expect(outcome.checks.filter((c) => !c.passed).length).toBeGreaterThanOrEqual(2);
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
    expect(auditEntries[0]).toMatchObject({
      record_id: baseRecord.record_id,
      rule_id: "A1",
      timestamp: expect.any(String),
    });
  });

  it("passes all rules for a normal daytime retry", () => {
    const { outcome } = evaluate(
      baseRecord,
      retryStrategy,
      makeState({}, Date.UTC(2026, 7, 25, 6, 0)),
    );
    expect(outcome.passed).toBe(true);
    expect(outcome.block).toBeUndefined();
  });

  it("B3 blocks WhatsApp/SMS nudges outside the 2h checkout window", () => {
    const rec = {
      ...baseRecord,
      type: "checkout_abandonment" as const,
      recovery_window_hours: 5,
    };
    const smsStrategy: Strategy = { action: "SMS_PAYMENT_LINK", reasoning: "" };
    const { outcome } = evaluate(rec, smsStrategy);
    expect(outcome.block?.rule_id).toBe("B3");
  });
});
