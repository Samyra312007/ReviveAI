import { NotificationPrefs } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export interface MerchantRow {
  merchant_id: string;
  user_id: string;
  business_name: string;
  razorpay_key_id: string;
  razorpay_key_secret_enc: string;
  webhook_secret_enc: string;
  notification_prefs: string | NotificationPrefs;
  created_at: string;
  updated_at: string;
}

export interface MerchantPublic {
  merchant_id: string;
  business_name: string;
  razorpay_key_id: string;
  razorpay_key_id_masked: string;
  notification_prefs: NotificationPrefs;
  created_at: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  whatsappEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "09:00",
  dailyLimit: 50,
};

export function parsePrefs(raw: string | NotificationPrefs | null | undefined): NotificationPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  if (typeof raw === "object") return { ...DEFAULT_PREFS, ...raw };
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function toPublic(row: MerchantRow): MerchantPublic {
  const keyId = row.razorpay_key_id;
  return {
    merchant_id: row.merchant_id,
    business_name: row.business_name,
    razorpay_key_id: keyId,
    razorpay_key_id_masked: `${keyId.slice(0, 8)}…${keyId.slice(-4)}`,
    notification_prefs: parsePrefs(row.notification_prefs),
    created_at: row.created_at,
  };
}

// ── Postgres path ────────────────────────────────────────────────────────────

export async function getMerchantsForUserPg(userId: string): Promise<MerchantPublic[]> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) return [];
  const { merchants } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(merchants).where(eq(merchants.userId, userId));
  return rows.map((r) =>
    toPublic({
      merchant_id: r.merchantId,
      user_id: r.userId,
      business_name: r.businessName,
      razorpay_key_id: r.razorpayKeyId,
      razorpay_key_secret_enc: r.razorpayKeySecretEnc,
      webhook_secret_enc: r.webhookSecretEnc,
      notification_prefs: r.notificationPrefs as unknown as string | NotificationPrefs,
      created_at: r.createdAt?.toISOString() ?? "",
      updated_at: r.updatedAt?.toISOString() ?? "",
    }),
  );
}

export async function getMerchantByIdPg(merchantId: string): Promise<MerchantRow | null> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) return null;
  const { merchants } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db.select().from(merchants).where(eq(merchants.merchantId, merchantId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    merchant_id: r.merchantId,
    user_id: r.userId,
    business_name: r.businessName,
    razorpay_key_id: r.razorpayKeyId,
    razorpay_key_secret_enc: r.razorpayKeySecretEnc,
    webhook_secret_enc: r.webhookSecretEnc,
    notification_prefs: r.notificationPrefs as unknown as string | NotificationPrefs,
    created_at: r.createdAt?.toISOString() ?? "",
    updated_at: r.updatedAt?.toISOString() ?? "",
  };
}

export async function getAllMerchantsPg(): Promise<MerchantRow[]> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) return [];
  const { merchants } = await import("@/lib/db/schema");
  const rows = await db.select().from(merchants);
  return rows.map((r) => ({
    merchant_id: r.merchantId,
    user_id: r.userId,
    business_name: r.businessName,
    razorpay_key_id: r.razorpayKeyId,
    razorpay_key_secret_enc: r.razorpayKeySecretEnc,
    webhook_secret_enc: r.webhookSecretEnc,
    notification_prefs: r.notificationPrefs as unknown as string | NotificationPrefs,
    created_at: r.createdAt?.toISOString() ?? "",
    updated_at: r.updatedAt?.toISOString() ?? "",
  }));
}

export async function upsertMerchantPg(input: {
  merchantId: string;
  userId: string;
  businessName: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  webhookSecret: string;
  notificationPrefs?: NotificationPrefs;
}): Promise<void> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) throw new Error("Postgres pool not available");
  const { merchants } = await import("@/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  await db
    .insert(merchants)
    .values({
      merchantId: input.merchantId,
      userId: input.userId,
      businessName: input.businessName,
      razorpayKeyId: input.razorpayKeyId,
      razorpayKeySecretEnc: encryptSecret(input.razorpayKeySecret),
      webhookSecretEnc: encryptSecret(input.webhookSecret),
      notificationPrefs: input.notificationPrefs ?? DEFAULT_PREFS,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: merchants.merchantId,
      set: {
        razorpayKeyId: input.razorpayKeyId,
        razorpayKeySecretEnc: encryptSecret(input.razorpayKeySecret),
        webhookSecretEnc: encryptSecret(input.webhookSecret),
        businessName: input.businessName,
        updatedAt: sql`NOW()`,
      },
    });
}

