import { describe, it, expect } from "vitest";
import { detectRecord } from "@/lib/detection/engine";
import { SyntheticRecord } from "@/lib/data/schema";

const NOW = Date.parse("2026-08-25T12:00:00Z");

function makeRecord(overrides: Partial<SyntheticRecord>): SyntheticRecord {
  return {
    record_id: "rec_test",
    merchant_id: "mer_x",
    customer_id: "cus_x",
    type: "payment_failure",
    subcategory: "insufficient_funds",
    amount: 249900,
    currency: "INR",
    failure_timestamp: new Date(NOW - 3600 * 1000).toISOString(),
    days_since_last_order: 3,
    customer_email: "a@gmail.com",
    customer_phone: "+919876543210",
    customer_name: "Test User",
    customer_segment: "mid_value",
    previous_payments: 5,
    avg_order_value: 200000,
    failure_reason: "Insufficient funds in account",
    voice_opt_in: true,
    preferred_language: "hinglish",
    ground_truth: {
      recoverable: true,
      recommended_intervention: "RETRY_IN_24H",
      expected_recovery_probability: 0.7,
      max_retries_allowed: 2,
      recoverable_amount: 249900,
    },
    ...overrides,
  };
}

describe("detection engine", () => {
  it("classifies payment failures by root cause with high confidence", () => {
    const result = detectRecord(makeRecord({}), NOW);
    expect(result.detected_category).toBe("payment_failure");
    expect(result.detected_subcategory).toBe("insufficient_funds");
    expect(result.detection_confidence).toBeGreaterThan(0.7);
    expect(result.route).toBe("intervene");
  });

  it("classifies network timeout", () => {
    const result = detectRecord(
      makeRecord({ failure_reason: "Network timeout at payment gateway" }),
      NOW,
    );
    expect(result.detected_subcategory).toBe("network_timeout");
  });

  it("classifies fraud hold", () => {
    const result = detectRecord(
      makeRecord({ failure_reason: "Transaction flagged as potential fraud" }),
      NOW,
    );
    expect(result.detected_subcategory).toBe("fraud_hold");
    expect(result.detection_confidence).toBeGreaterThan(0.7);
  });

  it("classifies checkout abandonment using time window features", () => {
    const result = detectRecord(
      makeRecord({
        type: "checkout_abandonment",
        subcategory: "payment_page_exit",
        failure_reason: "Customer exited at payment page",
        recovery_window_hours: 0.2,
        days_since_last_order: 0,
      }),
      NOW,
    );
    expect(result.detected_category).toBe("checkout_abandonment");
    expect(result.detected_subcategory).toBe("payment_page_exit");
    expect(result.route).toBe("intervene");
  });

  it("classifies subscription failures with lifecycle stage corroboration", () => {
    const result = detectRecord(
      makeRecord({
        type: "subscription_failure",
        subcategory: "mandate_not_triggered",
        failure_reason: "Mandate not triggered by bank",
        lifecycle_stage: "retry_window",
        amount: 99900,
      }),
      NOW,
    );
    expect(result.detected_category).toBe("subscription_failure");
    expect(result.detected_subcategory).toBe("mandate_not_triggered");
  });

  it("classifies overdue invoices into aging buckets", () => {
    const result = detectRecord(
      makeRecord({
        type: "overdue_invoice",
        subcategory: "14_day_late",
        failure_reason: "Invoice 14 days overdue",
        amount: 4500000,
      }),
      NOW,
    );
    expect(result.detected_category).toBe("overdue_invoice");
    expect(result.detected_subcategory).toBe("14_day_late");
    expect(result.route).toBe("intervene");
  });

  it("routes healthy control records to no_action", () => {
    const result = detectRecord(
      makeRecord({
        type: "control",
        subcategory: "healthy",
        failure_reason: "No issue — healthy paying customer",
      }),
      NOW,
    );
    expect(result.detected_category).toBe("control");
    expect(result.route).toBe("no_action");
  });

  it("skips unclassifiable records with low confidence", () => {
    const result = detectRecord(
      makeRecord({ failure_reason: "Something weird happened" }),
      NOW,
    );
    expect(result.detected_category).toBe("unknown");
    expect(result.route).toBe("skip");
  });

  it("skips stale records outside recovery window", () => {
    const result = detectRecord(
      makeRecord({
        failure_timestamp: new Date(NOW - 100 * 3600 * 1000).toISOString(),
      }),
      NOW,
    );
    expect(result.feasible).toBe(false);
    expect(result.feasibility_reason).toContain("window closed");
    expect(result.route).toBe("skip");
  });

  it("skips amounts too small for cost-effective recovery", () => {
    const result = detectRecord(makeRecord({ amount: 5000 }), NOW);
    expect(result.feasible).toBe(false);
    expect(result.feasibility_reason).toContain("too small");
  });

  it("computes urgency in [0,1] and higher for recent high-value records", () => {
    const freshHighValue = detectRecord(
      makeRecord({ amount: 4000000, failure_timestamp: new Date(NOW - 600000).toISOString() }),
      NOW,
    );
    const oldLowValue = detectRecord(
      makeRecord({
        amount: 20000,
        failure_timestamp: new Date(NOW - 60 * 3600 * 1000).toISOString(),
        ground_truth: {
          recoverable: true,
          recommended_intervention: "RETRY_IN_48H",
          expected_recovery_probability: 0.2,
          max_retries_allowed: 1,
          recoverable_amount: 20000,
        },
      }),
      NOW,
    );
    expect(freshHighValue.urgency_score).toBeLessThanOrEqual(1);
    expect(freshHighValue.urgency_score).toBeGreaterThan(oldLowValue.urgency_score);
  });
});
