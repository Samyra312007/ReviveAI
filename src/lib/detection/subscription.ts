import { SyntheticRecord } from "@/lib/data/schema";
import { DetectionSignal } from "./types";

const KEYWORDS: Record<string, string[]> = {
  insufficient_balance: ["insufficient balance"],
  mandate_not_triggered: ["mandate not triggered"],
  card_expired: ["mandate expired"],
  bank_rejection: ["rejected mandate", "bank rejected"],
};

const STAGES: Record<string, string> = {
  insufficient_balance: "retry_window",
  mandate_not_triggered: "retry_window",
  card_expired: "dunning_started",
  bank_rejection: "near_churn",
};

export function detectSubscriptionFailure(record: SyntheticRecord): DetectionSignal | null {
  const reason = record.failure_reason.toLowerCase();
  for (const [subcategory, terms] of Object.entries(KEYWORDS)) {
    const matched = terms.filter((t) => reason.includes(t));
    if (matched.length === 0) continue;

    let confidence = 0.62;

    const expectedStage = STAGES[subcategory];
    if (
      expectedStage &&
      (record.lifecycle_stage === undefined || record.lifecycle_stage === expectedStage)
    ) {
      confidence += 0.16;
    } else if (record.lifecycle_stage !== undefined) {
      confidence += 0.08;
    }

    const amountRs = record.amount / 100;
    if (amountRs >= 99 && amountRs <= 9999) confidence += 0.09;

    return {
      category: "subscription_failure",
      subcategory,
      confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
    };
  }
  return null;
}
