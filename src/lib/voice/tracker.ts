import { VoiceNotification } from "@/lib/data/schema";

interface MinimalDecision {
  record: { record_id: string };
  outcome: string;
}

export interface VoiceMetrics {
  sent: number;
  delivered: number;
  delivery_rate: number | null;
  responded: number;
  response_rate: number | null;
  recovered_via_voice: number;
  voice_recovery_rate: number | null;
  clicked_link: number;
  avg_response_time_minutes: number | null;
  language_distribution: Record<string, number>;
}

export function computeVoiceMetrics(
  notifications: VoiceNotification[],
  decisions: MinimalDecision[] = [],
): VoiceMetrics {
  const sent = notifications.length;
  const deliveredList = notifications.filter((n) => n.delivery_status === "delivered");
  const responded = notifications.filter((n) => n.customer_responded);
  const clicked = notifications.filter((n) => n.response_type === "clicked_link");

  const voiceRecordIds = new Set(notifications.map((n) => n.record_id));
  const recoveredViaVoice = decisions.filter(
    (d) => d.outcome === "recovered" && voiceRecordIds.has(d.record.record_id),
  ).length;

  let totalResponseMinutes = 0;
  let responseCount = 0;
  for (const n of responded) {
    if (n.delivered_at && n.response_timestamp) {
      totalResponseMinutes +=
        (new Date(n.response_timestamp).getTime() -
          new Date(n.delivered_at).getTime()) /
        60000;
      responseCount++;
    }
  }

  const languageDist = notifications.reduce<Record<string, number>>((acc, n) => {
    acc[n.language] = (acc[n.language] ?? 0) + 1;
    return acc;
  }, {});

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 1000 : null;

  return {
    sent,
    delivered: deliveredList.length,
    delivery_rate: pct(deliveredList.length, sent),
    responded: responded.length,
    response_rate: pct(responded.length, deliveredList.length),
    recovered_via_voice: recoveredViaVoice,
    voice_recovery_rate: pct(recoveredViaVoice, sent),
    clicked_link: clicked.length,
    avg_response_time_minutes:
      responseCount > 0 ? Math.round(totalResponseMinutes / responseCount) : null,
    language_distribution: languageDist,
  };
}
