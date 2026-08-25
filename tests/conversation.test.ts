import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  runConversation,
} from "@/lib/conversation/engine";
import { SyntheticRecord } from "@/lib/data/schema";

function makeRecord(overrides: Partial<SyntheticRecord> = {}): SyntheticRecord {
  return {
    record_id: "rec_conv",
    customer_id: "cus_c1",
    merchant_id: "mer_x",
    type: "payment_failure",
    subcategory: "insufficient_funds",
    amount: 249900,
    currency: "INR",
    failure_timestamp: new Date(Date.UTC(2026, 7, 25, 6)).toISOString(),
    days_since_last_order: 2,
    customer_email: "ravi@gmail.com",
    customer_phone: "+919876543210",
    customer_name: "Ravi Kumar",
    customer_segment: "mid_value",
    previous_payments: 5,
    avg_order_value: 200000,
    failure_reason: "Insufficient funds in account",
    voice_opt_in: false,
    preferred_language: "hinglish",
    ground_truth: {
      recoverable: true,
      recommended_intervention: "",
      expected_recovery_probability: 0.6,
      max_retries_allowed: 2,
      recoverable_amount: 249900,
    },
    ...overrides,
  };
}

const NOW = Date.UTC(2026, 8, 1, 6);
const noRand = () => 0.5;

