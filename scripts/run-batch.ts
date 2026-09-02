import fs from "node:fs";
import path from "node:path";
import { openDb, initSchema, insertPromises, rowToRecord } from "../src/lib/db";
import { runBatch } from "../src/lib/agent/core";
import { SqliteAuditWriter } from "../src/lib/audit/logger";
import {
  insertVoiceNotifications,
  clearVoiceNotifications,
} from "../src/lib/db";

interface RecordRow {
  [key: string]: unknown;
  ground_truth: string;
  voice_opt_in: number;
}

function main() {
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : 42;

  const db = openDb();
  initSchema(db);

  const rows = db.prepare("SELECT * FROM records ORDER BY record_id").all() as RecordRow[];
  if (rows.length === 0) {
    console.error("No records found. Run `npm run generate-data` first.");
    process.exit(1);
  }

  const records = rows.map((row) =>
    rowToRecord({ ...row, voice_opt_in: row.voice_opt_in === 1 } as never),
  );

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
    if (history) r.promise_history = [history] as never;
  }

  console.log(`Running batch: ${records.length} records (seed=${seed})...\n`);
  const start = Date.now();

  runBatch(records, { seed })
    .then(async (result) => {
      db.prepare("DELETE FROM audit_log").run();
      const writer = new SqliteAuditWriter(db);
      writer.write(result.auditEntries);

      clearVoiceNotifications(db);
      insertVoiceNotifications(db, result.voiceNotifications);
      insertPromises(db, result.promiseUpdates);

      // Dual-write: Postgres reports table (production) + file (local fallback)
      if (process.env.DATABASE_URL) {
        try {
          const { getDrizzle } = await import("../src/lib/db/pool");
          const pgDb = getDrizzle();
          if (pgDb) {
            const { reports } = await import("../src/lib/db/schema");
            await pgDb.insert(reports).values({ report: result.report });
          }
        } catch (e) {
          console.warn(
            "Postgres report write failed — falling back to file:",
            e instanceof Error ? e.message : String(e),
          );
        }
      }
      const reportPath = path.join(process.cwd(), "data", "report.json");
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(result.report, null, 2));

      const hero = result.report.hero;
      console.log("═══════════════════════════════════════════");
      console.log(`  ${hero.recovered_display} recovered from ${hero.at_risk_display} at risk`);
      console.log(`  Recovery Rate: ${hero.recovery_rate_pct}%   Net ROI: ${hero.roi_display}`);
      console.log("═══════════════════════════════════════════");
      console.log("\nBy category:");
      for (const cat of result.report.recovery_by_category) {
        console.log(
          `  ${cat.category.padEnd(24)} at risk ${(cat.at_risk_paise / 100).toLocaleString("en-IN").padStart(10)}  recovered ${(cat.recovered_paise / 100).toLocaleString("en-IN").padStart(10)}  rate ${Math.round(cat.recovery_rate * 1000) / 10}%`,
        );
      }
      console.log("\nDetection accuracy:");
      console.log(
        `  precision=${result.report.accuracy.overall.precision} recall=${result.report.accuracy.overall.recall} f1=${result.report.accuracy.overall.f1} fp_rate=${result.report.accuracy.false_positive_rate}`,
      );
      console.log("\nGuardrails:");
      console.log(`  blocks=${result.report.guardrails.total_blocks} (${result.report.guardrails.block_rate}%)`);
      for (const [rule, count] of Object.entries(result.report.guardrails.blocks_by_rule)) {
        console.log(`    ${rule}: ${count}`);
      }
      console.log(`\nOperational:`);
      const op = result.report.operational;
      console.log(
        `  intervened=${op.records_intervened} skipped=${op.records_skipped} escalated=${op.records_escalated} blocked=${op.records_blocked} api_errors=${op.api_errors}`,
      );
      console.log(`  wall time: ${Date.now() - start}ms`);
      console.log(`\nAudit entries written: ${result.auditEntries.length}`);
      console.log(`Voice notifications sent: ${result.voiceNotifications.length}`);
      console.log(`Promise updates: ${result.promiseUpdates.length} (events: ${result.promiseEvents.length})`);
      console.log(`Report saved to data/report.json`);
      db.close();
    })
    .catch((err) => {
      console.error("Batch failed:", err);
      process.exit(1);
    });
}

main();
