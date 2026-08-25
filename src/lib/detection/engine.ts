import { SyntheticRecord } from "@/lib/data/schema";
import {
  DetectionResult,
  DetectionRoute,
  CONFIDENCE_INTERVENE,
  CONFIDENCE_ESCALATE,
} from "./types";
import { detectPaymentFailure } from "./payment";
import { detectCheckoutAbandonment } from "./checkout";
import { detectSubscriptionFailure } from "./subscription";
import { detectOverdueInvoice } from "./invoice";

const MAX_AGE_HOURS: Record<string, number> = {
  payment_failure: 72,
  checkout_abandonment: 120,
};

const MIN_RECOVERY_AMOUNT_PAISE = 10000;

function classify(record: SyntheticRecord) {
  const signals = [
    detectPaymentFailure(record),
    detectSubscriptionFailure(record),
    detectOverdueInvoice(record),
    detectCheckoutAbandonment(record),
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  if (signals.length === 0) {
    const healthy = /no issue|healthy/i.test(record.failure_reason);
    return {
      category: healthy ? "control" : "unknown",
      subcategory: healthy ? "healthy" : "unclassified",
      confidence: healthy ? 0.95 : 0.2,
    };
  }

  signals.sort((a, b) => b.confidence - a.confidence);
  return signals[0];
}

export function computeUrgency(
  record: SyntheticRecord,
  now: number,
  recoveryProbability: number,
): number {
  const ageHours = (now - new Date(record.failure_timestamp).getTime()) / 3600000;
  const recency = Math.exp(-ageHours / 48);
  const value = Math.min(1, Math.log(1 + record.amount) / Math.log(1 + 20000000));
  return (
    Math.round((0.4 * recency + 0.3 * value + 0.3 * recoveryProbability) * 100) / 100
  );
}

function checkFeasibility(
  record: SyntheticRecord,
  now: number,
): { feasible: boolean; reason: string } {
  if (!record.customer_phone || !record.customer_email) {
    return { feasible: false, reason: "Customer not contactable (missing phone/email)" };
  }
  if (record.amount < MIN_RECOVERY_AMOUNT_PAISE) {
    return { feasible: false, reason: `Amount ₹${record.amount / 100} too small for cost-effective recovery` };
  }

  const ageHours = (now - new Date(record.failure_timestamp).getTime()) / 3600000;
  const maxAge = MAX_AGE_HOURS[record.type];
  if (maxAge !== undefined && ageHours > maxAge) {
    return { feasible: false, reason: `Recovery window closed (${Math.round(ageHours)}h old, max ${maxAge}h)` };
  }

  return { feasible: true, reason: "Intervention window open and customer contactable" };
}

export function routeDetection(
  category: string,
  confidence: number,
  feasibility: { feasible: boolean; reason: string },
): { route: DetectionRoute; reason: string } {
  if (category === "control") {
    return { route: "no_action", reason: "Healthy record — no intervention needed" };
  }
  if (category === "unknown" || confidence < CONFIDENCE_ESCALATE) {
    return { route: "skip", reason: `Low detection confidence (${confidence})` };
  }
  if (!feasibility.feasible) {
    return { route: "skip", reason: feasibility.reason };
  }
  if (confidence >= CONFIDENCE_INTERVENE) {
    return { route: "intervene", reason: `High confidence (${confidence}) — routing to agent core` };
  }
  return {
    route: "escalate",
    reason: `Medium confidence (${confidence}) — routed to escalation queue for manual review`,
  };
}

export function detectRecord(record: SyntheticRecord, now: number): DetectionResult {
  const { category, subcategory, confidence } = classify(record);
  const urgency =
    category === "control"
      ? 0
      : computeUrgency(record, now, record.ground_truth.expected_recovery_probability);
  const feasibility =
    category === "control"
      ? { feasible: false, reason: "Control group record" }
      : checkFeasibility(record, now);
  const { route, reason } = routeDetection(category, confidence, feasibility);

  return {
    record_id: record.record_id,
    detected_category: category,
    detected_subcategory: subcategory,
    detection_confidence: confidence,
    urgency_score: urgency,
    feasible: feasibility.feasible,
    feasibility_reason: feasibility.reason,
    route,
    route_reason: reason,
  };
}
