import { NextResponse } from "next/server";
import { childLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const log = childLogger("api/webhooks/whatsapp");

/** Meta verification handshake — returns hub.challenge when the token matches. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WhatsAppWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        statuses?: {
          id?: string;
          status?: string;
          timestamp?: string;
          errors?: { message?: string }[];
        }[];
        contacts?: { wa_id?: string }[];
        messages?: {
          from?: string;
          id?: string;
          text?: { body?: string };
          type?: string;
        }[];
      };
    }[];
  }[];
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as WhatsAppWebhookPayload;

  let updated = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      // Delivery status updates (sent / delivered / read / failed)
      for (const status of value.statuses ?? []) {
        const messageId = status.id;
        if (!messageId) continue;
        await updateDeliveryStatus(messageId, status.status ?? "sent");
        updated++;
      }

      // Inbound customer replies → mark as responded
      for (const msg of value.messages ?? []) {
        if (!msg.from || !msg.id) continue;
        await markCustomerResponded(msg.id);
        updated++;
      }
    }
  }

  return NextResponse.json({ ok: true, updated });
}

async function updateDeliveryStatus(providerMessageId: string, status: string) {
  const mapped =
    status === "read" || status === "delivered"
      ? "delivered"
      : status === "failed"
        ? "failed"
        : "sent";

  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (db) {
    const { voiceNotifications } = await import("@/lib/db/schema");
    const { eq, isNotNull, and } = await import("drizzle-orm");
    await db
      .update(voiceNotifications)
      .set({
        deliveryStatus: mapped,
        deliveredAt: mapped === "delivered" ? new Date() : undefined,
      })
      .where(
        and(
          isNotNull(voiceNotifications.providerMessageId),
          eq(voiceNotifications.providerMessageId, providerMessageId),
        ),
      );
    log.info({ providerMessageId, status: mapped }, "WhatsApp delivery status updated");
    return;
  }

  const fs = await import("node:fs");
  const DB_PATH = `${process.cwd()}/data/synthetic.db`;
  if (!fs.existsSync(DB_PATH)) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const sqlite = new Database(DB_PATH);
  try {
    sqlite
      .prepare("UPDATE voice_notifications SET delivery_status = ?, delivered_at = ? WHERE provider_message_id = ?")
      .run(mapped, mapped === "delivered" ? new Date().toISOString() : null, providerMessageId);
  } finally {
    sqlite.close();
  }
}

async function markCustomerResponded(providerMessageId: string) {
  const { getDrizzle } = await import("@/lib/db/pool");
  const db = getDrizzle();
  if (db) {
    const { voiceNotifications } = await import("@/lib/db/schema");
    const { eq, isNotNull, and } = await import("drizzle-orm");
    await db
      .update(voiceNotifications)
      .set({
        customerResponded: true,
        responseType: "replied",
        responseTimestamp: new Date(),
      })
      .where(
        and(
          isNotNull(voiceNotifications.providerMessageId),
          eq(voiceNotifications.providerMessageId, providerMessageId),
        ),
      );
    return;
  }

  const fs = await import("node:fs");
  const DB_PATH = `${process.cwd()}/data/synthetic.db`;
  if (!fs.existsSync(DB_PATH)) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  const sqlite = new Database(DB_PATH);
  try {
    sqlite
      .prepare("UPDATE voice_notifications SET customer_responded = 1, response_type = 'replied', response_timestamp = ? WHERE provider_message_id = ?")
      .run(new Date().toISOString(), providerMessageId);
  } finally {
    sqlite.close();
  }
}