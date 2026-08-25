import { SyntheticRecord } from "@/lib/data/schema";
import { CustomerContext } from "./context";

export type StrategyAction =
  | "RETRY_IN_24H"
  | "RETRY_IN_48H"
  | "RETRY_IMMEDIATELY"
  | "REQUEST_CARD_UPDATE"
  | "ESCALATE_TO_MANUAL"
  | "SKIP"
  | "CART_REMINDER_WHATSAPP"
  | "SMS_PAYMENT_LINK"
  | "EMAIL_CART_RECOVERY"
  | "MANDATE_RETRY"
  | "CARD_UPDATE_REQUEST"
  | "ESCALATE_TO_CHURN_PREVENTION"
  | "GENTLE_REMINDER"
  | "FIRM_NOTICE"
  | "PAYMENT_PLAN_OFFER"
  | "ESCALATE_LEGAL"
  | "NO_ACTION";

export interface Strategy {
  action: StrategyAction;
  reasoning: string;
}

const INVOICE_BUCKET_DAYS: Record<string, number> = {
  "7_day_late": 7,
  "14_day_late": 14,
  "30_day_late": 30,
  "60_day_plus_late": 60,
};

export function invoiceDaysOverdue(record: SyntheticRecord): number {
  if (INVOICE_BUCKET_DAYS[record.subcategory] !== undefined) {
    return INVOICE_BUCKET_DAYS[record.subcategory];
  }
  const match = record.failure_reason.match(/(\d+)\+?\s*days? overdue/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function selectStrategy(
  record: SyntheticRecord,
  context: CustomerContext,
): Strategy {
  if (record.type === "payment_failure") {
    switch (record.subcategory) {
      case "insufficient_funds":
        if (context.customerValue === "high" && context.retryCount < 2) {
          return { action: "RETRY_IN_24H", reasoning: "High value customer, temporary issue" };
        }
        if (context.retryCount >= 2) {
          return { action: "ESCALATE_TO_MANUAL", reasoning: "Retry limit reached" };
        }
        return { action: "RETRY_IN_48H", reasoning: "Lower value, less aggressive retry" };
      case "network_timeout":
        return { action: "RETRY_IMMEDIATELY", reasoning: "Transient error, immediate retry safe" };
      case "card_expired":
        return { action: "REQUEST_CARD_UPDATE", reasoning: "Card expired, need new payment method" };
      case "bank_declined":
        return { action: "ESCALATE_TO_MANUAL", reasoning: "Potential account issue, needs review" };
      case "fraud_hold":
        return { action: "SKIP", reasoning: "Fraud flag — never auto-intervene" };
    }
  }

  if (record.type === "checkout_abandonment") {
    const timeSince = record.recovery_window_hours ?? 0;
    if (timeSince < 5 / 60) {
      return { action: "CART_REMINDER_WHATSAPP", reasoning: "Fresh abandonment, WhatsApp best" };
    }
    if (timeSince < 0.5) {
      return { action: "SMS_PAYMENT_LINK", reasoning: "Moderate urgency, SMS effective" };
    }
    if (timeSince < 120) {
      return { action: "EMAIL_CART_RECOVERY", reasoning: "Older abandonment, email recovery" };
    }
    return { action: "SKIP", reasoning: "Recovery window closed (>2 hours)" };
  }

  if (record.type === "subscription_failure") {
    if (context.lifecycleStage === "retry_window") {
      return { action: "MANDATE_RETRY", reasoning: "Within retry window, attempt mandate" };
    }
    if (context.lifecycleStage === "dunning_started") {
      return { action: "CARD_UPDATE_REQUEST", reasoning: "Dunning started, need payment method update" };
    }
    if (context.lifecycleStage === "near_churn") {
      return { action: "ESCALATE_TO_CHURN_PREVENTION", reasoning: "Near churn, escalate to retention" };
    }
  }

  if (record.type === "overdue_invoice") {
    const daysOverdue = invoiceDaysOverdue(record);
    if (daysOverdue <= 7) {
      return { action: "GENTLE_REMINDER", reasoning: "Just overdue, gentle approach" };
    }
    if (daysOverdue <= 14) {
      return { action: "FIRM_NOTICE", reasoning: "14 days overdue, firm but polite" };
    }
    if (daysOverdue <= 30) {
      return { action: "PAYMENT_PLAN_OFFER", reasoning: "30 days overdue, offer payment plan" };
    }
    return { action: "ESCALATE_LEGAL", reasoning: "60+ days overdue, escalate to legal" };
  }

  if (record.type === "control") {
    return { action: "NO_ACTION", reasoning: "Healthy record, no intervention needed" };
  }

  return { action: "SKIP", reasoning: "Unable to classify, skipping" };
}
