import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDb, initSchema, insertPromises, insertVoiceNotifications, clearVoiceNotifications } from "@/lib/db";
import { runBatch } from "@/lib/agent/core";
import { SqliteAuditWriter } from "@/lib/audit/logger";
import { computeVoiceMetrics } from "@/lib/voice/tracker";

export const DEMO_BATCH_TOKEN = "reviveai-demo-token";

const SERVER_SEED = 42;
const SERVER_NOW = Date.UTC(2026, 7, 25, 6, 0);

export interface BatchRunResponse {
  status: number;
  body: Record<string, unknown>;
}

function tokensMatch(provided: string | null): boolean {
  const expected = process.env.BATCH_TOKEN || DEMO_BATCH_TOKEN;
  const a = Buffer.from(provided ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let inFlight: Promise<BatchRunResponse> | null = null;

export function executeBatchRun(token: string | null): Promise<BatchRunResponse> {
  if (!tokensMatch(token)) {
    return Promise.resolve({ status: 401, body: { error: "Unauthorized — missing or invalid x-batch-token" } });
  }
  if (inFlight) {
    return Promise.resolve({ status: 409, body: { error: "A batch run is already in progress" } });
  }
  inFlight = performRun().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

interface RecordRow {
  [key: string]: unknown;
  ground_truth: string;
  voice_opt_in: number;
}

async function performRun(): Promise<BatchRunResponse> {
  const dbPath = path.join(process.cwd(), "data", "synthetic.db");
  if (!fs.existsSync(dbPath)) {
    return { status: 404, body: { error: "No dataset. Run npm run generate-data first." } };
  }

  const db = openDb(dbPath);
  try {
    initSchema(db);
    const rows = db
      .prepare("SELECT * FROM records ORDER BY record_id")
      .all() as RecordRow[];
    if (rows.length === 0) {
      return { status: 404, body: { error: "Dataset empty." } };
    }

    const records = rows.map((row) => ({
      ...row,
      voice_opt_in: row.voice_opt_in === 1,
      ground_truth: JSON.parse(row.ground_truth as string),
    })) as never as Parameters<typeof runBatch>[0];

    const promiseRows = db
      .prepare("SELECT * FROM promises")
      .all() as {
      [key: string]: unknown;
      record_id: string;
      reminders_sent: string;
    }[];
    const promisesByRecord = new Map<string, unknown>();
    for (const p of promiseRows) {
      promisesByRecord.set(p.record_id, {
        ...p,
        reminders_sent: JSON.parse(p.reminders_sent),
      });
    }
    for (const r of records) {
      const history = promisesByRecord.get(r.record_id);
      if (history && typeof r === "object" && r !== null) {
        (r as { promise_history?: unknown }).promise_history = [history];
      }
    }

    const result = await runBatch(records, {
      seed: SERVER_SEED,
      now: SERVER_NOW,
    });

    const persist = db.transaction(() => {
      db.prepare("DELETE FROM audit_log").run();
      new SqliteAuditWriter(db).write(result.auditEntries);
      clearVoiceNotifications(db);
      insertVoiceNotifications(db, result.voiceNotifications);
      insertPromises(db, result.promiseUpdates);
    });
    persist();

    const reportPath = path.join(process.cwd(), "data", "report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(result.report, null, 2));

    const voiceMetrics = computeVoiceMetrics(
      result.voiceNotifications,
      result.decisions,
    );

    return {
      status: 200,
      body: {
        ok: true,
        processed: result.decisions.length,
        processing_time_ms: result.processingTimeMs,
        report: result.report,
        voice: {
          sent: result.voiceNotifications.length,
          metrics: voiceMetrics,
          events: result.promiseEvents.length,
        },
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        error: "Batch execution failed",
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    db.close();
  }
}
