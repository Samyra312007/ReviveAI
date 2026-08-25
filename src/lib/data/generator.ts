import {
  Rng,
} from "./seed";
import {
  GroundTruth,
  PromiseRecord,
  RECORD_COUNTS,
  ReminderRecord,
  SUBCATEGORY_COUNTS,
  SyntheticRecord,
  RecordType,
  CustomerSegment,
  PreferredLanguage,
} from "./schema";

export const DEFAULT_SEED = 42;

const FIRST_NAMES_MALE = [
  "Ravi", "Amit", "Suresh", "Rahul", "Vikram", "Arjun", "Karan", "Rohit",
  "Sandeep", "Deepak", "Manish", "Pankaj",
];
const FIRST_NAMES_FEMALE = [
  "Priya", "Neha", "Kavita", "Ananya", "Sneha", "Divya", "Meera", "Pooja",
  "Shreya", "Anita", "Lakshmi", "Rekha",
];
const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Iyer", "Gupta", "Singh", "Kumar",
  "Nair", "Joshi", "Mehta", "Desai", "Chopra", "Bose",
];

const EMAIL_DOMAINS: [string, number][] = [
  ["gmail.com", 55],
  ["yahoo.com", 15],
  ["outlook.com", 10],
  ["corporate-biz.in", 10],
  ["zohomail.in", 10],
];

const SEGMENTS: [CustomerSegment, number][] = [
  ["mid_value", 60],
  ["high_value", 25],
  ["low_value", 15],
];

const LANGUAGES: [PreferredLanguage, number][] = [
  ["hinglish", 45],
  ["hi", 35],
  ["en", 20],
];

const MERCHANT_IDS = ["mer_kirana_plus", "mer_fashionhub", "mer_saasflow"];

interface SubcategoryProfile {
  failure_reason: string;
  amount_range: [number, number]; // rupees
  recovery_probability: [number, number];
  recommended_intervention: string;
  max_retries: number;
  lifecycle_stage?: string;
  recovery_window_hours?: [number, number];
}

