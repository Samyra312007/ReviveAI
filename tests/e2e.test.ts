import { describe, it, expect } from "vitest";
import { runBatch } from "@/lib/agent/core";
import { RazorpayExecutor } from "@/lib/razorpay/client";
import { generateBatch } from "@/lib/data/generator";
import { InMemoryAuditWriter } from "@/lib/audit/logger";

describe("end-to-end batch", () => {
  const { records } = generateBatch(42);
  const NOW = Date.UTC(2026, 7, 25, 6, 0);

  it("processes every record exactly once with an audit entry", async () => {
    const writer = new InMemoryAuditWriter();
    const executor = new RazorpayExecutor();
    const result = await runBatch(records, {
      seed: 42,
      now: NOW,
      executor,
    });
    void writer;

    expect(result.decisions).toHaveLength(records.length);
    expect(result.auditEntries).toHaveLength(records.length);
    expect(new Set(result.auditEntries.map((e) => e.record_id)).size).toBe(
      records.length,
    );
  });

  it("never recovers control group records (zero false positives)", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const controlOutcomes = result.decisions.filter(
      (d) => d.record.type === "control",
    );
    for (const d of controlOutcomes) {
      expect(d.outcome).toBe("skipped");
      expect(d.amountRecovered).toBe(0);
    }
  });

  it("never intervenes on fraud holds", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const fraud = result.decisions.filter(
      (d) => d.record.subcategory === "fraud_hold",
    );
    expect(fraud.length).toBeGreaterThan(0);
    for (const d of fraud) {
      expect(d.amountRecovered).toBe(0);
      expect(d.outcome === "recovered" || d.outcome === "failed").toBe(false);
      if (d.strategy) {
        expect(d.strategy.action).toBe("SKIP");
      }
    }
  });

  it("recovers a meaningful share of at-risk revenue (>40%)", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    expect(result.report.recovery.recovered_paise).toBeGreaterThan(0);
    expect(result.report.hero.recovery_rate_pct).toBeGreaterThan(40);
  });

  it("marks simulated API calls in the audit trail", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const executed = result.auditEntries.filter((e) => e.api_call);
    expect(executed.length).toBe(result.report.operational.records_intervened);
    expect(executed.every((e) => e.api_call!.simulated === true)).toBe(true);
  });

  it("audit entries carry detection confidence, strategy and reasoning", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    for (const e of result.auditEntries) {
      expect(e.detected_category).toBeTruthy();
      expect(e.detection_confidence).toBeGreaterThanOrEqual(0);
      if (e.outcome === "recovered" || e.outcome === "failed") {
        expect(e.selected_strategy).toBeTruthy();
        expect(e.guardrail_checks).not.toBeNull();
        expect(e.guardrail_checks!.length).toBeGreaterThan(0);
      }
    }
  });

  it("produces a complete report with all sections and honest exceptions", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    const report = result.report;

    expect(report.hero.at_risk_display).toMatch(/^₹[\d,]+$/);
    expect(report.recovery_by_category.length).toBeGreaterThan(3);
    expect(report.accuracy.overall.precision).not.toBeNull();
    expect(report.operational.total_records).toBe(150);
    expect(report.cost_benefit.intervention_cost_paise).toBeGreaterThan(0);
    expect(report.cost_benefit.roi_multiple).toBeGreaterThan(1);
    expect(Array.isArray(report.exceptions)).toBe(true);

    const accounted =
      report.operational.records_intervened +
      report.operational.records_skipped +
      report.operational.records_escalated +
      report.operational.records_blocked;
    expect(accounted).toBe(150);
  });

  it("respects the batch intervention cap of 80%", async () => {
    const result = await runBatch(records, { seed: 42, now: NOW });
    expect(result.state.interventionCount).toBeLessThanOrEqual(120);
  });

  it("is deterministic given the same seed", async () => {
    const a = await runBatch(records, { seed: 99, now: NOW });
    const b = await runBatch(records, { seed: 99, now: NOW });
    expect(a.report.recovery.recovered_paise).toBe(b.report.recovery.recovered_paise);
    expect(a.report.hero.recovery_rate_pct).toBe(b.report.hero.recovery_rate_pct);
  });
});