describe("intent classification", () => {
  it("classifies disputes with high confidence", () => {
    const r = classifyIntent("Ye charge galat hai, double charge hua hai");
    expect(r.intent).toBe("dispute");
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("classifies refusals", () => {
    for (const text of [
      "Nahi, main order cancel karwana chahta hoon",
      "I won't pay for this",
      "Payment nahi karunga",
    ]) {
      expect(classifyIntent(text).intent).toBe("refusal");
    }
  });

  it("classifies hardship before promise parsing", () => {
    const r = classifyIntent("Is month paisa nahi hai, next month pakka bhejunga");
    expect(r.intent).toBe("hardship");
  });

  it("classifies ready_to_pay", () => {
    expect(classifyIntent("Theek hai, link par pay kar raha hoon").intent).toBe(
      "ready_to_pay",
    );
  });

  it("classifies promises with parseable dates (English and Hinglish)", () => {
    expect(classifyIntent("Friday tak kar dunga").intent).toBe("promise");
    expect(classifyIntent("Kal transfer karta hoon").intent).toBe("promise");
    expect(classifyIntent("Next week pakka denge").intent).toBe("promise");
  });
});

describe("conversation engine — branching", () => {
  it("dispute escalates the outcome override and stops the conversation", () => {
    const result = runConversation(
      makeRecord(),
      "failed",
      0.9,
      NOW,
      noRand,
      { forcedTurns: [{ intent: "dispute", text: "Ye charge galat hai" }] },
    );
    expect(result.conversation.resolution).toBe("escalated_dispute");
    expect(result.outcomeOverride?.outcome).toBe("escalated");
    expect(result.newPromise).toBeUndefined();
    expect(result.conversation.turns).toHaveLength(2);
  });

  it("refusal ends the conversation politely without outcome change", () => {
    const result = runConversation(
      makeRecord(),
      "failed",
      0.9,
      NOW,
      noRand,
      { forcedTurns: [{ intent: "refusal", text: "Payment nahi karunga" }] },
    );
    expect(result.conversation.resolution).toBe("refused");
    expect(result.outcomeOverride).toBeUndefined();
  });

  it("ready_to_pay with lucky roll flips failed → recovered with bonus probability", () => {
    const record = makeRecord({
      ground_truth: {
        recoverable: true,
        recommended_intervention: "",
        expected_recovery_probability: 0.5,
        max_retries_allowed: 1,
        recoverable_amount: 249900,
      },
    });
    const result = runConversation(record, "failed", 0.5, NOW, () => 0.01, {
      forcedTurns: [{ intent: "ready_to_pay", text: "Abhi try karta hoon" }],
    });
    expect(result.conversation.resolution).toBe("retry_recovered");
    expect(result.outcomeOverride?.outcome).toBe("recovered");
    expect(result.outcomeOverride?.amountRecoveredPaise).toBe(249900);
  });

  it("ready_to_pay retry can also fail honestly", () => {
    const result = runConversation(makeRecord(), "failed", 0.3, NOW, () => 0.99, {
      forcedTurns: [{ intent: "ready_to_pay", text: "Abhi try karta hoon" }],
    });
    expect(result.conversation.resolution).toBe("retry_failed");
    expect(result.outcomeOverride).toBeUndefined();
  });

  it("retry success is bounded by the +15% bonus (never exceeds 0.9)", () => {
    const record = makeRecord({
      ground_truth: {
        recoverable: true,
        recommended_intervention: "",
        expected_recovery_probability: 0.85,
        max_retries_allowed: 1,
        recoverable_amount: 100,
      },
    });
    let maxRollSeen = 0;
    let allSucceeded = true;
    for (let i = 0; i < 50; i++) {
      const roll = i / 50;
      const r = runConversation(record, "failed", 0.85, NOW, () => roll, {
        forcedTurns: [{ intent: "ready_to_pay", text: "Abhi try karta hoon" }],
      });
      if (r.conversation.resolution !== "retry_recovered") allSucceeded = false;
      maxRollSeen = Math.max(maxRollSeen, roll);
    }
    expect(allSucceeded).toBe(false);
    expect(maxRollSeen).toBeGreaterThan(0.89);
  });

  it("hardship offers a payment plan exactly once", () => {
    const result = runConversation(makeRecord(), "failed", 0.5, NOW, noRand, {
      forcedTurns: [{ intent: "hardship", text: "Is month paisa nahi hai" }],
    });
    expect(result.conversation.resolution).toBe("payment_plan_offered");
    const planTurns = result.conversation.turns.filter((t) =>
      t.text.includes("payment plan"),
    );
    expect(planTurns).toHaveLength(1);
  });

  it("creates a real PromiseRecord from parsed chat reply", () => {
    const result = runConversation(makeRecord(), "failed", 0.5, NOW, noRand, {
      forcedTurns: [{ intent: "promise", text: "Friday tak kar dunga" }],
    });
    expect(result.conversation.resolution).toBe("promise_created");
    expect(result.newPromise).toBeDefined();
    expect(result.newPromise!.promise_id).toBe("prom_conv_rec_conv");
    expect(result.newPromise!.promise_source).toBe("chat");
    expect(result.newPromise!.status).toBe("pending");
    const due = new Date(result.newPromise!.due_date);
    expect(due.getUTCDay()).toBe(5);
  });

  it("captures promised amount when the customer states one", () => {
    const result = runConversation(makeRecord(), "failed", 0.5, NOW, noRand, {
      forcedTurns: [
        { intent: "promise", text: "Kal ₹25,000 transfer karta hoon" },
      ],
    });
    expect(result.newPromise?.promised_amount).toBe(2500000);
  });

  it("does not duplicate promises when one is already tracked", () => {
    const record = makeRecord({
      promise_history: [
        {
          promise_id: "prom_existing",
          record_id: "rec_conv",
          customer_id: "cus_c1",
          merchant_id: "mer_x",
          promised_amount: 249900,
          promised_date: new Date(NOW - 5 * 86400000).toISOString(),
          due_date: new Date(NOW + 3 * 86400000).toISOString(),
          promise_source: "sms",
          status: "pending",
          renewal_count: 0,
          reminders_sent: [],
          created_at: new Date(NOW - 5 * 86400000).toISOString(),
          updated_at: new Date(NOW - 5 * 86400000).toISOString(),
        },
      ],
    } as Partial<SyntheticRecord>);
    const result = runConversation(makeRecord({ promise_history: record.promise_history }), "failed", 0.5, NOW, noRand, {
      forcedTurns: [{ intent: "promise", text: "Friday tak kar dunga" }],
    });
    expect(result.conversation.resolution).toBe("promise_noted_existing");
    expect(result.newPromise).toBeUndefined();
  });

  it("caps at 2 customer turns then hands off to manual review", () => {
    const result = runConversation(makeRecord(), "failed", 0.5, NOW, noRand, {
      forcedTurns: [
        { intent: "promise", text: "pakka" },
        { intent: "promise", text: "kar dunga pakka pakka" },
      ],
    });
    const customerTurns = result.conversation.turns.filter(
      (t) => t.speaker === "customer",
    ).length;
    expect(customerTurns).toBe(2);
    expect(result.conversation.resolution).toBe("unresolved_manual");
  });

  it("follow-up turn after unparseable date gets parsed by the parser", () => {
    const result = runConversation(makeRecord(), "failed", 0.5, NOW, noRand, {
      forcedTurns: [
        { intent: "promise", text: "pakka kar dunga" },
        { intent: "promise", text: "Friday pakka" },
      ],
    });
    expect(result.conversation.resolution).toBe("promise_created");
    expect(result.conversation.turns.filter((t) => t.speaker === "customer")).toHaveLength(2);
    expect(
      result.conversation.turns.some((t) => t.text.includes("Exact date")),
    ).toBe(true);
  });
});
