import { VoiceNotification } from "@/lib/data/schema";
import { NotificationProvider, SendResult } from "./provider";

const API_VERSION = "v21.0";

export class WhatsAppProvider implements NotificationProvider {
  readonly name = "whatsapp" as const;

  isConfigured(): boolean {
    return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async send(notification: VoiceNotification): Promise<SendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return { ok: false, status: "failed", simulated: true, error: "not_configured" };
    }

    // Prefer the interactive payment-link message; fall back to plain text.
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: notification.customer_id.replace("cust_", ""), // normalize to phone
      type: "text",
      text: { body: notification.personalized_text },
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
      if (!res.ok) {
        return {
          ok: false,
          status: "failed",
          simulated: false,
          error: (data as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        status: "sent",
        simulated: false,
        providerMessageId: data.messages?.[0]?.id,
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