export async function updateMerchantPrefsPg(
  merchantId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (!db) return;
  const { merchants } = await import("@/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  await db
    .update(merchants)
    .set({ notificationPrefs: prefs, updatedAt: sql`NOW()` })
    .where(eq(merchants.merchantId, merchantId));
}

// ── SQLite path (local dev / tests) ─────────────────────────────────────────

export function getMerchantsForUserSqlite(userId: string): MerchantPublic[] {
  const db = getSqlite();
  if (!db) return [];
  try {
    const rows = db.prepare("SELECT * FROM merchants WHERE user_id = ?").all(userId) as MerchantRow[];
    return rows.map(toPublic);
  } finally {
    db.close();
  }
}

export function getMerchantByIdSqlite(merchantId: string): MerchantRow | null {
  const db = getSqlite();
  if (!db) return null;
  try {
    const row = db.prepare("SELECT * FROM merchants WHERE merchant_id = ?").get(merchantId) as MerchantRow | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
}

export function getAllMerchantsSqlite(): MerchantRow[] {
  const db = getSqlite();
  if (!db) return [];
  try {
    return db.prepare("SELECT * FROM merchants").all() as MerchantRow[];
  } finally {
    db.close();
  }
}

export function upsertMerchantSqlite(input: {
  merchantId: string;
  userId: string;
  businessName: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  webhookSecret: string;
  notificationPrefs?: NotificationPrefs;
}): void {
  const db = getSqlite();
  if (!db) return;
  try {
    db.prepare(`
      INSERT OR REPLACE INTO merchants (
        merchant_id, user_id, business_name, razorpay_key_id,
        razorpay_key_secret_enc, webhook_secret_enc, notification_prefs,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.merchantId,
      input.userId,
      input.businessName,
      input.razorpayKeyId,
      encryptSecret(input.razorpayKeySecret),
      encryptSecret(input.webhookSecret),
      JSON.stringify(input.notificationPrefs ?? DEFAULT_PREFS),
      new Date().toISOString(),
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
}

export function updateMerchantPrefsSqlite(merchantId: string, prefs: NotificationPrefs): void {
  const db = getSqlite();
  if (!db) return;
  try {
    db.prepare("UPDATE merchants SET notification_prefs = ?, updated_at = ? WHERE merchant_id = ?")
      .run(JSON.stringify(prefs), new Date().toISOString(), merchantId);
  } finally {
    db.close();
  }
}

function getSqlite() {
  const fs = require("node:fs") as typeof import("node:fs");
  const DB_PATH = `${process.cwd()}/data/synthetic.db`;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    return db;
  } catch {
    return null;
  }
}

// ── Unified helpers (PG first, SQLite fallback) ─────────────────────────────

export async function getMerchantsForUser(userId: string): Promise<MerchantPublic[]> {
  if (process.env.DATABASE_URL) {
    const r = await getMerchantsForUserPg(userId).catch(() => null);
    if (r) return r;
  }
  return getMerchantsForUserSqlite(userId);
}

export async function getMerchantBySecret(webhookSecret: string): Promise<MerchantRow | null> {
  const rows = process.env.DATABASE_URL
    ? await getAllMerchantsPg().catch(() => [])
    : getAllMerchantsSqlite();
  for (const row of rows) {
    try {
      if (decryptSecret(row.webhook_secret_enc) === webhookSecret) return row;
    } catch {
      // skip undecryptable rows
    }
  }
  return null;
}

export async function getMerchantById(merchantId: string): Promise<MerchantRow | null> {
  if (process.env.DATABASE_URL) {
    const r = await getMerchantByIdPg(merchantId).catch(() => null);
    if (r) return r;
  }
  return getMerchantByIdSqlite(merchantId);
}

export async function getAllMerchants(): Promise<MerchantRow[]> {
  if (process.env.DATABASE_URL) {
    const r = await getAllMerchantsPg().catch(() => null);
    if (r) return r;
  }
  return getAllMerchantsSqlite();
}

export async function upsertMerchant(input: {
  merchantId: string;
  userId: string;
  businessName: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  webhookSecret: string;
  notificationPrefs?: NotificationPrefs;
}): Promise<void> {
  if (process.env.DATABASE_URL) {
    const ok = await upsertMerchantPg(input).catch(() => false);
    if (ok !== false) return;
  }
  upsertMerchantSqlite(input);
}

export async function updateMerchantPrefs(merchantId: string, prefs: NotificationPrefs): Promise<void> {
  if (process.env.DATABASE_URL) {
    await updateMerchantPrefsPg(merchantId, prefs).catch(() => {});
    return;
  }
  updateMerchantPrefsSqlite(merchantId, prefs);
}