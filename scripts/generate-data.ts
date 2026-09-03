import { generateBatch, DEFAULT_SEED } from "../src/lib/data/generator";
import {
  openDb,
  initSchema,
  insertRecords,
  insertPromises,
} from "../src/lib/db";

async function main() {
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : DEFAULT_SEED;

  console.log(`Generating synthetic batch (seed=${seed})...`);
  const { records, promises } = generateBatch(seed);

  // 1) Always seed SQLite (local dev / tests)
  const db = openDb();
  initSchema(db);
  insertRecords(db, records);
  insertPromises(db, promises);

  const byType = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});

  const atRisk = records.reduce(
    (sum, r) => sum + r.ground_truth.recoverable_amount,
    0,
  );
  const recoverableCount = records.filter((r) => r.ground_truth.recoverable).length;

  console.log("\nBatch summary:");
  console.log(`  Total records:      ${records.length}`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`    ${type.padEnd(24)} ${count}`);
  }
  console.log(`  Promises tracked:   ${promises.length}`);
  console.log(`  Recoverable:        ${recoverableCount} records`);
  console.log(`  Revenue at risk:    ₹${(atRisk / 100).toLocaleString("en-IN")}`);

  db.close();
  console.log("\nSaved to data/synthetic.db");

  // 2) Also seed Postgres when DATABASE_URL is present
  if (process.env.DATABASE_URL) {
    try {
      const { getDrizzle } = await import("../src/lib/db/pool");
      const pgDb = getDrizzle();
      if (pgDb) {
        const { records: pgRecords, promises: pgPromises } = await import("../src/lib/db/schema");
        const pgRows = records.map((r) => ({
          recordId: r.record_id,
          merchantId: r.merchant_id,
          customerId: r.customer_id,
          type: r.type,
          subcategory: r.subcategory,
          amount: r.amount,
          currency: "INR",
          failureTimestamp: new Date(r.failure_timestamp),
          daysSinceLastOrder: r.days_since_last_order,
          customerEmail: r.customer_email,
          customerPhone: r.customer_phone,
          customerName: r.customer_name,
          customerSegment: r.customer_segment,
          previousPayments: r.previous_payments,
          avgOrderValue: r.avg_order_value,
          failureReason: r.failure_reason,
          lifecycleStage: r.lifecycle_stage ?? null,
          recoveryWindowHours: r.recovery_window_hours ?? null,
          promiseDueDate: r.promise_due_date ? new Date(r.promise_due_date) : null,
          promiseAmount: r.promise_amount ?? null,
          promiseStatus: r.promise_status ?? null,
          preferredLanguage: r.preferred_language ?? null,
          voiceOptIn: r.voice_opt_in ?? null,
          lastVoiceSent: r.last_voice_sent ? new Date(r.last_voice_sent) : null,
          groundTruth: r.ground_truth,
        }));
        for (let i = 0; i < pgRows.length; i += 50) {
          await pgDb.insert(pgRecords).values(pgRows.slice(i, i + 50))
            .onConflictDoNothing();
        }
        const pgPromiseRows = promises.map((p) => ({
          promiseId: p.promise_id,
          recordId: p.record_id,
          customerId: p.customer_id,
          merchantId: p.merchant_id,
          promisedAmount: p.promised_amount,
          promisedDate: new Date(p.promised_date),
          dueDate: new Date(p.due_date),
          promiseSource: p.promise_source,
          status: p.status,
          renewalCount: p.renewal_count,
          remindersSent: p.reminders_sent,
          fulfilledAmount: p.fulfilled_amount ?? null,
          fulfilledDate: p.fulfilled_date ? new Date(p.fulfilled_date) : null,
          createdAt: new Date(p.created_at),
          updatedAt: new Date(p.updated_at),
        }));
        for (let i = 0; i < pgPromiseRows.length; i += 50) {
          await pgDb.insert(pgPromises).values(pgPromiseRows.slice(i, i + 50))
            .onConflictDoNothing();
        }
        console.log(`Seeded ${pgRows.length} records + ${pgPromiseRows.length} promises into Postgres`);
      }
    } catch (e) {
      console.warn("Postgres seeding skipped:", e instanceof Error ? e.message : e);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});