const PROFILES: Record<string, Record<string, SubcategoryProfile>> = {
  payment_failure: {
    insufficient_funds: {
      failure_reason: "Insufficient funds in account",
      amount_range: [199, 15000],
      recovery_probability: [0.6, 0.85],
      recommended_intervention: "RETRY_IN_24H",
      max_retries: 2,
    },
    network_timeout: {
      failure_reason: "Network timeout at payment gateway",
      amount_range: [49, 8000],
      recovery_probability: [0.85, 0.95],
      recommended_intervention: "RETRY_IMMEDIATELY",
      max_retries: 1,
    },
    card_expired: {
      failure_reason: "Card expired",
      amount_range: [299, 20000],
      recovery_probability: [0.45, 0.65],
      recommended_intervention: "REQUEST_CARD_UPDATE",
      max_retries: 1,
    },
    bank_declined: {
      failure_reason: "Bank declined transaction",
      amount_range: [500, 50000],
      recovery_probability: [0.2, 0.4],
      recommended_intervention: "ESCALATE_TO_MANUAL",
      max_retries: 1,
    },
    fraud_hold: {
      failure_reason: "Transaction flagged as potential fraud",
      amount_range: [2000, 60000],
      recovery_probability: [0.0, 0.0],
      recommended_intervention: "SKIP",
      max_retries: 0,
    },
  },
  checkout_abandonment: {
    form_abandonment: {
      failure_reason: "Customer abandoned checkout form",
      amount_range: [299, 12000],
      recovery_probability: [0.35, 0.6],
      recommended_intervention: "CART_REMINDER_WHATSAPP",
      max_retries: 1,
      recovery_window_hours: [0.05, 3],
    },
    payment_page_exit: {
      failure_reason: "Customer exited at payment page",
      amount_range: [499, 25000],
      recovery_probability: [0.4, 0.65],
      recommended_intervention: "SMS_PAYMENT_LINK",
      max_retries: 1,
      recovery_window_hours: [0.1, 28],
    },
    price_shock: {
      failure_reason: "Customer left after seeing final price",
      amount_range: [999, 40000],
      recovery_probability: [0.1, 0.3],
      recommended_intervention: "EMAIL_CART_RECOVERY",
      max_retries: 1,
      recovery_window_hours: [24, 110],
    },
    comparison_shopping: {
      failure_reason: "Customer likely comparison shopping",
      amount_range: [1499, 30000],
      recovery_probability: [0.05, 0.2],
      recommended_intervention: "SKIP",
      max_retries: 0,
      recovery_window_hours: [100, 160],
    },
  },
  subscription_failure: {
    insufficient_balance: {
      failure_reason: "Insufficient balance for auto-debit",
      amount_range: [99, 4999],
      recovery_probability: [0.55, 0.8],
      recommended_intervention: "MANDATE_RETRY",
      max_retries: 3,
      lifecycle_stage: "retry_window",
    },
    mandate_not_triggered: {
      failure_reason: "Mandate not triggered by bank",
      amount_range: [199, 2999],
      recovery_probability: [0.6, 0.8],
      recommended_intervention: "MANDATE_RETRY",
      max_retries: 3,
      lifecycle_stage: "retry_window",
    },
    card_expired: {
      failure_reason: "Card linked to mandate expired",
      amount_range: [149, 4999],
      recovery_probability: [0.35, 0.55],
      recommended_intervention: "CARD_UPDATE_REQUEST",
      max_retries: 1,
      lifecycle_stage: "dunning_started",
    },
    bank_rejection: {
      failure_reason: "Bank rejected mandate debit",
      amount_range: [299, 9999],
      recovery_probability: [0.15, 0.35],
      recommended_intervention: "ESCALATE_TO_CHURN_PREVENTION",
      max_retries: 1,
      lifecycle_stage: "near_churn",
    },
  },
  overdue_invoice: {
    "7_day_late": {
      failure_reason: "Invoice 7 days overdue",
      amount_range: [2000, 25000],
      recovery_probability: [0.6, 0.8],
      recommended_intervention: "GENTLE_REMINDER",
      max_retries: 2,
    },
    "14_day_late": {
      failure_reason: "Invoice 14 days overdue",
      amount_range: [3000, 35000],
      recovery_probability: [0.4, 0.6],
      recommended_intervention: "FIRM_NOTICE",
      max_retries: 2,
    },
    "30_day_late": {
      failure_reason: "Invoice 30 days overdue",
      amount_range: [5000, 45000],
      recovery_probability: [0.25, 0.45],
      recommended_intervention: "PAYMENT_PLAN_OFFER",
      max_retries: 1,
    },
    "60_day_plus_late": {
      failure_reason: "Invoice 60+ days overdue",
      amount_range: [8000, 48000],
      recovery_probability: [0.05, 0.2],
      recommended_intervention: "ESCALATE_LEGAL",
      max_retries: 0,
    },
  },
};

function roundToRupees(paise: number): number {
  return Math.round(paise / 100) * 100;
}

const INVOICE_BUCKET_DAYS: Record<string, number> = {
  "7_day_late": 7,
  "14_day_late": 14,
  "30_day_late": 30,
  "60_day_plus_late": 60,
};

function generateAgeHours(
  rng: Rng,
  type: string,
  subcategory: string,
): number {
  const bias = Math.pow(rng.float(), 1.5);
  switch (type) {
    case "payment_failure":
      return bias * 72;
    case "checkout_abandonment":
      return bias * 120;
    case "subscription_failure":
      return bias * 168;
    case "control":
      return Math.pow(rng.float(), 1.8) * 30 * 24;
    case "overdue_invoice": {
      const bucketDays = INVOICE_BUCKET_DAYS[subcategory] ?? 7;
      const jitterDays = rng.int(0, 2);
      return (bucketDays + jitterDays) * 24;
    }
    default:
      return bias * 24;
  }
}

export interface GenerationResult {
  records: SyntheticRecord[];
  promises: PromiseRecord[];
  seed: number;
}

