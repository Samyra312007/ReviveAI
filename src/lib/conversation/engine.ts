import { SyntheticRecord, PromiseRecord } from "@/lib/data/schema";
import { parsePromiseText } from "@/lib/promise/parser";
import { channelForAction } from "@/lib/guardrails/rules";
import { Strategy } from "@/lib/agent/strategy";

export type ConversationIntent =
  | "promise"
  | "hardship"
  | "refusal"
  | "dispute"
  | "ready_to_pay";

export type ConversationResolution =
  | "promise_created"
  | "promise_noted_existing"
  | "payment_plan_offered"
  | "refused"
  | "escalated_dispute"
  | "retry_recovered"
  | "retry_failed"
  | "unresolved_manual";

export interface ConversationTurn {
  speaker: "agent" | "customer";
  text: string;
}

export interface Conversation {
  record_id: string;
  customer_id: string;
  turns: ConversationTurn[];
  intent: ConversationIntent | null;
  resolution: ConversationResolution;
  created_at: string;
}

export interface OutcomeOverride {
  outcome: "recovered" | "escalated";
  amountRecoveredPaise?: number;
}

export interface ConversationResult {
  conversation: Conversation;
  outcomeOverride?: OutcomeOverride;
  newPromise?: PromiseRecord;
}

const MAX_CUSTOMER_TURNS = 2;

const INTENT_REPLIES: Record<ConversationIntent, string[]> = {
  promise: [
    "Friday tak kar dunga",
    "Kal transfer karta hoon ₹25000",
    "Next week pakka denge",
    "Monday se pehle pay karunga",
    "3 din mein bhej deta hoon",
  ],
  hardship: [
    "Is month paisa nahi hai, next month pakka bhejunga",
    "Account mein balance nahi hai abhi",
    "Salary aane tak wait karo please",
    "Financial problem chal rahi hai bhai",
  ],
  refusal: [
    "Nahi, main ye order cancel karwana chahta hoon",
    "Payment nahi karunga",
    "Mujhe ye product nahi chahiye ab",
  ],
  dispute: [
    "Ye charge galat hai, maine order cancel kiya tha",
    "Maine ye payment pehle hi de diya tha, double charge hua hai",
    "Ye fraud hai, maine ye transaction kiya hi nahi",
  ],
  ready_to_pay: [
    "Abhi try karta hoon",
    "Theek hai, link par pay kar raha hoon",
    "Achha, abhi karti hoon payment",
  ],
};

const INTENT_WEIGHTS_BY_SUBCATEGORY: Record<
  string,
  [ConversationIntent, number][]
> = {
  insufficient_funds: [
    ["promise", 35],
    ["hardship", 30],
    ["ready_to_pay", 15],
    ["refusal", 10],
    ["dispute", 10],
  ],
  insufficient_balance: [
    ["promise", 40],
    ["hardship", 25],
    ["ready_to_pay", 15],
    ["refusal", 10],
    ["dispute", 10],
  ],
  card_expired: [
    ["ready_to_pay", 30],
    ["hardship", 20],
    ["promise", 25],
    ["dispute", 15],
    ["refusal", 10],
  ],
  mandate_not_triggered: [
    ["promise", 35],
    ["hardship", 20],
    ["ready_to_pay", 20],
    ["refusal", 15],
    ["dispute", 10],
  ],
  bank_declined: [
    ["hardship", 30],
    ["dispute", 25],
    ["refusal", 20],
    ["ready_to_pay", 15],
    ["promise", 10],
  ],
  default: [
    ["promise", 35],
    ["ready_to_pay", 25],
    ["hardship", 20],
    ["refusal", 12],
    ["dispute", 8],
  ],
};

const AGENT_MESSAGES: Record<ConversationIntent, string> = {
  promise: "Thank you! Aapki payment date note kar li hai. Due date par reminder bhejenge.",
  hardship: "Koi baat nahi. Hum aapke liye payment plan bana sakte hain, 2 aasaan kishton mein pay karein.",
  refusal: "Samajh gaye. Aapki request hum note kar rahe hain aur team review karegi.",
  dispute: "Aapka concern escalate kar diya gaya hai. Hamari support team 24 ghante mein sampark karegi.",
  ready_to_pay: "Badhiya! Naya payment link bhej diye hain, 2 minute mein complete ho jayega.",
};

const NEEDS_DATE_FOLLOWUP = "Kab tak payment kar sakte hain? Exact date ya din bataiye.";

