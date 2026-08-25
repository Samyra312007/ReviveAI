import { RecordDecision } from "@/lib/audit/logger";
import { computeAccuracy } from "./accuracy";
import { recoveryTotals, recoveryByCategory } from "./recovery";
import {
  BatchReport,
  CostBenefit,
  formatInr,
  computeOperational,
  computeCostBenefit,
  computePrevention,
} from "./metrics";

export function buildReport(
  decisions: RecordDecision[],
  seed: number,
  processingTimeMs: number,
): BatchReport {
  const accuracy = computeAccuracy(decisions);
  const recovery = recoveryTotals(decisions);
  const byCategory = recoveryByCategory(decisions);
  const operational = computeOperational(decisions, processingTimeMs);
  const costBenefit = computeCostBenefit(decisions);

  const blocksByRule: Record<string, number> = {};
  let totalBlocks = 0;
  for (const d of decisions) {
    if (d.outcome !== "blocked") continue;
    totalBlocks++;
    for (const check of d.guardrailChecks ?? []) {
      if (!check.passed) {
        blocksByRule[check.rule_id] = (blocksByRule[check.rule_id] ?? 0) + 1;
      }
    }
  }

  const exceptions = decisions
    .filter(
      (d) =>
        d.outcome === "escalated" ||
        d.outcome === "blocked" ||
        d.detection.route === "skip" ||
        Boolean(d.error),
    )
    .map((d) => ({
      record_id: d.record.record_id,
      type: d.record.type,
      reason: d.error
        ? `API error: ${d.error.message}`
        : d.outcome === "blocked"
          ? d.guardrailChecks?.find((c) => !c.passed)?.block_reason ?? "Guardrail block"
          : d.detection.route_reason,
      outcome: d.outcome,
    }));

  return {
    generated_at: new Date().toISOString(),
    batch_id: `batch_${new Date().toISOString().slice(0, 10)}_seed${seed}`,
    seed,
    hero: {
      recovered_display: formatInr(recovery.recovered_paise),
      at_risk_display: formatInr(recovery.at_risk_paise),
      recovery_rate_pct: Math.round(recovery.recovery_rate * 1000) / 10,
      roi_display:
        costBenefit.roi_multiple !== null ? `${costBenefit.roi_multiple}x` : "N/A",
    },
    recovery,
    recovery_by_category: byCategory,
    accuracy,
    guardrails: {
      total_blocks: totalBlocks,
      block_rate:
        operational.total_records > 0
          ? Math.round((totalBlocks / operational.total_records) * 1000) / 10
          : 0,
      blocks_by_rule: blocksByRule,
    },
    exceptions,
    operational,
    cost_benefit: costBenefit satisfies CostBenefit,
    prevention: computePrevention(decisions),
  };
}
