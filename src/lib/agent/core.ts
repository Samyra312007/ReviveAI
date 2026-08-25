import { SyntheticRecord } from "@/lib/data/schema";
import { Rng } from "@/lib/data/seed";
import { detectRecord } from "@/lib/detection/engine";
import { buildContext, createBatchState, BatchState } from "./context";
import { selectStrategy, StrategyAction } from "./strategy";
import { evaluateGuardrails } from "@/lib/guardrails/engine";
import { GuardrailAuditEntry } from "@/lib/guardrails/engine";
import { RazorpayExecutor } from "@/lib/razorpay/client";
import {
  RecordDecision,
  AuditOutcome,
  AuditLogEntry,
  toAuditEntry,
} from "@/lib/audit/logger";
import { buildReport } from "@/lib/measurement/report";

const ESCALATION_ACTIONS: StrategyAction[] = [
  "ESCALATE_TO_MANUAL",
  "ESCALATE_TO_CHURN_PREVENTION",
  "ESCALATE_LEGAL",
];

export interface RunBatchOptions {
  seed?: number;
  now?: number;
  executor?: RazorpayExecutor;
}

export interface RunBatchResult {
  decisions: RecordDecision[];
  auditEntries: AuditLogEntry[];
  guardrailAudit: GuardrailAuditEntry[];
  state: BatchState;
  processingTimeMs: number;
  report: ReturnType<typeof buildReport>;
}

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function nextIstWindowStart(now: number): number {
  const shifted = now + IST_OFFSET_MS;
  const dayStart = Math.floor(shifted / 86400000) * 86400000;
  let target = dayStart + 8 * 3600 * 1000;
  if (target <= shifted) target += 86400000;
  return target - IST_OFFSET_MS;
}

export async function processRecord(
  record: SyntheticRecord,
  state: BatchState,
  executor: RazorpayExecutor,
  rng: Rng,
): Promise<{ decision: RecordDecision; guardrailAudit: GuardrailAuditEntry[] }> {
  const detection = detectRecord(record, state.now);

  if (detection.route === "no_action" || detection.route === "skip") {
    return {
      decision: { record, detection, outcome: "skipped", amountRecovered: 0 },
      guardrailAudit: [],
    };
  }

  if (detection.route === "escalate") {
    return {
      decision: { record, detection, outcome: "escalated", amountRecovered: 0 },
      guardrailAudit: [],
    };
  }

  const context = buildContext(record, state);
  const strategy = selectStrategy(record, context);

  if (
    strategy.action === "SKIP" ||
    strategy.action === "NO_ACTION" ||
    ESCALATION_ACTIONS.includes(strategy.action)
  ) {
    const outcome: AuditOutcome = ESCALATION_ACTIONS.includes(strategy.action)
      ? "escalated"
      : "skipped";
    return {
      decision: { record, detection, strategy, outcome, amountRecovered: 0 },
      guardrailAudit: [],
    };
  }

  let guardrailResult = evaluateGuardrails(record, strategy, state);
  let pauses = 0;

  while (
    !guardrailResult.outcome.passed &&
    (guardrailResult.outcome.block?.action_taken === "PAUSE" ||
      guardrailResult.outcome.block?.action_taken === "QUEUE") &&
    pauses < 7
  ) {
    pauses++;
    if (guardrailResult.outcome.block?.rule_id === "B1") {
      state.now = nextIstWindowStart(state.now);
    } else {
      state.now += 24 * 3600 * 1000;
      state.attemptedVolumePaise = 0;
    }
    guardrailResult = evaluateGuardrails(record, strategy, state);
  }

  const { outcome: guardrailOutcome, auditEntries } = guardrailResult;

  if (!guardrailOutcome.passed) {
    return {
      decision: {
        record,
        detection,
        strategy,
        guardrailChecks: guardrailOutcome.checks,
        outcome: "blocked",
        amountRecovered: 0,
      },
      guardrailAudit: auditEntries,
    };
  }

  let successProbability = record.ground_truth.expected_recovery_probability;
  if (successProbability <= 0) successProbability = 0.1;

  const execution = await executor.execute(
    strategy.action,
    record,
    Math.min(0.95, Math.max(0.05, successProbability)),
    rng,
  );

  const intervened = execution.success && !execution.error;

  state.retriesPerRecord.set(
    record.record_id,
    (state.retriesPerRecord.get(record.record_id) ?? 0) + 1,
  );
  state.interventionCount++;
  state.attemptedVolumePaise += record.amount;
  state.lastContactAt.set(record.customer_id, state.now);

  const dayKeyContact = `${record.customer_id}:${new Date(state.now).toISOString().slice(0, 10)}`;
  state.contactsPerCustomerDay.set(
    dayKeyContact,
    (state.contactsPerCustomerDay.get(dayKeyContact) ?? 0) + 1,
  );

  const outcome: AuditOutcome = intervened ? "recovered" : "failed";
  const timeToRecovery = intervened
    ? Math.max(1, Math.round(Math.pow(rng.float(), 2) * 48))
    : undefined;

  return {
    decision: {
      record,
      detection,
      strategy,
      guardrailChecks: guardrailOutcome.checks,
      apiCall: execution.api_call,
      outcome,
      amountRecovered: intervened ? record.ground_truth.recoverable_amount : 0,
      timeToRecoveryHours: timeToRecovery,
      error: execution.error,
    },
    guardrailAudit: [],
  };
}

export async function runBatch(
  records: SyntheticRecord[],
  options: RunBatchOptions = {},
): Promise<RunBatchResult> {
  const startedAt = Date.now();
  const seed = options.seed ?? 42;
  const now = options.now ?? Date.now();
  const executor =
    options.executor ??
    new RazorpayExecutor(process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET);
  const rng = new Rng(seed);
  const state = createBatchState(records.length, now);

  const decisions: RecordDecision[] = [];
  const allGuardrailAudit: GuardrailAuditEntry[] = [];

  for (const record of records) {
    const { decision, guardrailAudit } = await processRecord(
      record,
      state,
      executor,
      rng,
    );
    decisions.push(decision);
    allGuardrailAudit.push(...guardrailAudit);
  }

  const processingTimeMs = Date.now() - startedAt;
  const report = buildReport(decisions, seed, processingTimeMs);

  return {
    decisions,
    auditEntries: decisions.map(toAuditEntry),
    guardrailAudit: allGuardrailAudit,
    state,
    processingTimeMs,
    report,
  };
}
