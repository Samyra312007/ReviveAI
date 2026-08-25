import { SyntheticRecord } from "@/lib/data/schema";
import { DEFAULT_GUARDRAIL_CONFIG, GuardrailConfig, resolveGuardrailConfig } from "@/lib/guardrails/config";

export interface CustomerContext {
  customerValue: "high" | "mid" | "low";
  clvPaise: number;
  retryCount: number;
  lastContactAt: Date | null;
  lifecycleStage?: string;
}

export interface BatchState {
  now: number;
  config: GuardrailConfig;
  retriesPerRecord: Map<string, number>;
  contactsPerCustomerDay: Map<string, number>;
  lastContactAt: Map<string, number>;
  smsToday: Map<string, number>;
  voiceThisWeek: Map<string, number>;
  voiceAttempts: Map<string, number>;
  promiseRenewals: Map<string, number>;
  interventionCount: number;
  attemptedVolumePaise: number;
  dndPreferences: Set<string>;
  totalRecords: number;
}

export function createBatchState(
  totalRecords: number,
  now: number = Date.now(),
  guardrailConfig?: Partial<GuardrailConfig>,
): BatchState {
  return {
    now,
    config: resolveGuardrailConfig(guardrailConfig),
    retriesPerRecord: new Map(),
    contactsPerCustomerDay: new Map(),
    lastContactAt: new Map(),
    smsToday: new Map(),
    voiceThisWeek: new Map(),
    voiceAttempts: new Map(),
    promiseRenewals: new Map(),
    interventionCount: 0,
    attemptedVolumePaise: 0,
    dndPreferences: new Set(),
    totalRecords,
  };
}

export function buildContext(
  record: SyntheticRecord,
  state: BatchState,
): CustomerContext {
  const clvPaise = record.previous_payments * record.avg_order_value + record.amount;
  return {
    customerValue: record.customer_segment === "high_value"
      ? "high"
      : record.customer_segment === "mid_value"
        ? "mid"
        : "low",
    clvPaise,
    retryCount: state.retriesPerRecord.get(record.record_id) ?? 0,
    lastContactAt: state.lastContactAt.has(record.customer_id)
      ? new Date(state.lastContactAt.get(record.customer_id)!)
      : null,
    lifecycleStage: record.lifecycle_stage,
  };
}

export function toIstParts(ms: number): { hour: number; dayKey: string; weekKey: string } {
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  const hour = ist.getUTCHours();
  const dayKey = ist.toISOString().slice(0, 10);
  const weekStart = new Date(ist);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const weekKey = weekStart.toISOString().slice(0, 10);
  return { hour, dayKey, weekKey };
}
