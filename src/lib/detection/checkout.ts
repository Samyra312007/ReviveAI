import { SyntheticRecord } from "@/lib/data/schema";
import { DetectionSignal } from "./types";

const KEYWORDS: Record<string, string[]> = {
  form_abandonment: ["abandoned checkout form"],
  payment_page_exit: ["exited at payment page"],
  price_shock: ["left after seeing final price"],
  comparison_shopping: ["comparison shopping"],
};

export function detectCheckoutAbandonment(record: SyntheticRecord): DetectionSignal | null {
  const reason = record.failure_reason.toLowerCase();
  for (const [subcategory, terms] of Object.entries(KEYWORDS)) {
    if (!terms.some((t) => reason.includes(t))) continue;

    let confidence = 0.62;

    if (record.recovery_window_hours !== undefined) confidence += 0.18;
    if (record.days_since_last_order <= 2) confidence += 0.07;
    if (record.amount / 100 >= 299) confidence += 0.05;

    return {
      category: "checkout_abandonment",
      subcategory,
      confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
    };
  }
  return null;
}
