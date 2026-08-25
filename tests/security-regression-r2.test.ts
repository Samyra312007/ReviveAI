import { describe, it, expect } from "vitest";
import { simulateScenario, clampOverrides } from "@/lib/simulator/service";
import { loadBatchDataset } from "@/lib/batch/data-loader";
import { openDb, initSchema } from "@/lib/db";
import { generateTuningProposals } from "@/lib/council/analyzer";
import {
  DEFAULT_GUARDRAIL_CONFIG,
  resolveGuardrailConfig,
} from "@/lib/guardrails/config";

const TMP_DB = "/tmp/opencode/poison-test.db";

async function setupPoisonedDb() {
  const fs = await import("node:fs");
  if (fs.existsSync(TMP_DB)) fs.rmSync(TMP_DB);
  const db = openDb(TMP_DB);
  initSchema(db);
  db.prepare(`
    INSERT INTO records (
      record_id, merchant_id, customer_id, type, subcategory, amount,
      failure_timestamp, days_since_last_order, customer_email, customer_phone,
      customer_name, customer_segment, previous_payments, avg_order_value,
      failure_reason, ground_truth
    ) VALUES (
      'rec_evil', 'mer_x', 'cus_evil', 'payment_failure', 'insufficient_funds',
      249900, '2026-08-01T00:00:00Z', 1, 'evil@x.com', '+919876543210',
      'Evil User', 'mid_value', 3, 100000, 'hostile row', '{{{not json'
    )
  `).run();
  db.prepare(`
    INSERT INTO promises (
      promise_id, record_id, customer_id, merchant_id, promised_amount,
      promised_date, due_date, promise_source, status, renewal_count,
      reminders_sent, created_at, updated_at
    ) VALUES (
      'prom_evil', 'rec_evil', 'cus_evil', 'mer_x', 100,
      '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z', 'sms', 'pending', 0,
      '{broken json', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'
    )
  `).run();
  db.close();
}

describe("R2 — poisoned dataset resilience (VULN-R2-002)", () => {
  it("loadBatchDataset survives malformed ground_truth and reminders_sent", async () => {
    await setupPoisonedDb();
    const dataset = loadBatchDataset(TMP_DB);
    expect(dataset).not.toBeNull();
    expect(dataset!.records).toHaveLength(1);
    const evil = dataset!.records[0] as never as {
      ground_truth: { recoverable_amount: number };
    };
    expect(evil.ground_truth.recoverable_amount).toBe(0);
    const promise = dataset!.promisesByRecordId.get("rec_evil") as never as {
      reminders_sent: unknown[];
    };
    expect(promise.reminders_sent).toEqual([]);
    await import("node:fs").then((fs) => fs.rmSync(TMP_DB, { force: true }));
  });

  it("safeJsonParse falls back on garbage and empty input", async () => {
    const { safeJsonParse } = await import("@/lib/db/json");
    expect(safeJsonParse("{{{", "fb")).toBe("fb");
    expect(safeJsonParse(null, "fb")).toBe("fb");
    expect(safeJsonParse(undefined, [])).toEqual([]);
    expect(safeJsonParse('{"ok":true}', null)).toEqual({ ok: true });
  });
});

describe("R2 — simulator determinism & aliasing hardening (VULN-R2-001)", () => {
  it("consecutive identical simulations return identical summaries", async () => {
    const a = await simulateScenario({});
    const b = await simulateScenario({});
    expect(a.body.baseline).toEqual(b.body.baseline);
    expect(a.body.scenario).toEqual(b.body.scenario);
  });

  it("promise objects attached to records are cloned per call, not shared", async () => {
    const { attachPromiseHistories } = await import("@/lib/batch/data-loader");
    const d1 = loadBatchDataset();
    const d2 = loadBatchDataset();
    const r1 = attachPromiseHistories(d1!)[0];
    const r2 = attachPromiseHistories(d2!)[0];
    if (r1.promise_history?.length && r2.promise_history?.length) {
      expect(r1.promise_history[0]).not.toBe(r2.promise_history[0]);
    }
  });
});

describe("R2 — clamping invariants (config poisoning defense)", () => {
  it("every council-proposable value stays inside simulator clamp ranges", () => {
    const tweaks: [string, number][] = [
      ["B3", DEFAULT_GUARDRAIL_CONFIG.checkoutNudgeWindowHours * 2],
      ["B4", DEFAULT_GUARDRAIL_CONFIG.subscriptionRetryWindowDays + 3],
      ["C4", DEFAULT_GUARDRAIL_CONFIG.approvalThresholdPaise + 25_00_000],
      ["D2", DEFAULT_GUARDRAIL_CONFIG.dailyVolumeCapPaise * 2],
      ["A1", DEFAULT_GUARDRAIL_CONFIG.maxRetriesPerRecord + 1],
      ["B2", Math.max(DEFAULT_GUARDRAIL_CONFIG.cooldownHours - 2, 1)],
      ["B1", DEFAULT_GUARDRAIL_CONFIG.quietStartHourIst + 1],
    ];

    for (const [ruleId, proposed] of tweaks) {
      const parameter = parameterForRule(ruleId);
      const { rejected } = clampOverrides({ [parameter]: proposed });
      expect(rejected, `${ruleId} proposal out of sim range`).toEqual([]);
    }

    function parameterForRule(ruleId: string): string {
      const map: Record<string, string> = {
        B3: "checkoutNudgeWindowHours",
        B4: "subscriptionRetryWindowDays",
        C4: "approvalThresholdPaise",
        D2: "dailyVolumeCapPaise",
        A1: "maxRetriesPerRecord",
        B2: "cooldownHours",
        B1: "quietStartHourIst",
      };
      return map[ruleId];
    }
  });

  it("D2 proposals have an absolute ceiling", () => {
    const tightConfig = resolveGuardrailConfig({
      dailyVolumeCapPaise: 100000000,
    });
    const proposals = generateTuningProposals(
      [
        { rule_id: "D2", record_id: "r1", recovery_probability: 0.9, recoverable_amount_paise: 100 },
        { rule_id: "D2", record_id: "r2", recovery_probability: 0.9, recoverable_amount_paise: 100 },
      ],
      {
        config: tightConfig,
        pendingParameters: new Set(),
        overriddenParameters: new Set(),
        rejectedParameters: new Set(),
        nowMs: Date.now(),
      },
    );
    if (proposals.length > 0) {
      expect(proposals[0].proposed_value).toBeLessThanOrEqual(200000000);
    }
  });
});
