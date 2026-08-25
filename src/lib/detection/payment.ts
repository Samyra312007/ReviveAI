import { SyntheticRecord } from "@/lib/data/schema";
import { DetectionSignal } from "./types";

const KEYWORDS: Record<string, string[]> = {
  insufficient_funds: ["insufficient funds"],
  network_timeout: ["timeout", "network"],
  card_expired: ["card expired"],
  bank_declined: ["declined"],
  fraud_hold: ["fraud"],
};

const AMOUNT_RANGES_RS: Record<string, [number, number]> = {
  insufficient_funds: [199, 15000],
  network_timeout: [49, 8000],
  card_expired: [299, 20000],
  bank_declined: [500, 50000],
  fraud_hold: [2000, 60000],
};

export function detectPaymentFailure(record: SyntheticRecord): DetectionSignal | null {
  const reason = record.failure_reason.toLowerCase();
  for (const [subcategory, terms] of Object.entries(KEYWORDS)) {
    const matched = terms.filter((t) => reason.includes(t));
    if (matched.length === 0) continue;

    let confidence = matched.length >= 2 ? 0.72 : 0.62;

    const [minRs, maxRs] = AMOUNT_RANGES_RS[subcategory];
    const amountRs = record.amount / 100;
    if (amountRs >= minRs && amountRs <= maxRs) confidence += 0.15;
    else confidence -= 0.1;

    if (
      (subcategory === "card_expired" && record.previous_payments > 0) ||
      (subcategory === "insufficient_funds" && record.previous_payments > 0)
    ) {
      confidence += 0.08;
    }
    if (subcategory === "fraud_hold") confidence += 0.12;

    return {
      category: "payment_failure",
      subcategory,
      confidence: Math.min(0.97, Math.max(0.05, Math.round(confidence * 100) / 100)),
    };
  }
  return null;
}
