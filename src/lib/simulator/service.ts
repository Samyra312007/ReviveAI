import { GuardrailConfig } from "@/lib/guardrails/config";
import { runBatch } from "@/lib/agent/core";
import { loadBatchDataset, attachPromiseHistories } from "@/lib/batch/data-loader";

const SERVER_SEED = 42;
const SERVER_NOW = Date.UTC(2026, 7, 25, 6, 0);

type NumericRange = { min: number; max: number; integer: boolean };

export const SIMULATION_RANGES: Record<keyof GuardrailConfig, NumericRange> = {
  maxRetriesPerRecord: { min: 0, max: 5, integer: true },
  maxRetriesPerCustomerDay: { min: 1, max: 6, integer: true },
  maxInterventionRatioPct: { min: 10, max: 100, integer: true },
  quietStartHourIst: { min: 18, max: 23, integer: true },
  quietEndHourIst: { min: 5, max: 12, integer: true },
  cooldownHours: { min: 1, max: 24, integer: true },
  checkoutNudgeWindowHours: { min: 0.5, max: 8, integer: false },
  subscriptionRetryWindowDays: { min: 3, max: 14, integer: true },
  maxSmsPerDay: { min: 1, max: 3, integer: true },
  approvalThresholdPaise: { min: 1000000, max: 20000000, integer: true },
  dailyVolumeCapPaise: { min: 10000000, max: 200000000, integer: true },
  roiCostRatioPct: { min: 5, max: 100, integer: true },
  maxVoicePerWeek: { min: 1, max: 3, integer: true },
};


export function clampOverrides(
  input: unknown,
): { clamped: Partial<GuardrailConfig>; rejected: string[] } {
  const clamped: Partial<GuardrailConfig> = {};
  const rejected: string[] = [];
  if (typeof input !== "object" || input === null) return { clamped, rejected };

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!(key in SIMULATION_RANGES)) {
      rejected.push(key);
      continue;
    }
    const range = SIMULATION_RANGES[key as keyof GuardrailConfig];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      rejected.push(key);
      continue;
    }
    let v = Math.min(range.max, Math.max(range.min, value));
    if (range.integer) v = Math.round(v);
    clamped[key as keyof GuardrailConfig] = v;
  }

  return { clamped, rejected };
}

export interface ScenarioSummary {
  effective_config: GuardrailConfig;
  recovered_paise: number;
  at_risk_paise: number;
  recovery_rate_pct: number;
  interventions: number;
  blocked: number;
  escalated: number;
  skipped: number;
  attempted_volume_paise: number;
  blocks_by_rule: Record<string, number>;
  by_category: {
    category: string;
    at_risk_paise: number;
    recovered_paise: number;
    rate: number;
  }[];
}

function summarize(runResult: Awaited<ReturnType<typeof runBatch>>): ScenarioSummary {
  const report = runResult.report;
  const op = report.operational;
  return {
    effective_config: runResult.state.config,
    recovered_paise: report.recovery.recovered_paise,
    at_risk_paise: report.recovery.at_risk_paise,
    recovery_rate_pct: report.hero.recovery_rate_pct,
    interventions: op.records_intervened,
    blocked: op.records_blocked,
    escalated: op.records_escalated,
    skipped: op.records_skipped,
    attempted_volume_paise: runResult.state.attemptedVolumePaise,
    blocks_by_rule: report.guardrails.blocks_by_rule,
    by_category: report.recovery_by_category.map((c) => ({
      category: c.category,
      at_risk_paise: c.at_risk_paise,
      recovered_paise: c.recovered_paise,
      rate: c.recovery_rate,
    })),
  };
}

let cachedDataset: Awaited<ReturnType<typeof loadBatchDataset>>;

async function getDataset() {
  if (!cachedDataset) {
    cachedDataset = loadBatchDataset();
    if (!cachedDataset) return null;
  }
  return cachedDataset;
}

export interface SimulationResult {
  status: number;
  body: Record<string, unknown>;
}

export async function simulateScenario(
  rawOverrides: unknown,
): Promise<SimulationResult> {
  const dataset = await getDataset();
  if (!dataset) {
    return { status: 404, body: { error: "No dataset. Run npm run generate-data first." } };
  }

  const { clamped, rejected } = clampOverrides(rawOverrides);
  const records = attachPromiseHistories(dataset);

  const baselineRun = await runBatch(records, {
    seed: SERVER_SEED,
    now: SERVER_NOW,
    enableVoice: false,
    enablePromises: false,
  });

  const scenarioRun = await runBatch(records, {
    seed: SERVER_SEED,
    now: SERVER_NOW,
    enableVoice: false,
    enablePromises: false,
    guardrailConfig: clamped,
  });

  return {
    status: 200,
    body: {
      ok: true,
      baseline: summarize(baselineRun),
      scenario: summarize(scenarioRun),
      applied_overrides: clamped,
      rejected_keys: rejected,
    },
  };
}
