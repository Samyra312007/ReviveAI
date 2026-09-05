import { SyntheticRecord } from "@/lib/data/schema";
import { Strategy } from "@/lib/agent/strategy";
import { BatchState, toIstParts } from "@/lib/agent/context";

export type GuardrailActionTaken =
  | "SKIP"
  | "ESCALATE"
  | "RESCHEDULE"
  | "QUEUE"
  | "PAUSE";

export interface ChannelCostsPaise {
  whatsapp: number;
  sms: number;
  email: number;
  voice: number;
  api_call: number;
}

export const CHANNEL_COSTS: ChannelCostsPaise = {
  whatsapp: 40,
  sms: 20,
  email: 5,
  voice: 250,
  api_call: 50,
};

export type Channel = "whatsapp" | "sms" | "email" | "voice";

export function channelForAction(action: Strategy["action"]): Channel | null {
  switch (action) {
    case "CART_REMINDER_WHATSAPP":
      return "whatsapp";
    case "SMS_PAYMENT_LINK":
    case "GENTLE_REMINDER":
      return "sms";
    case "EMAIL_CART_RECOVERY":
    case "FIRM_NOTICE":
    case "PAYMENT_PLAN_OFFER":
      return "email";
    default:
      return null;
  }
}

export interface GuardrailCheckResult {
  rule_id: string;
  rule_description: string;
  passed: boolean;
  block_reason?: string;
}

export interface GuardrailBlock {
  rule_id: string;
  rule_description: string;
  action_taken: GuardrailActionTaken;
  reasoning: string;
}

export interface GuardrailOutcome {
  passed: boolean;
  checks: GuardrailCheckResult[];
  block?: GuardrailBlock;
}

export interface RuleContext {
  record: SyntheticRecord;
  strategy: Strategy;
  channel: Channel | null;
  state: BatchState;
  istHour: number;
  dayKey: string;
  weekKey: string;
}

type Rule = {
  id: string;
  description: string;
  applies: (ctx: RuleContext) => boolean;
  check: (ctx: RuleContext) => { passed: boolean; block_reason?: string; action_taken?: GuardrailActionTaken };
};

const VOICE_QUIET_START = 20;
const VOICE_QUIET_END = 9;
const MAX_VOICE_ATTEMPTS_BEFORE_TEXT = 3;
const MAX_PROMISE_RENEWALS = 2;

