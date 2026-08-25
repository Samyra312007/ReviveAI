import { SyntheticRecord } from "@/lib/data/schema";

export const PREVENTION_SCORE_THRESHOLD = 0.55;

export interface PreventionAssessment {
  flagged: boolean;
  score: number;
  reasoning: string;
}

function tenureRisk(previousPayments: number): number {
  if (previousPayments < 5) return 1;
  if (previousPayments < 12) return 0.5;
  return 0;
}

function recencyRisk(daysSinceLastOrder: number): number {
  return Math.min(1, daysSinceLastOrder / 45);
}

function segmentRisk(segment: SyntheticRecord["customer_segment"]): number {
  if (segment === "low_value") return 1;
  if (segment === "mid_value") return 0.5;
  return 0;
}

export function assessPreventionRisk(record: SyntheticRecord): PreventionAssessment {
  const t = tenureRisk(record.previous_payments);
  const r = recencyRisk(record.days_since_last_order);
  const s = segmentRisk(record.customer_segment);
  const v = Math.min(1, Math.log(1 + record.amount) / Math.log(1 + 20000000));

  const score =
    Math.round((0.35 * t + 0.25 * r + 0.2 * s + 0.2 * v) * 100) / 100;

  const flagged = record.type === "control" && score >= PREVENTION_SCORE_THRESHOLD;

  const reasons: string[] = [];
  if (t > 0) reasons.push(`thin payment history (${record.previous_payments} payments)`);
  if (r > 0.4) reasons.push(`dormant for ${record.days_since_last_order} days`);
  if (s > 0) reasons.push(`${record.customer_segment.replace("_", " ")} segment`);

  return {
    flagged,
    score,
    reasoning: flagged
      ? `Churn-risk signals: ${reasons.join(", ")}`
      : `Low churn risk (score ${score})`,
  };
}
