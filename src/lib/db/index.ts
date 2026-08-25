import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SyntheticRecord, PromiseRecord, VoiceNotification } from "@/lib/data/schema";

const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "synthetic.db");

export function openDb(dbPath: string = DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      record_id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      failure_timestamp TEXT NOT NULL,
      days_since_last_order INTEGER NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_segment TEXT NOT NULL,
      previous_payments INTEGER NOT NULL,
      avg_order_value INTEGER NOT NULL,
      failure_reason TEXT NOT NULL,
      lifecycle_stage TEXT,
      recovery_window_hours REAL,
      promise_due_date TEXT,
      promise_amount INTEGER,
      promise_status TEXT,
      preferred_language TEXT,
      voice_opt_in INTEGER,
      last_voice_sent TEXT,
      ground_truth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS promises (
      promise_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL REFERENCES records(record_id),
      customer_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      promised_amount INTEGER NOT NULL,
      promised_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      promise_source TEXT NOT NULL,
      status TEXT NOT NULL,
      renewal_count INTEGER NOT NULL DEFAULT 0,
      reminders_sent TEXT NOT NULL DEFAULT '[]',
      fulfilled_amount INTEGER,
      fulfilled_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      record_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      detected_category TEXT,
      detected_subcategory TEXT,
      detection_confidence REAL,
      selected_strategy TEXT,
      decision_reasoning TEXT,
      guardrail_checks TEXT,
      action_taken TEXT,
      api_call TEXT,
      outcome TEXT NOT NULL,
      amount_recovered INTEGER,
      time_to_recovery_hours REAL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS voice_notifications (
      notification_id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      language TEXT NOT NULL,
      personalized_text TEXT NOT NULL,
      tone TEXT NOT NULL,
      channel TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      delivered_at TEXT,
      audio_file_path TEXT,
      audio_duration_seconds REAL NOT NULL,
      tts_engine TEXT NOT NULL,
      customer_responded INTEGER NOT NULL DEFAULT 0,
      response_type TEXT,
      response_timestamp TEXT,
      created_at TEXT NOT NULL,
      simulated INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);
    CREATE INDEX IF NOT EXISTS idx_records_customer ON records(customer_id);
    CREATE INDEX IF NOT EXISTS idx_promises_record ON promises(record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_log(outcome);
    CREATE INDEX IF NOT EXISTS idx_voice_record ON voice_notifications(record_id);
  `);
}

interface RecordRow extends Omit<SyntheticRecord, "voice_opt_in" | "promise_history"> {
  voice_opt_in: number;
}

export function insertRecords(
  db: Database.Database,
  records: SyntheticRecord[],
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO records (
      record_id, merchant_id, customer_id, type, subcategory, amount, currency,
      failure_timestamp, days_since_last_order, customer_email, customer_phone,
      customer_name, customer_segment, previous_payments, avg_order_value,
      failure_reason, lifecycle_stage, recovery_window_hours,
      promise_due_date, promise_amount, promise_status,
      preferred_language, voice_opt_in, last_voice_sent, ground_truth
    ) VALUES (
      @record_id, @merchant_id, @customer_id, @type, @subcategory, @amount, @currency,
      @failure_timestamp, @days_since_last_order, @customer_email, @customer_phone,
      @customer_name, @customer_segment, @previous_payments, @avg_order_value,
      @failure_reason, @lifecycle_stage, @recovery_window_hours,
      @promise_due_date, @promise_amount, @promise_status,
      @preferred_language, @voice_opt_in, @last_voice_sent, @ground_truth
    )
  `);

  const insertAll = db.transaction((recs: SyntheticRecord[]) => {
    for (const r of recs) {
      stmt.run({
        ...r,
        lifecycle_stage: r.lifecycle_stage ?? null,
        recovery_window_hours: r.recovery_window_hours ?? null,
        promise_due_date: r.promise_due_date ?? null,
        promise_amount: r.promise_amount ?? null,
        promise_status: r.promise_status ?? null,
        preferred_language: r.preferred_language ?? null,
        last_voice_sent: r.last_voice_sent ?? null,
        voice_opt_in: r.voice_opt_in ? 1 : 0,
        ground_truth: JSON.stringify(r.ground_truth),
      });
    }
  });

  insertAll(records);
}

export function insertPromises(
  db: Database.Database,
  promises: PromiseRecord[],
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO promises (
      promise_id, record_id, customer_id, merchant_id,
      promised_amount, promised_date, due_date, promise_source,
      status, renewal_count, reminders_sent,
      fulfilled_amount, fulfilled_date, created_at, updated_at
    ) VALUES (
      @promise_id, @record_id, @customer_id, @merchant_id,
      @promised_amount, @promised_date, @due_date, @promise_source,
      @status, @renewal_count, @reminders_sent,
      @fulfilled_amount, @fulfilled_date, @created_at, @updated_at
    )
  `);

  const insertAll = db.transaction((ps: PromiseRecord[]) => {
    for (const p of ps) {
      stmt.run({
        ...p,
        reminders_sent: JSON.stringify(p.reminders_sent),
        fulfilled_amount: p.fulfilled_amount ?? null,
        fulfilled_date: p.fulfilled_date ?? null,
      });
    }
  });

  insertAll(promises);
}

export function rowToRecord(row: RecordRow): SyntheticRecord {
  return {
    ...row,
    voice_opt_in: row.voice_opt_in === 1 || (row.voice_opt_in as unknown) === true,
    ground_truth: JSON.parse(row.ground_truth as unknown as string),
  };
}

export function insertVoiceNotifications(
  db: Database.Database,
  notifications: VoiceNotification[],
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO voice_notifications (
      notification_id, record_id, customer_id, template_id, language,
      personalized_text, tone, channel, delivery_status, delivered_at,
      audio_file_path, audio_duration_seconds, tts_engine,
      customer_responded, response_type, response_timestamp,
      created_at, simulated
    ) VALUES (
      @notification_id, @record_id, @customer_id, @template_id, @language,
      @personalized_text, @tone, @channel, @delivery_status, @delivered_at,
      @audio_file_path, @audio_duration_seconds, @tts_engine,
      @customer_responded, @response_type, @response_timestamp,
      @created_at, @simulated
    )
  `);

  const insertAll = db.transaction((all: VoiceNotification[]) => {
    for (const n of all) {
      stmt.run({
        ...n,
        audio_file_path: n.audio_file_path ?? null,
        response_type: n.response_type ?? null,
        response_timestamp: n.response_timestamp ?? null,
        customer_responded: n.customer_responded ? 1 : 0,
        simulated: n.simulated ? 1 : 0,
      });
    }
  });

  insertAll(notifications);
}

export function clearVoiceNotifications(db: Database.Database): void {
  db.prepare("DELETE FROM voice_notifications").run();
}
