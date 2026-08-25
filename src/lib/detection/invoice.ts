import { SyntheticRecord } from "@/lib/data/schema";
import { DetectionSignal } from "./types";

export function parseOverdueDays(record: SyntheticRecord): number | null {
  const match = record.failure_reason.match(/(\d+)\+?\s*days? overdue/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function bucketFor(days: number): string {
  if (days <= 7) return "7_day_late";
  if (days <= 14) return "14_day_late";
  if (days <= 30) return "30_day_late";
  return "60_day_plus_late";
}

export function detectOverdueInvoice(record: SyntheticRecord): DetectionSignal | null {
  const days = parseOverdueDays(record);
  if (days === null) return null;

  let confidence = 0.7;
  if (record.customer_email.includes("corporate") || record.amount / 100 >= 5000) {
    confidence += 0.12;
  }
  if (record.previous_payments > 3) confidence += 0.08;

  return {
    category: "overdue_invoice",
    subcategory: bucketFor(days),
    confidence: Math.min(0.97, Math.round(confidence * 100) / 100),
  };
}
