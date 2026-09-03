import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { razorpayApiCall } from "@/lib/razorpay/webhook";
import { upsertMerchant, getMerchantsForUser } from "@/lib/db/merchants";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = checkRateLimit(clientKey(request));
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const businessName = String(body.business_name ?? "").trim();
  const keyId = String(body.razorpay_key_id ?? "").trim();
  const keySecret = String(body.razorpay_key_secret ?? "").trim();

  if (!businessName || !keyId || !keySecret) {
    return NextResponse.json(
      { error: "business_name, razorpay_key_id and razorpay_key_secret are required" },
      { status: 400 },
    );
  }

  // Validate the keys with a cheap Razorpay API call before storing.
  const probe = await razorpayApiCall("GET", "/payments?count=1", keyId, keySecret);
  if (!probe.ok) {
    return NextResponse.json(
      { error: "Invalid Razorpay keys — could not authenticate with the API" },
      { status: 400 },
    );
  }

  // Generate a webhook secret for the merchant to configure in the dashboard.
  const webhookSecret = crypto.randomBytes(24).toString("hex");
  const merchantId = `mer_${crypto.randomBytes(6).toString("hex")}`;

  await upsertMerchant({
    merchantId,
    userId: session.user.id,
    businessName,
    razorpayKeyId: keyId,
    razorpayKeySecret: keySecret,
    webhookSecret,
  });

  // Link the merchant to the user (tenant isolation).
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (db) {
    const { credentialsUsers } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const userRows = await db
      .select({ merchantIds: credentialsUsers.merchantIds })
      .from(credentialsUsers)
      .where(eq(credentialsUsers.id, session.user.id))
      .limit(1);
    const existing = Array.isArray(userRows[0]?.merchantIds)
      ? (userRows[0].merchantIds as string[])
      : [];
    const next = [...new Set([...existing, merchantId])];
    await db
      .update(credentialsUsers)
      .set({ merchantIds: next })
      .where(eq(credentialsUsers.id, session.user.id));
  } else {
    // SQLite fallback
    const fs = await import("node:fs");
    const DB_PATH = `${process.cwd()}/data/synthetic.db`;
    if (fs.existsSync(DB_PATH)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const sqlite = new Database(DB_PATH);
      try {
        const row = sqlite
          .prepare("SELECT merchant_ids FROM credentials_users WHERE id = ?")
          .get(session.user.id) as { merchant_ids: string } | undefined;
        let existing: string[] = [];
        if (row?.merchant_ids) {
          try {
            existing = JSON.parse(row.merchant_ids);
          } catch {
            existing = [];
          }
        }
        sqlite
          .prepare("UPDATE credentials_users SET merchant_ids = ? WHERE id = ?")
          .run(JSON.stringify([...new Set([...existing, merchantId])]), session.user.id);
      } finally {
        sqlite.close();
      }
    }
  }

  const merchants = await getMerchantsForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    merchant_id: merchantId,
    webhook_secret: webhookSecret,
    webhook_url: `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/webhooks/razorpay`,
    merchants,
    note: "Configure this webhook secret in your Razorpay dashboard under Settings → Webhooks. Enable payment.failed, subscription.failed and invoice.expired events.",
  });
}