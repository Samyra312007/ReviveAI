/**
 * Import historical failed payments from Razorpay into the records table.
 *
 * Usage:
 *   RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx MERCHANT_ID=mer_xxx \
 *     BUSINESS_NAME="My Store" npx tsx scripts/import-razorpay-data.ts [--days=90]
 */
import { razorpayApiCall } from "../src/lib/razorpay/webhook";

interface RazorpayPayment {
  id: string;
  status: string;
  amount: number;
  created_at: number;
  email?: string;
  contact?: string;
  error_code?: string;
  error_description?: string;
}

async function main() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const merchantId = process.env.MERCHANT_ID;
  if (!keyId || !keySecret || !merchantId) {
    console.error("Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and MERCHANT_ID");
    process.exit(1);
  }

  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 90;
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  console.log(`Pulling failed payments (${days}d window)...`);
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
    if (!res.ok || !Array.isArray(res.data)) {
      console.error("API call failed:", res.status);
      break;
    }
    const items = res.data as RazorpayPayment[];
    failed.push(...items.filter((p) => p.status === "failed"));
    console.log(`  page ${page + 1}: ${items.length} payments, ${failed.length} failed so far`);
    if (items.length < PAGE) break;
    skip += PAGE;
  }

  console.log(`\n${failed.length} failed payments found. Inserting into records...`);

  const { getDrizzle } = await import("../src/lib/db/pool");
  const db = getDrizzle();
  let inserted = 0;
  if (db) {
    const { records } = await import("../src/lib/db/schema");
    for (const p of failed) {
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
        failureTimestamp: new Date(p.created_at * 1000),
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
    console.error("DATABASE_URL not set — no Postgres pool available");
    process.exit(1);
  }

  console.log(`Done. Inserted/updated ${inserted} records for merchant ${merchantId}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});