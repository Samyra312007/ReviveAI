import { SyntheticRecord, VoiceNotification, PromiseRecord } from "@/lib/data/schema";
import { Rng } from "@/lib/data/seed";
import { detectRecord } from "@/lib/detection/engine";
import { buildContext, createBatchState, BatchState, toIstParts } from "./context";
import { selectStrategy, Strategy, StrategyAction } from "./strategy";
import { DetectionResult } from "@/lib/detection/types";
import { assessPreventionRisk, PreventionAssessment } from "@/lib/prevention/scorer";
import { GuardrailConfig } from "@/lib/guardrails/config";
import { evaluateGuardrails } from "@/lib/guardrails/engine";
import { GuardrailAuditEntry } from "@/lib/guardrails/engine";
import { RazorpayExecutor } from "@/lib/razorpay/client";
import {
  selectVoiceStrategy,
  buildVoiceNotification,
  isWithinVoiceWindow,
} from "@/lib/voice/generator";
import { deliverVoice } from "@/lib/voice/delivery";
import {
  processPromises,
  PromiseEvent,
} from "@/lib/promise/tracker";
import {
  runConversation,
  isConversationEligible,
  Conversation,
} from "@/lib/conversation/engine";
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
  enableVoice?: boolean;
  enablePromises?: boolean;
  enableConversations?: boolean;
  enablePrevention?: boolean;
  guardrailConfig?: Partial<GuardrailConfig>;
}

