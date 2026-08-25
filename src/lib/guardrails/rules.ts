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

const MAX_RETRIES_PER_RECORD = 2;
const MAX_RETRIES_PER_CUSTOMER_DAY = 3;
const MAX_INTERVENTION_RATIO = 0.8;
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;
const COOLDOWN_HOURS = 4;
const CHECKOUT_NUDGE_WINDOW_HOURS = 2;
const SUBSCRIPTION_RETRY_WINDOW_HOURS = 24 * 7;
const MAX_SMS_PER_DAY = 1;
const APPROVAL_THRESHOLD_PAISE = 50000 * 100;
const DAILY_VOLUME_CAP_PAISE = 500000 * 100;
const ROI_COST_RATIO = 0.3;
const MAX_VOICE_PER_WEEK = 1;
const VOICE_QUIET_START = 20;
const VOICE_QUIET_END = 9;
const MAX_VOICE_ATTEMPTS_BEFORE_TEXT = 3;

export const RULES: Rule[] = [
  {
    id: "A1",
    description: "Max retries per record = 2",
    applies: () => true,
    check: ({ record, state }) =>
      (state.retriesPerRecord.get(record.record_id) ?? 0) < MAX_RETRIES_PER_RECORD
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Retry limit exceeded (${MAX_RETRIES_PER_RECORD})`,
            action_taken: "SKIP",
          },
  },
  {
    id: "A2",
    description: "Max retries per customer per day = 3",
    applies: () => true,
    check: ({ record, state, dayKey }) => {
      const count = state.contactsPerCustomerDay.get(`${record.customer_id}:${dayKey}`) ?? 0;
      return count < MAX_RETRIES_PER_CUSTOMER_DAY
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
    description: "Max total interventions in batch = 80%",
    applies: () => true,
    check: ({ state }) =>
      state.interventionCount < Math.floor(state.totalRecords * MAX_INTERVENTION_RATIO)
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Batch intervention cap (80%) reached",
            action_taken: "PAUSE",
          },
  },
  {
    id: "B1",
    description: "No interventions 21:00 - 08:00 IST",
    applies: () => true,
    check: ({ istHour }) =>
      istHour >= QUIET_END_HOUR && istHour < QUIET_START_HOUR
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Current IST hour ${istHour} is inside quiet window (${QUIET_END_HOUR}:00-${QUIET_START_HOUR}:00)`,
            action_taken: "QUEUE",
          },
  },
  {
    id: "B2",
    description: "Min 4 hours between retries to same customer",
    applies: () => true,
    check: ({ record, state }) => {
      const last = state.lastContactAt.get(record.customer_id);
      if (!last) return { passed: true };
      const hoursSince = (state.now - last) / 3600000;
      return hoursSince >= COOLDOWN_HOURS
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Cooling period active (${hoursSince.toFixed(1)}h since last contact, min ${COOLDOWN_HOURS}h)`,
            action_taken: "RESCHEDULE",
          };
    },
  },
  {
    id: "B3",
    description: "Checkout nudge window = max 2 hours for WhatsApp/SMS",
    applies: ({ record }) => record.type === "checkout_abandonment",
    check: ({ channel, record }) => {
      if (channel !== "whatsapp" && channel !== "sms") return { passed: true };
      const ageHours = record.recovery_window_hours ?? 0;
      return ageHours <= CHECKOUT_NUDGE_WINDOW_HOURS
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Outside ${CHECKOUT_NUDGE_WINDOW_HOURS}h nudge window (${ageHours}h since abandonment)`,
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "B4",
    description: "Subscription retry window = max 7 days",
    applies: ({ record }) => record.type === "subscription_failure",
    check: ({ record, strategy, state }) => {
      if (strategy.action !== "MANDATE_RETRY") return { passed: true };
      const ageHours = (state.now - new Date(record.failure_timestamp).getTime()) / 3600000;
      return ageHours <= SUBSCRIPTION_RETRY_WINDOW_HOURS
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Beyond ${SUBSCRIPTION_RETRY_WINDOW_HOURS / 24}-day retry window (${Math.round(ageHours / 24)} days)`,
            action_taken: "ESCALATE",
          };
    },
  },
  {
    id: "C1",
    description: "Max 1 SMS per customer per day",
    applies: ({ channel }) => channel === "sms",
    check: ({ record, state, dayKey }) => {
      const key = `${record.customer_id}:${dayKey}`;
      return (state.smsToday.get(key) ?? 0) < MAX_SMS_PER_DAY
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
    check: ({ record, strategy }) =>
      !(
        record.subcategory === "fraud_hold" ||
        /fraud/i.test(record.failure_reason) ||
        strategy.action === "RETRY_IMMEDIATELY" && /fraud/i.test(record.customer_id)
      )
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Account is fraud-flagged",
            action_taken: "SKIP",
          },
  },
  {
    id: "C4",
    description: "Amount > ₹50,000 requires manual approval",
    applies: () => true,
    check: ({ record }) =>
      record.amount <= APPROVAL_THRESHOLD_PAISE
        ? { passed: true }
        : {
            passed: false,
            block_reason: `₹${(record.amount / 100).toLocaleString("en-IN")} exceeds ₹50,000 approval threshold`,
            action_taken: "ESCALATE",
          },
  },
  {
    id: "D1",
    description: "Max single intervention amount = ₹50,000",
    applies: () => true,
    check: ({ record }) =>
      record.amount <= APPROVAL_THRESHOLD_PAISE
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Single intervention amount cap of ₹50,000 exceeded`,
            action_taken: "ESCALATE",
          },
  },
  {
    id: "D2",
    description: "Max daily recovery attempt volume = ₹5,00,000",
    applies: () => true,
    check: ({ record, state }) =>
      state.attemptedVolumePaise + record.amount <= DAILY_VOLUME_CAP_PAISE
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Daily recovery volume cap of ₹5,00,000 reached",
            action_taken: "PAUSE",
          },
  },
  {
    id: "D3",
    description: "Auto-skip if recovery cost > 30% of amount",
    applies: () => true,
    check: ({ record, channel }) => {
      if (!channel) return { passed: true };
      const cost =
        CHANNEL_COSTS[channel] + CHANNEL_COSTS.api_call;
      return cost <= record.amount * ROI_COST_RATIO
        ? { passed: true }
        : {
            passed: false,
            block_reason: `Recovery cost ₹${(cost / 100).toFixed(2)} > 30% of ₹${record.amount / 100}`,
            action_taken: "SKIP",
          };
    },
  },
  {
    id: "F1",
    description: "Max 1 voice call per customer per week",
    applies: ({ channel }) => channel === "voice",
    check: ({ record, state, weekKey }) => {
      const key = `${record.customer_id}:${weekKey}`;
      return (state.voiceThisWeek.get(key) ?? 0) < MAX_VOICE_PER_WEEK
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
    description: "Max 3 voice attempts before switching to text",
    applies: ({ channel }) => channel === "voice",
    check: ({ record, state }) =>
      (state.voiceAttempts.get(record.customer_id) ?? 0) < MAX_VOICE_ATTEMPTS_BEFORE_TEXT
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Voice max attempts reached — switching to text channel",
            action_taken: "SKIP",
          },
  },
  {
    id: "F4",
    description: "Respect voice_opt_in preference — never force",
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
    description: "Max 2 promise renewals per record",
    applies: ({ record }) => record.type === "overdue_invoice",
    check: ({ record, state }) =>
      (state.promiseRenewals.get(record.record_id) ?? 0) <= 2
        ? { passed: true }
        : {
            passed: false,
            block_reason: "Promise renewal limit (2) exceeded",
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
