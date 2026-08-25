import { NextResponse } from "next/server";
import { openDb, initSchema, insertPromises, insertVoiceNotifications, clearVoiceNotifications } from "@/lib/db";
import { runBatch } from "@/lib/agent/core";
import { SqliteAuditWriter } from "@/lib/audit/logger";
import { computeVoiceMetrics } from "@/lib/voice/tracker";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface RecordRow {
  [key: string]: unknown;
  ground_truth: string;
  voice_opt_in: number;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const seed = typeof body.seed === "number" ? body.seed : 42;
  const now =
    typeof body.now === "number"
      ? body.now
      : Date.UTC(2026, 7, 25, 6, 0);

  const dbPath = path.join(process.cwd(), "data", "synthetic.db");
  if (!fs.existsSync(dbPath)) {
    return NextResponse.json(
      { error: "No dataset. Run npm run generate-data first." },
      { status: 404 },
    );
  }

  const db = openDb(dbPath);
  try {
    initSchema(db);
    const rows = db
      .prepare("SELECT * FROM records ORDER BY record_id")
      .all() as RecordRow[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Dataset empty." }, { status: 404 });
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

    const result = await runBatch(records, { seed, now });

    db.prepare("DELETE FROM audit_log").run();
    const writer = new SqliteAuditWriter(db);
    writer.write(result.auditEntries);

    clearVoiceNotifications(db);
    insertVoiceNotifications(db, result.voiceNotifications);
    insertPromises(db, result.promiseUpdates);

    const reportPath = path.join(process.cwd(), "data", "report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(result.report, null, 2));

    const voiceMetrics = computeVoiceMetrics(
      result.voiceNotifications,
      result.decisions,
    );

    return NextResponse.json({
      ok: true,
      processed: result.decisions.length,
      processing_time_ms: result.processingTimeMs,
      report: result.report,
      voice: {
        sent: result.voiceNotifications.length,
        metrics: voiceMetrics,
        events: result.promiseEvents.length,
      },
    });
  } finally {
    db.close();
  }
}
