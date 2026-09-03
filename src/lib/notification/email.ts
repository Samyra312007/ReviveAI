import { VoiceNotification } from "@/lib/data/schema";
import { NotificationProvider, SendResult } from "./provider";

export class EmailProvider implements NotificationProvider {
  readonly name = "email" as const;

  isConfigured(): boolean {
    return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  }

  async send(notification: VoiceNotification): Promise<SendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      return { ok: false, status: "failed", simulated: true, error: "not_configured" };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [notification.customer_id.replace("cust_", "")],
          subject: "Your payment needs attention — ReviveAI recovery",
          text: notification.personalized_text,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (!res.ok) {
        return { ok: false, status: "failed", simulated: false, error: `HTTP ${res.status}` };
      }
      return {
        ok: true,
        status: "sent",
        simulated: false,
        providerMessageId: data.id,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        simulated: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}