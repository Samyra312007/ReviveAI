import { NextResponse } from "next/server";
import { verifyRazorpaySignature, mapRazorpayEvent, type RazorpayWebhookEvent } from "@/lib/razorpay/webhook";
import { getAllMerchants } from "@/lib/db/merchants";
import { decryptSecret } from "@/lib/crypto";
import { childLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = childLogger("api/webhooks/razorpay");

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!rawBody || !signature) {
    return NextResponse.json({ error: "Missing body or signature" }, { status: 400 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the merchant by matching the webhook secret.
  const merchant = await getMerchantBySecretFromBody(rawBody, signature);
  if (!merchant) {
    log.warn({ event: event.event }, "Webhook signature verification failed (unknown secret)");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const record = mapRazorpayEvent(event, merchant.merchant_id);
  if (!record) {
    // Non-failure event (captured, refunded…); acknowledge and ignore.
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (db) {
    const { records } = await import("@/lib/db/schema");
    await db.insert(records).values({
      recordId: record.record_id,
      merchantId: record.merchant_id,
      customerId: record.customer_id,
      type: record.type,
      subcategory: record.subcategory,
      amount: record.amount,
      currency: "INR",
      failureTimestamp: new Date(record.failure_timestamp),
      daysSinceLastOrder: record.days_since_last_order,
      customerEmail: record.customer_email,
      customerPhone: record.customer_phone,
      customerName: record.customer_name,
      customerSegment: record.customer_segment,
      previousPayments: record.previous_payments,
      avgOrderValue: record.avg_order_value,
      failureReason: record.failure_reason,
      lifecycleStage: record.lifecycle_stage ?? null,
      recoveryWindowHours: record.recovery_window_hours ?? null,
      preferredLanguage: record.preferred_language ?? null,
      voiceOptIn: record.voice_opt_in ?? null,
      groundTruth: record.ground_truth,
    }).onConflictDoUpdate({
      target: records.recordId,
      set: {
        failureReason: record.failure_reason,
        subcategory: record.subcategory,
        failureTimestamp: new Date(record.failure_timestamp),
        amount: record.amount,
      },
    });
    log.info({ event: event.event, record: record.record_id, merchant: merchant.merchant_id }, "Webhook record upserted");
    return NextResponse.json({ ok: true, record_id: record.record_id });
  }

  // SQLite fallback (local dev)
  const fs = await import("node:fs");
  const DB_PATH = `${process.cwd()}/data/synthetic.db`;
  if (!fs.existsSync(DB_PATH)) {
    return NextResponse.json({ error: "No database available" }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const sqlite = new Database(DB_PATH);
  try {
    sqlite.prepare(`
      INSERT OR REPLACE INTO records (
        record_id, merchant_id, customer_id, type, subcategory, amount, currency,
        failure_timestamp, days_since_last_order, customer_email, customer_phone,
        customer_name, customer_segment, previous_payments, avg_order_value,
        failure_reason, lifecycle_stage, recovery_window_hours,
        preferred_language, voice_opt_in, ground_truth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.record_id, record.merchant_id, record.customer_id, record.type, record.subcategory,
      record.amount, "INR", record.failure_timestamp, record.days_since_last_order,
      record.customer_email, record.customer_phone, record.customer_name, record.customer_segment,
      record.previous_payments, record.avg_order_value, record.failure_reason,
      record.lifecycle_stage ?? null, record.recovery_window_hours ?? null,
      record.preferred_language ?? null, record.voice_opt_in ? 1 : 0,
      JSON.stringify(record.ground_truth),
    );
    return NextResponse.json({ ok: true, record_id: record.record_id });
  } finally {
    sqlite.close();
  }
}

async function getMerchantBySecretFromBody(rawBody: string, signature: string) {
  const allMerchants = await getAllMerchants();
  for (const m of allMerchants) {
    try {
      const secret = decryptSecret(m.webhook_secret_enc);
      if (verifyRazorpaySignature(rawBody, signature, secret)) {
        return m;
      }
    } catch {
      // skip
    }
  }
  return null;
}