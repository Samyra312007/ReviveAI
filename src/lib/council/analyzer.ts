import { GuardrailConfig } from "@/lib/guardrails/config";
import { TuningProposalInsert } from "@/lib/db";

export interface BlockObservation {
  rule_id: string;
  record_id: string;
  recovery_probability: number;
  recoverable_amount_paise: number;
}

export interface ProposalContext {
  config: GuardrailConfig;
  pendingParameters: Set<string>;
  overriddenParameters: Set<string>;
  rejectedParameters: Set<string>;
  nowMs: number;
}

const MIN_BLOCK_COUNT = 1;
const MIN_AVG_PROBABILITY = 0.5;
const MAX_OBSERVATIONS_PER_RULE = 25;

interface ParameterTweak {
  parameter: keyof GuardrailConfig;
  propose: (current: number) => number | null;
  describe: (value: number) => string;
}

const TWEAKS: Record<string, ParameterTweak> = {
  B1: {
    parameter: "quietStartHourIst",
    propose: (c) => (c < 23 ? c + 1 : null),
    describe: (v) => `quiet hours ${v}:00–08:00 IST`,
  },
  B2: {
    parameter: "cooldownHours",
    propose: (c) => Math.max(c - 2, 1),
    describe: (v) => `${v}h cooldown`,
  },
  B3: {
    parameter: "checkoutNudgeWindowHours",
    propose: (c) => Math.min(c * 2, 8),
    describe: (v) => `${v}h nudge window`,
  },
  B4: {
    parameter: "subscriptionRetryWindowDays",
    propose: (c) => Math.min(c + 3, 14),
    describe: (v) => `${v}-day retry window`,
  },
  C4: {
    parameter: "approvalThresholdPaise",
    propose: (c) => Math.min(c + 25_00_000, 200000 * 100),
    describe: (v) => `₹${(v / 100).toLocaleString("en-IN")} approval cap`,
  },
  D2: {
    parameter: "dailyVolumeCapPaise",
    propose: (c) => Math.min(c * 2, 200000000),
    describe: (v) => `₹${(v / 100).toLocaleString("en-IN")} daily volume cap`,
  },
  A1: {
    parameter: "maxRetriesPerRecord",
    propose: (c) => Math.min(c + 1, 4),
    describe: (v) => `${v} retries per record`,
  },
};

let counter = 0;

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function generateTuningProposals(
  blocks: BlockObservation[],
  ctx: ProposalContext,
): TuningProposalInsert[] {
  const byRule = new Map<string, BlockObservation[]>();
  for (const b of blocks) {
    if (!byRule.has(b.rule_id)) byRule.set(b.rule_id, []);
    byRule.get(b.rule_id)!.push(b);
  }

  const proposals: TuningProposalInsert[] = [];

  for (const [ruleId] of byRule) {
    const tweak = TWEAKS[ruleId];
    if (!tweak) continue;

    const parameter = tweak.parameter;
    if (ctx.pendingParameters.has(parameter)) continue;
    if (ctx.overriddenParameters.has(parameter)) continue;
    if (ctx.rejectedParameters.has(parameter)) continue;

    const observations = byRule.get(ruleId)!.slice(0, MAX_OBSERVATIONS_PER_RULE);
    const blockedCount = observations.length;
    if (blockedCount < MIN_BLOCK_COUNT) continue;

    const avgProb =
      observations.reduce((s, o) => s + o.recovery_probability, 0) /
      blockedCount;
    if (avgProb <= MIN_AVG_PROBABILITY) continue;

    const current = ctx.config[parameter];
    const proposed = tweak.propose(current);
    if (proposed === null || proposed === current) continue;

    const blockedAmount = observations.reduce(
      (s, o) => s + o.recoverable_amount_paise,
      0,
    );

    counter++;
    proposals.push({
      proposal_id: `tun_${ruleId}_${Date.now()}_${counter}`,
      rule_id: ruleId,
      parameter,
      current_value: current,
      proposed_value: proposed,
      current_display: tweak.describe(current),
      proposed_display: tweak.describe(proposed),
      rationale: `[${ruleId}] blocked ${blockedCount} records with high recovery likelihood (avg p=${avgProb.toFixed(2)}, ${formatInr(blockedAmount)} at stake). Human review requested: adjust to ${tweak.describe(proposed)}.`,
      blocked_count: blockedCount,
      blocked_recoverable_paise: blockedAmount,
      avg_recovery_probability: Math.round(avgProb * 100) / 100,
      created_at: new Date(ctx.nowMs).toISOString(),
    });
  }

  return proposals.sort((a, b) => b.blocked_count - a.blocked_count);
}