export interface RunBatchResult {
  decisions: RecordDecision[];
  auditEntries: AuditLogEntry[];
  guardrailAudit: GuardrailAuditEntry[];
  voiceNotifications: VoiceNotification[];
  promiseUpdates: PromiseRecord[];
  promiseEvents: PromiseEvent[];
  conversations: Conversation[];
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

function nextVoiceWindowStart(now: number): number {
  const shifted = now + IST_OFFSET_MS;
  const dayStart = Math.floor(shifted / 86400000) * 86400000;
  let target = dayStart + 9 * 3600 * 1000;
  if (target <= shifted) target += 86400000;
  return target - IST_OFFSET_MS;
}

const PREVENTION_SUCCESS_PROBABILITY = 0.65;

async function runPrevention(
  record: SyntheticRecord,
  detection: DetectionResult,
  assessment: PreventionAssessment,
  state: BatchState,
  executor: RazorpayExecutor,
  rng: Rng,
): Promise<{ decision: RecordDecision; guardrailAudit: GuardrailAuditEntry[] }> {
  const strategy: Strategy = {
    action: "PREVENT_CARD_UPDATE",
    reasoning: `Prevention: ${assessment.reasoning} — proactive card-update nudge`,
  };

  const { outcome: guardrailOutcome, auditEntries } = evaluateGuardrails(
    record,
    strategy,
    state,
  );

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

  const execution = await executor.execute(
    "PREVENT_CARD_UPDATE",
    record,
    PREVENTION_SUCCESS_PROBABILITY,
    rng,
  );

  const prevented = execution.success && !execution.error;

  state.interventionCount++;
  state.lastContactAt.set(record.customer_id, state.now);

  return {
    decision: {
      record,
      detection,
      strategy,
      guardrailChecks: guardrailOutcome.checks,
      apiCall: execution.api_call,
      outcome: prevented ? "prevented" : "skipped",
      amountRecovered: 0,
      error: execution.error,
    },
    guardrailAudit: [],
  };
}

export interface ProcessRecordOptions {
  enablePrevention?: boolean;
}

export async function processRecord(
  record: SyntheticRecord,
  state: BatchState,
  executor: RazorpayExecutor,
  rng: Rng,
  options: ProcessRecordOptions = {},
): Promise<{ decision: RecordDecision; guardrailAudit: GuardrailAuditEntry[] }> {
  const detection = detectRecord(record, state.now);

  if (detection.route === "no_action" || detection.route === "skip") {
    if (
      options.enablePrevention &&
      detection.route === "no_action" &&
      record.type === "control"
    ) {
      const assessment = assessPreventionRisk(record);
      if (assessment.flagged) {
        return runPrevention(record, detection, assessment, state, executor, rng);
      }
    }
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
  const resolvedBlockRuleIds = new Set<string>();

  while (
    !guardrailResult.outcome.passed &&
    (guardrailResult.outcome.block?.action_taken === "PAUSE" ||
      guardrailResult.outcome.block?.action_taken === "QUEUE") &&
    pauses < 7
  ) {
    pauses++;
    resolvedBlockRuleIds.add(guardrailResult.outcome.block!.rule_id);
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
      resolvedGuardrailBlocks:
        resolvedBlockRuleIds.size > 0 ? [...resolvedBlockRuleIds] : undefined,
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
  const state = createBatchState(records.length, now, options.guardrailConfig);

  const decisions: RecordDecision[] = [];
  const allGuardrailAudit: GuardrailAuditEntry[] = [];
  const voiceNotifications: VoiceNotification[] = [];
  const conversations: Conversation[] = [];
  const conversationPromises: PromiseRecord[] = [];

  const enableVoice = options.enableVoice ?? true;
  const enableConversations = options.enableConversations ?? true;
  let vnNum = 0;

  for (const record of records) {
    const { decision, guardrailAudit } = await processRecord(
      record,
      state,
      executor,
      rng,
      { enablePrevention: options.enablePrevention ?? true },
    );
    decisions.push(decision);
    allGuardrailAudit.push(...guardrailAudit);

    if (
      enableConversations &&
      isConversationEligible(record, decision.strategy, decision.outcome) &&
      rng.float() < 0.55
    ) {
      const successProbability = Math.min(
        0.9,
        Math.max(0.05, record.ground_truth.expected_recovery_probability),
      );
      const convResult = runConversation(
        record,
        "failed",
        successProbability,
        state.now,
        () => rng.float(),
      );
      conversations.push(convResult.conversation);

      if (convResult.newPromise) {
        conversationPromises.push(convResult.newPromise);
      }

      if (convResult.outcomeOverride) {
        const o = convResult.outcomeOverride;
        decision.outcome = o.outcome;
        if (o.outcome === "recovered" && o.amountRecoveredPaise) {
          decision.amountRecovered = o.amountRecoveredPaise;
          decision.timeToRecoveryHours = 1;
        }
        if (o.outcome === "recovered") {
          state.interventionCount += 0;
        } else {
          state.interventionCount = Math.max(0, state.interventionCount - 1);
        }
        if (decision.apiCall) {
          decision.apiCall = {
            ...decision.apiCall,
            response: {
              ...(decision.apiCall.response as Record<string, unknown>),
              conversation_resolution: convResult.conversation.resolution,
            },
          };
        }
      }
    }

    if (
      enableVoice &&
      (decision.outcome === "recovered" || decision.outcome === "failed") &&
      decision.strategy
    ) {
      const voiceStrategy = selectVoiceStrategy(record, decision.strategy);
      if (voiceStrategy.action !== "NO_VOICE" && voiceStrategy.action !== "SKIP_VOICE") {
        const voiceNow = isWithinVoiceWindow(state.now)
          ? state.now
          : nextVoiceWindowStart(state.now);
        const weekKeyVoice = toIstParts(voiceNow).weekKey;
        const voiceThisWeek =
          state.voiceThisWeek.get(`${record.customer_id}:${weekKeyVoice}`) ?? 0;
        if (voiceThisWeek < 1) {
          state.voiceThisWeek.set(`${record.customer_id}:${weekKeyVoice}`, 1);
          const notification = buildVoiceNotification(
            () => rng.float(),
            ++vnNum,
            record,
            voiceStrategy,
            voiceNow,
          );
          const { notification: delivered } = deliverVoice(
            () => rng.float(),
            notification,
            voiceNow,
          );
          voiceNotifications.push(delivered);
        }
      }
    }
  }

  const enablePromises = options.enablePromises ?? true;
  let promiseUpdates: PromiseRecord[] = [];
  let promiseEvents: PromiseEvent[] = [];
  if (enablePromises) {
    const promiseResult = processPromises(records, now, () => rng.float());
    promiseUpdates = promiseResult.updatedPromises;
    promiseEvents = promiseResult.events;
  }
  promiseUpdates = [...promiseUpdates, ...conversationPromises];

  const processingTimeMs = Date.now() - startedAt;
  const report = buildReport(decisions, seed, processingTimeMs);

  return {
    decisions,
    auditEntries: decisions.map(toAuditEntry),
    guardrailAudit: allGuardrailAudit,
    voiceNotifications,
    promiseUpdates,
    promiseEvents,
    conversations,
    state,
    processingTimeMs,
    report,
  };
}