function formatInrShort(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export const RULES: Rule[] = [
  {
    id: "A1",
    description: "Max retries per record",
    applies: () => true,
    check: ({ record, state }) => {
      const max = state.config.maxRetriesPerRecord;
      return (state.retriesPerRecord.get(record.record_id) ?? 0) < max
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Retry limit exceeded (${max})`,
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "A2",
    description: "Max retries per customer per day",
    applies: () => true,
    check: ({ record, state, dayKey }) => {
      const max = state.config.maxRetriesPerCustomerDay;
      const count = state.contactsPerCustomerDay.get(`${record.customer_id}:${dayKey}`) ?? 0;
      return count < max
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Customer already contacted ${count}x today`,
            action_taken: "ESCALATE",
          };
    },
  },
  {
    id: "A3",
    description: "Max total interventions in batch (% of records)",
    applies: () => true,
    check: ({ state }) => {
      const cap = Math.floor((state.totalRecords * state.config.maxInterventionRatioPct) / 100);
      return state.interventionCount < cap
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Batch intervention cap (${state.config.maxInterventionRatioPct}%) reached`,
            action_taken: "PAUSE",
          };
    },
  },
  {
    id: "B1",
    description: "No interventions during IST quiet hours",
    applies: () => true,
    check: ({ state, istHour }) => {
      const start = state.config.quietStartHourIst;
      const end = state.config.quietEndHourIst;
      return istHour >= end && istHour < start
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Current IST hour ${istHour} is inside quiet window (${end}:00-${start}:00)`,
            action_taken: "QUEUE",
          };
    },
  },
  {
    id: "B2",
    description: "Minimum hours between retries to same customer",
    applies: () => true,
    check: ({ record, state }) => {
      const minHours = state.config.cooldownHours;
      const last = state.lastContactAt.get(record.customer_id);
      if (!last) return { passed: true };
      const hoursSince = (state.now - last) / 3600000;
      return hoursSince >= minHours
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Cooling period active (${hoursSince.toFixed(1)}h since last contact, min ${minHours}h)`,
            action_taken: "RESCHEDULE",
          };
    },
  },
  {
    id: "B3",
    description: "Checkout nudge window for WhatsApp/SMS",
    applies: ({ record }) => record.type === "checkout_abandonment",
    check: ({ channel, record, state }) => {
      if (channel !== "whatsapp" && channel !== "sms") return { passed: true };
      const windowH = state.config.checkoutNudgeWindowHours;
      const ageHours = record.recovery_window_hours ?? 0;
      return ageHours <= windowH
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Outside ${windowH}h nudge window (${ageHours}h since abandonment)`,
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "B4",
    description: "Subscription retry window in days",
    applies: ({ record }) => record.type === "subscription_failure",
    check: ({ record, strategy, state }) => {
      if (strategy.action !== "MANDATE_RETRY") return { passed: true };
      const windowDays = state.config.subscriptionRetryWindowDays;
      const ageHours = (state.now - new Date(record.failure_timestamp).getTime()) / 3600000;
      return ageHours <= windowDays * 24
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Beyond ${windowDays}-day retry window (${Math.round(ageHours / 24)} days)`,
            action_taken: "ESCALATE",
          };
    },
  },
  {
    id: "C1",
    description: "Max SMS per customer per day",
    applies: ({ channel }) => channel === "sms",
    check: ({ record, state, dayKey }) => {
      const key = `${record.customer_id}:${dayKey}`;
      return (state.smsToday.get(key) ?? 0) < state.config.maxSmsPerDay
        ? { passed: true }
        : {
            passed: false,
            block_reason: "SMS limit reached for today",
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "C2",
    description: "Respect DND preferences",
    applies: () => true,
    check: ({ record, state, channel }) =>
      !(channel && state.dndPreferences.has(record.customer_id))
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Customer is on DND list",
            action_taken: "SKIP",
          },
  },
  {
    id: "C3",
    description: "No intervention on fraud-flagged accounts",
    applies: () => true,
    check: ({ record }) =>
      !(record.subcategory === "fraud_hold" || /fraud/i.test(record.failure_reason))
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Account is fraud-flagged",
            action_taken: "SKIP",
          },
  },
  {
    id: "C4",
    description: "Amount above approval threshold requires manual approval",
    applies: () => true,
    check: ({ record, state }) =>
      record.amount <= state.config.approvalThresholdPaise
        ? { passed: true }
        : {
            passed: false,
            block_reason: `${formatInrShort(record.amount)} exceeds ${formatInrShort(state.config.approvalThresholdPaise)} approval threshold`,
            action_taken: "ESCALATE",
          },
  },
  {
    id: "D1",
    description: "Max single intervention amount",
    applies: () => true,
    check: ({ record, state }) =>
      record.amount <= state.config.approvalThresholdPaise
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Single intervention amount cap of ${formatInrShort(state.config.approvalThresholdPaise)} exceeded`,
            action_taken: "ESCALATE",
          },
  },
  {
    id: "D2",
    description: "Max daily recovery attempt volume",
    applies: () => true,
    check: ({ record, state }) =>
      state.attemptedVolumePaise + record.amount <= state.config.dailyVolumeCapPaise
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Daily recovery volume cap of ${formatInrShort(state.config.dailyVolumeCapPaise)} reached`,
            action_taken: "PAUSE",
          },
  },
  {
    id: "D3",
    description: "Auto-skip if recovery cost exceeds % of amount",
    applies: () => true,
    check: ({ record, channel, state }) => {
      if (!channel) return { passed: true };
      const cost = CHANNEL_COSTS[channel] + CHANNEL_COSTS.api_call;
      const ratio = state.config.roiCostRatioPct / 100;
      return cost <= record.amount * ratio
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Recovery cost ₹${(cost / 100).toFixed(2)} > ${state.config.roiCostRatioPct}% of ₹${record.amount / 100}`,
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "F1",
    description: "Max voice calls per customer per week",
    applies: ({ channel }) => channel === "voice",
    check: ({ record, state, weekKey }) => {
      const key = `${record.customer_id}:${weekKey}`;
      return (state.voiceThisWeek.get(key) ?? 0) < state.config.maxVoicePerWeek
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Voice limit exceeded this week",
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "F2",
    description: "No voice calls before 09:00 or after 20:00 IST",
    applies: ({ channel }) => channel === "voice",
    check: ({ istHour }) =>
      istHour >= VOICE_QUIET_END && istHour < VOICE_QUIET_START
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Voice quiet hours (IST ${VOICE_QUIET_END}:00-${VOICE_QUIET_START}:00)`,
            action_taken: "QUEUE",
          },
  },
  {
    id: "F3",
    description: "Max voice attempts before switching to text",
    applies: ({ channel }) => channel === "voice",
    check: ({ record, state }) =>
      (state.voiceAttempts.get(record.customer_id) ?? 0) < MAX_VOICE_ATTEMPTS_BEFORE_TEXT
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Voice max attempts reached, switching to text channel",
            action_taken: "SKIP",
          },
  },
  {
    id: "F4",
    description: "Respect voice_opt_in preference, never force",
    applies: ({ channel }) => channel === "voice",
    check: ({ record }) =>
      record.voice_opt_in !== false
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Customer has not opted into voice notifications",
            action_taken: "SKIP",
          },
  },
  {
    id: "G1",
    description: "Max promise renewals per record",
    applies: ({ record }) => record.type === "overdue_invoice",
    check: ({ record, state }) =>
      (state.promiseRenewals.get(record.record_id) ?? 0) <= MAX_PROMISE_RENEWALS
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Promise renewal limit (${MAX_PROMISE_RENEWALS}) exceeded`,
            action_taken: "ESCALATE",
          },
  },
];

export function buildRuleContext(
  record: SyntheticRecord,
  strategy: Strategy,
  state: BatchState,
): RuleContext {
  const { hour, dayKey, weekKey } = toIstParts(state.now);
  return {
    record,
    strategy,
    channel: channelForAction(strategy.action),
    state,
    istHour: hour,
    dayKey,
    weekKey,
  };
}
