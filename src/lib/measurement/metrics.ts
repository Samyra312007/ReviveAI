import { RecordDecision, AuditOutcome } from "@/lib/audit/logger";
import { AccuracyReport } from "./accuracy";
import { RecoveryTotals, CategoryRecovery } from "./recovery";

export const CHANNEL_UNIT_COSTS_PAISE: Record<string, number> = {
  CART_REMINDER_WHATSAPP: 40,
  SMS_PAYMENT_LINK: 20,
  GENTLE_REMINDER: 20,
  EMAIL_CART_RECOVERY: 5,
  FIRM_NOTICE: 5,
  PAYMENT_PLAN_OFFER: 5,
  RETRY_IN_24H: 50,
  RETRY_IN_48H: 50,
  RETRY_IMMEDIATELY: 50,
  REQUEST_CARD_UPDATE: 50,
  CARD_UPDATE_REQUEST: 50,
  MANDATE_RETRY: 50,
};

export interface OperationalMetrics {
  total_records: number;
  records_intervened: number;
  records_skipped: number;
  records_escalated: number;
  records_blocked: number;
  api_calls_made: number;
  api_errors: number;
  processing_time_ms: number;
}

export interface CostBenefit {
  intervention_cost_paise: number;
  net_recovered_paise: number;
  roi_multiple: number | null;
}

export interface BatchReport {
  generated_at: string;
  batch_id: string;
  seed: number;
  hero: {
    recovered_display: string;
    at_risk_display: string;
    recovery_rate_pct: number;
    roi_display: string;
  };
  recovery: RecoveryTotals;
  recovery_by_category: CategoryRecovery[];
  accuracy: AccuracyReport;
  guardrails: {
    total_blocks: number;
    block_rate: number;
    blocks_by_rule: Record<string, number>;
  };
  exceptions: {
    record_id: string;
    type: string;
    reason: string;
    outcome: AuditOutcome;
  }[];
  operational: OperationalMetrics;
  cost_benefit: CostBenefit;
}

export function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function computeOperational(
  decisions: RecordDecision[],
  processingTimeMs: number,
): OperationalMetrics {
  let intervened = 0;
  let skipped = 0;
  let escalated = 0;
  let blocked = 0;
  let apiCalls = 0;
  let errors = 0;

  for (const d of decisions) {
    if (d.outcome === "recovered" || d.outcome === "failed") intervened++;
    else if (d.outcome === "skipped") skipped++;
    else if (d.outcome === "escalated") escalated++;
    else if (d.outcome === "blocked") blocked++;
    if (d.apiCall) apiCalls++;
    if (d.error) errors++;
  }

  return {
    total_records: decisions.length,
    records_intervened: intervened,
    records_skipped: skipped,
    records_escalated: escalated,
    records_blocked: blocked,
    api_calls_made: apiCalls,
    api_errors: errors,
    processing_time_ms: Math.round(processingTimeMs),
  };
}

export function computeCostBenefit(decisions: RecordDecision[]): CostBenefit {
  let cost = 0;
  let recovered = 0;
  for (const d of decisions) {
    if (d.strategy && CHANNEL_UNIT_COSTS_PAISE[d.strategy.action] !== undefined) {
      cost += CHANNEL_UNIT_COSTS_PAISE[d.strategy.action];
      if (!d.apiCall?.simulated) cost += 25;
    }
    recovered += d.amountRecovered;
  }
  const net = recovered - cost;
  return {
    intervention_cost_paise: cost,
    net_recovered_paise: net,
    roi_multiple: cost > 0 ? Math.round((net / cost) * 10) / 10 : null,
  };
}
