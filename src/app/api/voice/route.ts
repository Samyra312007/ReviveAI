import { NextResponse } from "next/server";
import { getVoiceRows } from "@/lib/db/query";
import { computeVoiceMetrics } from "@/lib/voice/tracker";
import { getAuditRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const rows = await getVoiceRows();
  const auditRows = await getAuditRows();
  const decisions = auditRows.map((row) => ({
    record: { record_id: row.record_id },
    outcome: row.outcome,
  }));

  const metrics = computeVoiceMetrics(
    rows.map((r) => ({
      notification_id: r.notification_id,
      record_id: r.record_id,
      customer_id: r.customer_id,
      template_id: r.template_id,
      language: r.language as "en" | "hi" | "hinglish",
      personalized_text: r.personalized_text,
      tone: r.tone as "friendly" | "urgent" | "formal",
      channel: r.channel as "whatsapp" | "sms" | "both",
      delivery_status: r.delivery_status as "sent" | "delivered" | "failed" | "queued",
      delivered_at: r.delivered_at ?? undefined,
      audio_duration_seconds: r.audio_duration_seconds,
      tts_engine: "simulated-tts-v1",
      customer_responded: r.customer_responded === 1,
      response_type: (r.response_type ?? undefined) as
        | "clicked_link"
        | "called_back"
        | "replied"
        | "no_response"
        | undefined,
      response_timestamp: r.response_timestamp ?? undefined,
      created_at: r.created_at,
      simulated: true,
    })),
    decisions,
  );

  return NextResponse.json({ notifications: rows, metrics });
}
