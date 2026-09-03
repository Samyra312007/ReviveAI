import { openDb, initSchema } from "@/lib/db";
import { safeJsonParse } from "@/lib/db/json";
import { SyntheticRecord, PromiseRecord, ReminderRecord, GroundTruth } from "@/lib/data/schema";
import path from "node:path";
import fs from "node:fs";

const EMPTY_GROUND_TRUTH: GroundTruth = {
  recoverable: false,
  recommended_intervention: "",
  expected_recovery_probability: 0,
  max_retries_allowed: 0,
  recoverable_amount: 0,
};

interface RecordRow {
  [key: string]: unknown;
  ground_truth: string;
  voice_opt_in: number;
}

export interface BatchDataset {
  records: SyntheticRecord[];
  promisesByRecordId: Map<string, unknown>;
}

export function loadBatchDataset(dbPath?: string): BatchDataset | null {
  const resolved = dbPath ?? path.join(process.cwd(), "data", "synthetic.db");
  if (!fs.existsSync(resolved)) return null;

  const db = openDb(resolved);
  try {
    initSchema(db);

    const rows = db
      .prepare("SELECT * FROM records ORDER BY record_id")
      .all() as RecordRow[];
    if (rows.length === 0) return null;

    const records = rows.map((row) => ({
      ...row,
      voice_opt_in: row.voice_opt_in === 1,
      ground_truth: safeJsonParse<GroundTruth>(
        row.ground_truth as string,
        EMPTY_GROUND_TRUTH,
      ),
    })) as unknown as SyntheticRecord[];

    const promiseRows = db
      .prepare("SELECT * FROM promises")
      .all() as {
      [key: string]: unknown;
      record_id: string;
      reminders_sent: string;
    }[];
    const promisesByRecordId = new Map<string, unknown>();
    for (const p of promiseRows) {
      promisesByRecordId.set(p.record_id, {
        ...p,
        reminders_sent: safeJsonParse<ReminderRecord[]>(p.reminders_sent, []),
      });
    }

    return { records, promisesByRecordId };
  } finally {
    db.close();
  }
}

export function attachPromiseHistories(
  dataset: BatchDataset,
): SyntheticRecord[] {
  return dataset.records.map((r) => {
    const history = dataset.promisesByRecordId.get(r.record_id);
    if (!history) return r;
    return {
      ...r,
      promise_history: [structuredClone(history)],
    } as SyntheticRecord;
  });
}

/**
 * Load a batch dataset from Postgres `records` (production path).
 * Filters by merchant ids when provided; returns null when PG is
 * unavailable or no records exist for the given merchants.
 */
export async function loadBatchDatasetFromPg(
  merchantIds?: string[],
): Promise<BatchDataset | null> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) return null;
  const { records, promises } = await import("@/lib/db/schema");
  const { and, inArray, asc } = await import("drizzle-orm");
  const { safeJsonParse } = await import("@/lib/db/json");

  const conds = merchantIds?.length ? [inArray(records.merchantId, merchantIds)] : [];
  const rows = await db
    .select()
    .from(records)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(records.recordId));
  if (rows.length === 0) return null;

  const mapped = rows.map((r) => ({
    record_id: r.recordId,
    merchant_id: r.merchantId,
    customer_id: r.customerId,
    type: r.type as SyntheticRecord["type"],
    subcategory: r.subcategory,
    amount: r.amount,
    currency: r.currency as "INR",
    failure_timestamp: r.failureTimestamp?.toISOString() ?? "",
    days_since_last_order: r.daysSinceLastOrder,
    customer_email: r.customerEmail,
    customer_phone: r.customerPhone,
    customer_name: r.customerName,
    customer_segment: r.customerSegment as SyntheticRecord["customer_segment"],
    previous_payments: r.previousPayments,
    avg_order_value: r.avgOrderValue,
    failure_reason: r.failureReason,
    lifecycle_stage: r.lifecycleStage ?? undefined,
    recovery_window_hours: r.recoveryWindowHours ?? undefined,
    promise_due_date: r.promiseDueDate?.toISOString() ?? undefined,
    promise_amount: r.promiseAmount ?? undefined,
    promise_status: r.promiseStatus ?? undefined,
    preferred_language: r.preferredLanguage as SyntheticRecord["preferred_language"] ?? undefined,
    voice_opt_in: r.voiceOptIn ?? undefined,
    last_voice_sent: r.lastVoiceSent?.toISOString() ?? undefined,
    ground_truth: safeJsonParse(
      typeof r.groundTruth === "string" ? r.groundTruth : JSON.stringify(r.groundTruth ?? {}),
      EMPTY_GROUND_TRUTH,
    ),
  })) as unknown as SyntheticRecord[];

  // Load promise histories for these records
  const promiseRows = await db.select().from(promises).orderBy(asc(promises.promiseId));
  const promisesByRecordId = new Map<string, unknown>();
  for (const p of promiseRows) {
    promisesByRecordId.set(p.recordId, {
      promise_id: p.promiseId,
      record_id: p.recordId,
      customer_id: p.customerId,
      merchant_id: p.merchantId,
      promised_amount: p.promisedAmount,
      promised_date: p.promisedDate?.toISOString() ?? "",
      due_date: p.dueDate?.toISOString() ?? "",
      promise_source: p.promiseSource,
      status: p.status,
      renewal_count: p.renewalCount,
      reminders_sent: p.remindersSent ?? [],
      fulfilled_amount: p.fulfilledAmount ?? undefined,
      fulfilled_date: p.fulfilledDate?.toISOString() ?? undefined,
      created_at: p.createdAt?.toISOString() ?? "",
      updated_at: p.updatedAt?.toISOString() ?? "",
    });
  }

  return { records: mapped, promisesByRecordId };
}

export type { PromiseRecord };