function weightedPick(
  rand: () => number,
  weights: [ConversationIntent, number][],
): ConversationIntent {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rand() * total;
  for (const [intent, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return intent;
  }
  return weights[weights.length - 1][0];
}

export function classifyIntent(text: string): {
  intent: ConversationIntent;
  confidence: number;
} {
  const t = text.toLowerCase();

  if (/(fraud|galat|wrong charge|double charge|unauthorized|cheat|dispute)/.test(t)) {
    return { intent: "dispute", confidence: 0.9 };
  }
  if (/(cancel|nahi karunga|not pay|won'?t pay|nahi chahiye|refund chahiye)/.test(t)) {
    return { intent: "refusal", confidence: 0.85 };
  }
  if (
    /(paisa nahi|balance nahi|no money|salary|financial problem|paise ki dikkat|afford nahi)/.test(
      t,
    )
  ) {
    return { intent: "hardship", confidence: 0.85 };
  }
  if (/(abhi try|pay kar raha|kar raha hoon link|karti hoon payment|paying now|doing it now)/.test(t)) {
    return { intent: "ready_to_pay", confidence: 0.8 };
  }

  const parsed = parsePromiseText(text);
  if (parsed.parsed) {
    return { intent: "promise", confidence: parsed.parsed.confidence };
  }

  if (/(pakka|kar dunga|karenge|will pay|sure)/.test(t)) {
    return { intent: "promise", confidence: 0.4 };
  }

  return { intent: "hardship", confidence: 0.3 };
}

function pickReply(
  record: SyntheticRecord,
  rand: () => number,
): { intent: ConversationIntent; text: string } {
  const weights =
    INTENT_WEIGHTS_BY_SUBCATEGORY[record.subcategory] ??
    INTENT_WEIGHTS_BY_SUBCATEGORY.default;
  const intent = weightedPick(rand, weights);
  const pool = INTENT_REPLIES[intent];
  const text = pool[Math.floor(rand() * pool.length)];
  return { intent, text };
}

function buildPromiseFromParsed(
  record: SyntheticRecord,
  dueDateIso: string,
  amountPaise: number | undefined,
  nowMs: number,
): PromiseRecord {
  const iso = new Date(nowMs).toISOString();
  return {
    promise_id: `prom_conv_${record.record_id}`,
    record_id: record.record_id,
    customer_id: record.customer_id,
    merchant_id: record.merchant_id,
    promised_amount: amountPaise ?? record.amount,
    promised_date: iso,
    due_date: dueDateIso,
    promise_source: "chat",
    status: "pending",
    renewal_count: 0,
    reminders_sent: [],
    created_at: iso,
    updated_at: iso,
  };
}

const RETRY_SUCCESS_BONUS = 0.15;

export interface ForcedTurn {
  intent: ConversationIntent;
  text: string;
}

export interface ConversationOptions {
  /** Test hook: force exact customer replies instead of sampling */
  forcedTurns?: ForcedTurn[];
  /** Override engagement probability check (default handled by caller) */
}

export function runConversation(
  record: SyntheticRecord,
  decisionOutcome: "recovered" | "failed",
  successProbability: number,
  nowMs: number,
  rand: () => number,
  options: ConversationOptions = {},
): ConversationResult {
  const created = new Date(nowMs).toISOString();
  const turns: ConversationTurn[] = [];
  let resolution: ConversationResolution = "unresolved_manual";
  let finalIntent: ConversationIntent | null = null;
  let outcomeOverride: OutcomeOverride | undefined;
  let newPromise: PromiseRecord | undefined;

  for (let attempt = 0; attempt < MAX_CUSTOMER_TURNS; attempt++) {
    let intent: ConversationIntent;
    let text: string;
    if (options.forcedTurns && options.forcedTurns[attempt]) {
      intent = options.forcedTurns[attempt].intent;
      text = options.forcedTurns[attempt].text;
    } else {
      const reply = pickReply(record, rand);
      intent = reply.intent;
      text = reply.text;
    }
    turns.push({ speaker: "customer", text });
    const classification =
      options.forcedTurns && options.forcedTurns[attempt]
        ? { intent, confidence: 1 }
        : classifyIntent(text);
    finalIntent = classification.intent;

    switch (classification.intent) {
      case "dispute": {
        turns.push({ speaker: "agent", text: AGENT_MESSAGES.dispute });
        resolution = "escalated_dispute";
        outcomeOverride = { outcome: "escalated" };
        break;
      }
      case "refusal": {
        turns.push({ speaker: "agent", text: AGENT_MESSAGES.refusal });
        resolution = "refused";
        break;
      }
      case "hardship": {
        turns.push({ speaker: "agent", text: AGENT_MESSAGES.hardship });
        resolution = "payment_plan_offered";
        break;
      }
      case "ready_to_pay": {
        turns.push({ speaker: "agent", text: AGENT_MESSAGES.ready_to_pay });
        const retrySuccess =
          decisionOutcome === "failed" &&
          rand() < Math.min(0.9, successProbability + RETRY_SUCCESS_BONUS);
        if (retrySuccess) {
          resolution = "retry_recovered";
          outcomeOverride = {
            outcome: "recovered",
            amountRecoveredPaise: record.ground_truth.recoverable_amount,
          };
        } else {
          resolution = "retry_failed";
        }
        break;
      }
      case "promise": {
        const parsed = parsePromiseText(text, new Date(nowMs));
        if (parsed.parsed && !record.promise_history?.length) {
          turns.push({
            speaker: "agent",
            text: `${AGENT_MESSAGES.promise} (${new Date(parsed.parsed.dueDate).toDateString()})`,
          });
          resolution = "promise_created";
          newPromise = buildPromiseFromParsed(
            record,
            parsed.parsed.dueDate,
            parsed.parsed.amount,
            nowMs,
          );
        } else if (parsed.parsed && record.promise_history?.length) {
          turns.push({
            speaker: "agent",
            text: "Aapki existing promise already tracked hai, usi hisaab se follow-up milega.",
          });
          resolution = "promise_noted_existing";
        } else if (attempt < MAX_CUSTOMER_TURNS - 1) {
          turns.push({ speaker: "agent", text: NEEDS_DATE_FOLLOWUP });
          continue;
        } else {
          resolution = "unresolved_manual";
        }
        break;
      }
    }
    break;
  }

  void decisionOutcome;

  return {
    conversation: {
      record_id: record.record_id,
      customer_id: record.customer_id,
      turns,
      intent: finalIntent,
      resolution,
      created_at: created,
    },
    outcomeOverride,
    newPromise,
  };
}

export function isConversationEligible(
  record: SyntheticRecord,
  strategy: Strategy | undefined,
  outcome: string,
): boolean {
  if (!strategy || !channelForAction(strategy.action)) return false;
  return outcome === "failed";
}
