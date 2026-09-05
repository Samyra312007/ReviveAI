import { auth } from "@/auth";
import { getVoiceRows, getAuditRows } from "@/lib/db/query";
import { MetricCard, PageHeader, Table } from "@/components/ui";
import { VoicePreview } from "@/components/voice-preview";
import {
  computeVoiceMetrics,
} from "@/lib/voice/tracker";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const rows = await getVoiceRows(merchantIds);
  const auditRows = await getAuditRows(merchantIds);
  const dataBadge = merchantIds?.length
    ? { label: "Live Data", variant: "connected" as const }
    : { label: "Demo Data", variant: "demo" as const };

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
      delivery_status: r.delivery_status as
        | "sent"
        | "delivered"
        | "failed"
        | "queued",
      delivered_at: r.delivered_at ?? undefined,
      audio_duration_seconds: r.audio_duration_seconds,
      tts_engine: "simulated-tts-v1",
      customer_responded: r.customer_responded === 1,
      response_type: (r.response_type ?? undefined) as never,
      response_timestamp: r.response_timestamp ?? undefined,
      created_at: r.created_at,
      simulated: true,
    })),
    auditRows.map((r) => ({ record: { record_id: r.record_id }, outcome: r.outcome })),
  );

  return (
    <>
      <PageHeader
        title="Voice Notifications: Hinglish Recovery"
        description="Personalized Hinglish voice nudges with simulated TTS and WhatsApp delivery. Gated by opt-in (F4), weekly limits (F1), and 09:00–20:00 IST windows (F2)."
        badge={dataBadge}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Voice Sent" value={String(metrics.sent)} sub={`${rows.length} in latest batch`} />
        <MetricCard
          label="Delivery Rate"
          value={metrics.delivery_rate !== null ? `${Math.round(metrics.delivery_rate * 100)}%` : "-"}
          sub={`${metrics.delivered} delivered · target >90%`}
          accent={
            metrics.delivery_rate === null || metrics.delivery_rate >= 0.9
              ? "text-emerald-400"
              : "text-amber-400"
          }
        />
        <MetricCard
          label="Response Rate"
          value={metrics.response_rate !== null ? `${Math.round(metrics.response_rate * 100)}%` : "-"}
          sub={`${metrics.responded} responded · target >15%`}
          accent="text-sky-400"
        />
        <MetricCard
          label="Recovered via Voice"
          value={String(metrics.recovered_via_voice)}
          sub={`avg response ${metrics.avg_response_time_minutes !== null ? `${metrics.avg_response_time_minutes}m` : "-"}`}
          accent="text-emerald-400"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Language Distribution</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(metrics.language_distribution).map(([lang, count]) => (
            <span
              key={lang}
              className="rounded-full border border-zinc-800 bg-clay-100 px-4 py-1.5 text-sm capitalize text-zinc-300 shadow-clay-sm"
            >
              {lang}: <span className="font-semibold tabular-nums text-zinc-950">{count}</span>
            </span>
          ))}
          {Object.keys(metrics.language_distribution).length === 0 && (
            <span className="text-sm text-zinc-500">No notifications yet.</span>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Delivery Log</h2>
          <Table headers={["ID", "Record", "Template", "Channel", "Status", "Response", "Text"]}>
            {rows.slice(0, 50).map((r) => (
              <tr key={r.notification_id} className="text-zinc-300">
                <td className="px-4 py-2.5 font-mono text-xs">{r.notification_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{r.record_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-sky-400">{r.template_id}</td>
                <td className="px-4 py-2.5 capitalize">{r.channel}</td>
                <td className={`px-4 py-2.5 text-xs font-medium ${r.delivery_status === "delivered" ? "text-emerald-400" : r.delivery_status === "failed" ? "text-rose-400" : "text-zinc-400"}`}>
                  {r.delivery_status}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {r.customer_responded ? (
                    <span className="capitalize text-sky-400">
                      {r.response_type?.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className="text-zinc-600">-</span>
                  )}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-xs text-zinc-500">
                  “{r.personalized_text}”
                </td>
              </tr>
            ))}
          </Table>
          {rows.length > 50 && (
            <p className="mt-2 text-xs text-zinc-500">Showing first 50 of {rows.length}.</p>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Template Library (VT-01 – VT-08)</h2>
        <VoicePreview />
      </section>
    </>
  );
}
