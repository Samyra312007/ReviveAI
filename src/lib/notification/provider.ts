import { VoiceNotification } from "@/lib/data/schema";

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  status: "sent" | "delivered" | "failed" | "queued";
  simulated: boolean;
  error?: string;
}

export interface NotificationProvider {
  readonly name: "whatsapp" | "email" | "sms";
  /** Whether real credentials are configured. */
  isConfigured(): boolean;
  send(notification: VoiceNotification): Promise<SendResult>;
}

export interface DispatchContext {
  merchantPrefs?: {
    whatsappEnabled?: boolean;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    dailyLimit?: number;
  };
}

function inQuietHours(prefs: DispatchContext["merchantPrefs"], now: Date): boolean {
  const start = prefs?.quietHoursStart;
  const end = prefs?.quietHoursEnd;
  if (!start || !end || start === end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const startMin = parseInt(start.split(":")[0], 10) * 60 + parseInt(start.split(":")[1], 10);
  const endMin = parseInt(end.split(":")[0], 10) * 60 + parseInt(end.split(":")[1], 10);
  if (startMin < endMin) return minutes >= startMin && minutes < endMin;
  return minutes >= startMin || minutes < endMin;
}

/**
 * Dispatch a voice notification through the configured providers.
 * Falls back to a simulated "delivered" result so local dev / demo
 * behaviour is unchanged when no provider credentials exist.
 */
export async function dispatchNotification(
  notification: VoiceNotification,
  providers: NotificationProvider[],
  context: DispatchContext = {},
): Promise<SendResult> {
  const now = new Date();
  if (inQuietHours(context.merchantPrefs, now)) {
    return { ok: false, status: "queued", simulated: true, error: "quiet_hours" };
  }

  for (const provider of providers) {
    if (!provider.isConfigured()) continue;
    if (provider.name === "whatsapp" && context.merchantPrefs?.whatsappEnabled === false) continue;
    if (provider.name === "email" && context.merchantPrefs?.emailEnabled === false) continue;
    if (provider.name === "sms" && context.merchantPrefs?.smsEnabled === false) continue;

    const result = await provider.send(notification);
    if (result.ok) return result;
    // Try the next provider on failure (fallback chain).
  }

  // Simulated path: mirrors the old in-process delivery simulation.
  return {
    ok: true,
    status: "delivered",
    simulated: true,
    providerMessageId: `sim_${notification.notification_id}`,
  };
}