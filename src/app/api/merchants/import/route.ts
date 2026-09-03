import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMerchantById, getAllMerchants } from "@/lib/db/merchants";
import { decryptSecret } from "@/lib/crypto";
import { razorpayApiCall } from "@/lib/razorpay/webhook";
import { childLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = childLogger("api/merchants/import");

interface RazorpayPayment {
  id: string;
  status: string;
  amount: number;
  created_at: number;
  email?: string;
  contact?: string;
  error_code?: string;
  error_description?: string;
  method?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const merchantId = String(body.merchant_id ?? "");

  const allMerchants = await getAllMerchants();
  const merchant = allMerchants.find((m) => m.merchant_id === merchantId && m.user_id === session.user?.id);

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found for this user" }, { status: 404 });
  }

  const keyId = merchant.razorpay_key_id;
  const keySecret = decryptSecret(merchant.razorpay_key_secret_enc);

  const days = Math.min(Math.max(Number(body.days ?? 90), 1), 365);
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  // Paginate through Razorpay payments, collecting failed ones.
  const failed: RazorpayPayment[] = [];
  let skip = 0;
  const PAGE = 100;
  for (let page = 0; page < 10; page++) {
    const res = await razorpayApiCall(
      "GET",
      `/payments?from=${from}&to=${to}&count=${PAGE}&skip=${skip}`,
      keyId,
      keySecret,
    );
    if (!res.ok || !Array.isArray(res.data)) break;
    const items = res.data as RazorpayPayment[];
    failed.push(...items.filter((p) => p.status === "failed"));
    if (items.length < PAGE) break;
    skip += PAGE;
  }

  // Upsert into records
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  let inserted = 0;
  if (db) {
    const { records } = await import("@/lib/db/schema");
    for (const p of failed) {
      const ts = new Date(p.created_at * 1000);
      const contact = String(p.contact ?? "").replace(/\D/g, "").slice(-10) || "9999999999";
      const email = p.email ?? "unknown@example.com";
      await db.insert(records).values({
        recordId: p.id,
        merchantId,
        customerId: `cust_${p.id.replace(/[^a-zA-Z0-9]/g, "")}`,
        type: "payment_failure",
        subcategory: p.error_code === "CARD_EXPIRED" ? "card_expired" : "bank_declined",
        amount: p.amount,
        currency: "INR",
        failureTimestamp: ts,
        daysSinceLastOrder: 0,
        customerEmail: email,
        customerPhone: `+91${contact}`,
        customerName: email.split("@")[0] ?? "Customer",
        customerSegment: "mid_value",
        previousPayments: 0,
        avgOrderValue: p.amount,
        failureReason: p.error_description ?? "Payment failed",
        lifecycleStage: "at_risk",
        recoveryWindowHours: 72,
        preferredLanguage: "hinglish",
        voiceOptIn: false,
        groundTruth: {
          recoverable: true,
          recommended_intervention: "RETRY_IN_24H",
          expected_recovery_probability: 0.5,
          max_retries_allowed: 2,
          recoverable_amount: p.amount,
        },
      }).onConflictDoUpdate({
        target: records.recordId,
        set: { failureReason: p.error_description ?? "Payment failed" },
      });
      inserted++;
    }
  } else {
    // SQLite fallback
    const fs = await import("node:fs");
    const DB_PATH = `${process.cwd()}/data/synthetic.db`;
    if (fs.existsSync(DB_PATH)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const sqlite = new Database(DB_PATH);
      try {
        const stmt = sqlite.prepare(`
          INSERT OR REPLACE INTO records (
            record_id, merchant_id, customer_id, type, subcategory, amount, currency,
            failure_timestamp, days_since_last_order, customer_email, customer_phone,
            customer_name, customer_segment, previous_payments, avg_order_value,
            failure_reason, lifecycle_stage, recovery_window_hours,
            preferred_language, voice_opt_in, ground_truth
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of failed) {
          const contact = String(p.contact ?? "").replace(/\D/g, "").slice(-10) || "9999999999";
          const email = p.email ?? "unknown@example.com";
          stmt.run(
            p.id, merchantId, `cust_${p.id.replace(/[^a-zA-Z0-9]/g, "")}`,
            "payment_failure", p.error_code === "CARD_EXPIRED" ? "card_expired" : "bank_declined",
            p.amount, "INR", new Date(p.created_at * 1000).toISOString(), 0,
            email, `+91${contact}`, email.split("@")[0] ?? "Customer", "mid_value",
            0, p.amount, p.error_description ?? "Payment failed", "at_risk", 72,
            "hinglish", 0, JSON.stringify({
              recoverable: true,
              recommended_intervention: "RETRY_IN_24H",
              expected_recovery_probability: 0.5,
              max_retries_allowed: 2,
              recoverable_amount: p.amount,
            }),
          );
          inserted++;
        }
      } finally {
        sqlite.close();
      }
    }
  }

  log.info({ merchant: merchantId, inserted }, "Historical Razorpay data imported");
  return NextResponse.json({ ok: true, imported: inserted, scanned: failed.length });
}