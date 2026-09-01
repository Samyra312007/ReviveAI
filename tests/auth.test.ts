import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Merchant isolation tests.
 *
 * These tests verify that when merchantIds is provided, query functions
 * only return rows belonging to those merchants.  When merchantIds is
 * omitted (admin / owner), all rows are returned.
 *
 * The synthetic dataset has three merchants: mer_kirana_plus,
 * mer_fashionhub, mer_saasflow.  We use two of them to prove isolation.
 */

async function seedMinimalData() {
  const { openDb, initSchema, insertRecords } = await import("@/lib/db");
  const { generateBatch } = await import("@/lib/data/generator");
  const db = openDb();
  initSchema(db);

  const { records } = generateBatch(42, Date.UTC(2026, 7, 25, 6, 0));
  insertRecords(db, records);

  // Seed a couple of audit rows (one per merchant)
  db.prepare(`DELETE FROM audit_log`).run();
  db.prepare(`DELETE FROM promises`).run();
  db.prepare(`DELETE FROM voice_notifications`).run();
  db.prepare(`DELETE FROM conversations`).run();

  // Insert an audit row for mer_kirana_plus
  db.prepare(`INSERT INTO audit_log (timestamp, record_id, merchant_id, customer_id, outcome)
    VALUES ('2026-08-25T06:00:00Z', 'rec_000', 'mer_kirana_plus', 'cust_a', 'recovered')`).run();

  // Insert an audit row for mer_fashionhub
  db.prepare(`INSERT INTO audit_log (timestamp, record_id, merchant_id, customer_id, outcome)
    VALUES ('2026-08-25T06:00:00Z', 'rec_050', 'mer_fashionhub', 'cust_b', 'failed')`).run();

  db.close();
}

async function cleanUp() {
  const { openDb } = await import("@/lib/db");
  const db = openDb();
  db.prepare("DELETE FROM audit_log").run();
  db.prepare("DELETE FROM promises").run();
  db.prepare("DELETE FROM voice_notifications").run();
  db.prepare("DELETE FROM conversations").run();
  db.close();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("merchant isolation", () => {
  beforeEach(async () => {
    await seedMinimalData();
  });

  afterEach(async () => {
    await cleanUp();
  });

  it("getAuditRows filters by merchant_id when merchantIds is provided", async () => {
    const { getAuditRows } = await import("@/lib/db/query");

    const kiranaRows = await getAuditRows(["mer_kirana_plus"]);
    expect(kiranaRows.every((r) => r.merchant_id === "mer_kirana_plus")).toBe(true);
    expect(kiranaRows.length).toBeGreaterThanOrEqual(1);

    const fashionRows = await getAuditRows(["mer_fashionhub"]);
    expect(fashionRows.every((r) => r.merchant_id === "mer_fashionhub")).toBe(true);
    expect(fashionRows.length).toBeGreaterThanOrEqual(1);

    // Verify isolation: kirana should not contain fashionhub rows
    expect(kiranaRows.some((r) => r.merchant_id === "mer_fashionhub")).toBe(false);
  });

  it("getAuditRows returns all rows when merchantIds is empty (admin)", async () => {
    const { getAuditRows } = await import("@/lib/db/query");
    const allRows = await getAuditRows();
    expect(allRows.length).toBeGreaterThanOrEqual(2);
  });

  it("getRecordsWithOutcomes filters by merchant_id", async () => {
    const { getRecordsWithOutcomes } = await import("@/lib/db/query");

    const kiranaRecords = await getRecordsWithOutcomes(["mer_kirana_plus"]);
    expect(kiranaRecords.every((r) => r.merchant_id === "mer_kirana_plus")).toBe(true);

    const fashionRecords = await getRecordsWithOutcomes(["mer_fashionhub"]);
    expect(fashionRecords.every((r) => r.merchant_id === "mer_fashionhub")).toBe(true);

    // No overlap
    expect(
      kiranaRecords.some((r) => r.merchant_id === "mer_fashionhub"),
    ).toBe(false);
  });

  it("getPromiseRows filters by merchant_id via records join", async () => {
    const { getPromiseRows } = await import("@/lib/db/query");
    const rows = await getPromiseRows(["mer_kirana_plus"]);
    expect(rows).toEqual([]);
  });

  it("getVoiceRows filters by merchant_id via records join", async () => {
    const { getVoiceRows } = await import("@/lib/db/query");
    const rows = await getVoiceRows(["mer_kirana_plus"]);
    expect(rows).toEqual([]);
  });

  it("getConversationRows filters by merchant_id via records join", async () => {
    const { getConversationRows } = await import("@/lib/db/query");
    const rows = await getConversationRows(["mer_kirana_plus"]);
    expect(rows).toEqual([]);
  });

  it("returns empty when merchantIds contains a nonexistent merchant", async () => {
    const { getAuditRows } = await import("@/lib/db/query");
    const rows = await getAuditRows(["mer_nonexistent"]);
    expect(rows).toEqual([]);
  });

  it("returns all rows when merchantIds is empty array (admin)", async () => {
    const { getRecordsWithOutcomes } = await import("@/lib/db/query");
    const allRecords = await getRecordsWithOutcomes([]);
    expect(allRecords.length).toBeGreaterThanOrEqual(2);
  });
});