export function generateBatch(seed: number = DEFAULT_SEED): GenerationResult {
  const rng = new Rng(seed);
  const now = Date.now();
  const records: SyntheticRecord[] = [];
  const promises: PromiseRecord[] = [];
  const usedCustomerIds = new Set<string>();
  let recordNum = 0;
  let promiseNum = 0;

  for (const [type, count] of Object.entries(RECORD_COUNTS)) {
    let typeCount = 0;
    const subcounts = SUBCATEGORY_COUNTS[type];
    for (const [subcategory, subcount] of Object.entries(subcounts)) {
      for (let i = 0; i < subcount; i++) {
        if (typeCount >= count) break;
        typeCount++;
        recordNum++;

        const profile: SubcategoryProfile | null =
          type === "control" ? null : PROFILES[type][subcategory];

        // Identity — unique customer per record (rule: no duplicate customer_ids)
        let customerId: string;
        do {
          customerId = `cus_${rng.int(10000, 99999)}`;
        } while (usedCustomerIds.has(customerId));
        usedCustomerIds.add(customerId);

        const firstName =
          rng.float() < 0.5
            ? rng.pick(FIRST_NAMES_MALE)
            : rng.pick(FIRST_NAMES_FEMALE);
        const lastName = rng.pick(LAST_NAMES);
        const name = `${firstName} ${lastName}`;

        const domain = rng.weighted(EMAIL_DOMAINS);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${rng.int(1, 99)}@${domain}`;
        const phone = `+91${rng.int(60000, 99999)}${rng.int(10000, 99999)}`;
        const merchantId = rng.pick(MERCHANT_IDS);

        const segment = type === "control"
          ? rng.weighted(SEGMENTS)
          : rng.weighted(SEGMENTS);

        // Amounts follow profile range or general spread for control
        const [minRs, maxRs] = profile
          ? profile.amount_range
          : ([49, 50000] as [number, number]);
        const amountRs = Math.round(rng.float() * (maxRs - minRs) + minRs);
        const amount = roundToRupees(amountRs * 100);

        // Timestamps aligned to each type's realistic recovery horizon
        const ageHours = generateAgeHours(rng, type, subcategory);
        // Round to nearest second for deterministic output across runs
        const timestamp = new Date(
          Math.round((now - ageHours * 3600 * 1000) / 1000) * 1000,
        ).toISOString();

        const previousPayments = rng.int(0, 24);
        const avgOrderValue = roundToRupees(
          Math.max(99, amount / rng.int(1, 4)),
        );

        const voiceOptIn = rng.float() < 0.55;
        const preferredLanguage = rng.weighted(LANGUAGES);

        const record: SyntheticRecord = {
          record_id: `rec_${String(recordNum).padStart(3, "0")}`,
          merchant_id: merchantId,
          customer_id: customerId,
          type: type as RecordType,
          subcategory: type === "control" ? "healthy" : subcategory,
          amount,
          currency: "INR",
          failure_timestamp: timestamp,
          days_since_last_order: rng.int(0, 45),
          customer_email: email,
          customer_phone: phone,
          customer_name: name,
          customer_segment: segment,
          previous_payments: previousPayments,
          avg_order_value: avgOrderValue,
          failure_reason: profile ? profile.failure_reason : "No issue — healthy paying customer",
          preferred_language: preferredLanguage,
          voice_opt_in: voiceOptIn,
          ground_truth: buildGroundTruth(rng, type, subcategory, profile, amount),
        };

        if (profile?.lifecycle_stage) {
          record.lifecycle_stage = profile.lifecycle_stage;
        }
        if (profile?.recovery_window_hours) {
          const [hMin, hMax] = profile.recovery_window_hours;
          record.recovery_window_hours =
            Math.round((rng.float() * (hMax - hMin) + hMin) * 10) / 10;
        }

        // Promise-to-pay data for a subset of overdue invoices
        if (type === "overdue_invoice" && rng.float() < 0.7) {
          const promise = buildPromise(
            rng,
            ++promiseNum,
            record,
            now,
            profile!.recommended_intervention === "SKIP",
          );
          promises.push(promise);
          record.promise_amount = promise.promised_amount;
          record.promise_due_date = promise.due_date;
          record.promise_status = mapPromiseStatus(promise.status);
          record.promise_history = [promise];
        }

        records.push(record);
      }
    }
  }

  return { records, promises, seed };
}

function mapPromiseStatus(
  status: PromiseRecord["status"],
): "pending" | "fulfilled" | "broken" | "none" {
  switch (status) {
    case "fulfilled":
      return "fulfilled";
    case "broken":
    case "escalated":
      return "broken";
    default:
      return "pending";
  }
}

function buildGroundTruth(
  rng: Rng,
  type: string,
  subcategory: string,
  profile: SubcategoryProfile | null,
  amount: number,
): GroundTruth {
  if (type === "control") {
    return {
      recoverable: false,
      recommended_intervention: "NO_ACTION",
      expected_recovery_probability: 0.0,
      max_retries_allowed: 0,
      recoverable_amount: 0,
    };
  }

  const [pMin, pMax] = profile!.recovery_probability;
  const probability =
    Math.round((rng.float() * (pMax - pMin) + pMin) * 100) / 100;
  const recoverable = probability > 0;

  // Fraud hold and unrecoverable cases have zero recoverable amount
  const unrecoverableSubcategories = new Set([
    "fraud_hold",
    "comparison_shopping",
  ]);
  const canRecover = recoverable && !unrecoverableSubcategories.has(subcategory);

  return {
    recoverable: canRecover,
    recommended_intervention: profile!.recommended_intervention,
    expected_recovery_probability: probability,
    max_retries_allowed: profile!.max_retries,
    recoverable_amount: canRecover ? amount : 0,
  };
}

function toIsoRounded(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString();
}

function buildPromise(
  rng: Rng,
  num: number,
  record: SyntheticRecord,
  now: number,
  willBreak: boolean,
): PromiseRecord {
  const promisedDaysAgo = rng.int(5, 20);
  const promisedDate = new Date(now - promisedDaysAgo * 24 * 3600 * 1000);
  const dueOffsetDays = rng.int(5, 14);
  const dueDate = new Date(promisedDate.getTime() + dueOffsetDays * 24 * 3600 * 1000);

  const sources: PromiseRecord["promise_source"][] = [
    "voice", "sms", "email", "chat", "manual",
  ];
  const source = rng.pick(sources);

  const status: PromiseRecord["status"] = willBreak
    ? (rng.float() < 0.3 ? "escalated" : "broken")
    : (rng.float() < 0.65 ? "fulfilled" : "pending");

  const reminders: ReminderRecord[] = [];
  const reminderTypes: ReminderRecord["reminder_type"][] = [
    "pre_due", "on_due",
  ];
  reminderTypes.forEach((rtype, idx) => {
    if (rng.float() < 0.7) {
      reminders.push({
        reminder_id: `rem_${num}_${idx}`,
        reminder_type: rtype,
        channel: rng.pick(["sms", "whatsapp", "email"] as const),
        sent_at: toIsoRounded(dueDate.getTime() - (2 - idx) * 12 * 3600 * 1000),
        message:
          rtype === "pre_due"
            ? "Reminder: your payment of the promised amount is due soon."
            : "Today is your promised payment date.",
      });
    }
  });

  const fulfilled = status === "fulfilled";

  return {
    promise_id: `prom_${String(num).padStart(3, "0")}`,
    record_id: record.record_id,
    customer_id: record.customer_id,
    merchant_id: record.merchant_id,
    promised_amount: record.amount,
    promised_date: toIsoRounded(promisedDate.getTime()),
    due_date: toIsoRounded(dueDate.getTime()),
    promise_source: source,
    status,
    renewal_count: status === "broken" && rng.float() < 0.4 ? rng.int(1, 2) : 0,
    reminders_sent: reminders,
    fulfilled_amount: fulfilled ? record.amount : undefined,
    fulfilled_date: fulfilled ? toIsoRounded(dueDate.getTime()) : undefined,
    created_at: toIsoRounded(promisedDate.getTime()),
    updated_at: toIsoRounded(
      fulfilled ? dueDate.getTime() : now - 24 * 3600 * 1000,
    ),
  };
}
