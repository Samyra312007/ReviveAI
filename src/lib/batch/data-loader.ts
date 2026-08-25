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

export type { PromiseRecord };
