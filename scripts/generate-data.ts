import { generateBatch, DEFAULT_SEED } from "../src/lib/data/generator";
import {
  openDb,
  initSchema,
  insertRecords,
  insertPromises,
} from "../src/lib/db";

function main() {
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : DEFAULT_SEED;

  console.log(`Generating synthetic batch (seed=${seed})...`);
  const { records, promises } = generateBatch(seed);

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
}

main();
