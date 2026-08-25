import { describe, it, expect } from "vitest";
import {
  assessPreventionRisk,
  PREVENTION_SCORE_THRESHOLD,
} from "@/lib/prevention/scorer";
import { runBatch } from "@/lib/agent/core";
import { generateBatch } from "@/lib/data/generator";
import { computeAccuracy } from "@/lib/measurement/accuracy";
import { RecordDecision } from "@/lib/audit/logger";

const NOW = Date.UTC(2026, 7, 25, 6, 0);

import { SyntheticRecord } from "@/lib/data/schema";

function makeControl(overrides: Partial<SyntheticRecord> = {}): SyntheticRecord {
  return {
    record_id: "rec_ctl",
    customer_id: "cus_p1",
    merchant_id: "mer_x",
    type: "control" as const,
    subcategory: "healthy",
    amount: 2000000,
    currency: "INR" as const,
    failure_timestamp: new Date(NOW - 86400000).toISOString(),
    days_since_last_order: 3,
    customer_email: "a@gmail.com",
    customer_phone: "+919876543210",
    customer_name: "Test User",
    customer_segment: "high_value" as const,
    previous_payments: 20,
    avg_order_value: 150000,
    failure_reason: "No issue — healthy paying customer",
    voice_opt_in: true,
    preferred_language: "hinglish" as const,
    ground_truth: {
      recoverable: false,
      recommended_intervention: "NO_ACTION",
      expected_recovery_probability: 0,
      max_retries_allowed: 0,
      recoverable_amount: 0,
    },
    ...overrides,
  };
}

describe("prevention scorer", () => {
  it("flags thin-history dormant low-value customers", () => {
    const r = assessPreventionRisk(
      makeControl({
        previous_payments: 2,
        days_since_last_order: 40,
        customer_segment: "low_value",
      }),
    );
    expect(r.flagged).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(PREVENTION_SCORE_THRESHOLD);
    expect(r.reasoning).toContain("thin payment history");
    expect(r.reasoning).toContain("dormant");
  });

  it("never flags loyal high-value active customers", () => {
    const r = assessPreventionRisk(
      makeControl({
        previous_payments: 20,
        days_since_last_order: 2,
        customer_segment: "high_value",
      }),
    );
    expect(r.flagged).toBe(false);
  });

  it("only ever flags control-group records", () => {
    expect(assessPreventionRisk(makeControl()).flagged).toBe(false);
    const nonControl = assessPreventionRisk({
      ...makeControl(),
      type: "payment_failure",
    } as never);
    expect(nonControl.flagged).toBe(false);
  });

  it("is deterministic", () => {
    const record = makeControl({ previous_payments: 3, days_since_last_order: 30 });
    expect(assessPreventionRisk(record)).toEqual(assessPreventionRisk(record));
  });
});

describe("prevention in the batch pipeline", () => {
  const { records } = generateBatch(42, NOW);

  it("runs when enabled and flags a subset of control records", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const controls = result.decisions.filter((d) => d.record.type === "control");
    const prevented = controls.filter((d) => d.outcome === "prevented");
    const attempts = controls.filter(
      (d) => d.strategy?.action === "PREVENT_CARD_UPDATE",
    );

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.length).toBeLessThan(controls.length);
    for (const d of prevented) {
      expect(d.amountRecovered).toBe(0);
      expect(d.strategy?.reasoning).toContain("Churn-risk signals");
    }
  });

  it("can be disabled — all controls then stay skipped", async () => {
    const result = await runBatch(records, {
      seed: 42,
      now: NOW,
      enablePrevention: false,
    });
    const controls = result.decisions.filter((d) => d.record.type === "control");
    expect(
      controls.every((d) => d.outcome === "skipped"),
    ).toBe(true);
  });

  it("reports prevention metrics consistently with decisions", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const p = result.report.prevention!;
    const decisions = result.decisions;
    expect(p.attempts).toBe(
      decisions.filter((d) => d.strategy?.action === "PREVENT_CARD_UPDATE").length,
    );
    expect(p.prevented).toBe(
      decisions.filter((d) => d.outcome === "prevented").length,
    );
    expect(p.protected_amount_paise).toBeGreaterThan(0);
    expect(p.prevented).toBeLessThanOrEqual(p.attempts);
  });

  it("is deterministic per seed", async () => {
    const a = await runBatch(records, { seed: 42, now: NOW });
    const b = await runBatch(records, { seed: 42, now: NOW });
    expect(a.report.prevention!.protected_amount_paise).toBe(
      b.report.prevention!.protected_amount_paise,
    );
    expect(a.report.prevention!.attempts).toBe(b.report.prevention!.attempts);
  });
});

describe("accuracy integrity with prevention", () => {
  function decision(
    outcome: RecordDecision["outcome"],
    type: string,
  ): RecordDecision {
    return {
      record: {
        record_id: `rec_${type}_${outcome}`,
        type: type as never,
        ground_truth: { recoverable: false, recoverable_amount: 0 } as never,
      } as never,
      detection: {} as never,
      outcome,
      amountRecovered: 0,
    };
  }

  it("excludes prevention outcomes from FP/TN counting entirely", () => {
    const withoutPrevention = computeAccuracy([
      decision("skipped", "control"),
    ]);
    const withPrevention = computeAccuracy([
      decision("skipped", "control"),
      decision("prevented", "control"),
    ]);

    expect(withoutPrevention.overall.tn).toBe(1);
    expect(withoutPrevention.overall.fp).toBe(0);
    expect(withPrevention.overall.tn).toBe(1);
    expect(withPrevention.overall.fp).toBe(0);
  });

  it("prevented outcomes never count as false positives on controls", () => {
    const report = computeAccuracy([
      decision("prevented", "control"),
      decision("prevented", "control"),
      decision("prevented", "control"),
    ]);
    expect(report.overall.fp).toBe(0);
    expect(report.false_positive_rate).toBe(0);
  });
});
