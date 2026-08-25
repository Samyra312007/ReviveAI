import { VoiceNotification } from "@/lib/data/schema";

export interface DeliveryResult {
  notification: VoiceNotification;
  fallbackUsed: boolean;
}

const WHATSAPP_DELIVERY_RATE = 0.92;
const SMS_FALLBACK_DELIVERY_RATE = 0.85;
const VOICE_RESPONSE_RATE = 0.18;

const RESPONSE_TYPES: VoiceNotification["response_type"][] = [
  "clicked_link",
  "called_back",
  "replied",
];

export function deliverVoice(
  rng: () => number,
  notification: VoiceNotification,
  nowMs: number,
): DeliveryResult {
  let channel: VoiceNotification["channel"] = "whatsapp";
  let delivered = rng() < WHATSAPP_DELIVERY_RATE;
  let fallbackUsed = false;

  if (!delivered) {
    channel = "sms";
    fallbackUsed = true;
    delivered = rng() < SMS_FALLBACK_DELIVERY_RATE;
  }

  const result: VoiceNotification = {
    ...notification,
    channel,
    delivery_status: delivered ? "delivered" : "failed",
    delivered_at: delivered ? new Date(nowMs).toISOString() : undefined,
  };

  if (delivered && rng() < VOICE_RESPONSE_RATE) {
    const responseType =
      channel === "whatsapp"
        ? RESPONSE_TYPES[Math.floor(rng() * RESPONSE_TYPES.length)]
        : "replied";
    const responseDelayMin = Math.round(rng() * 110) + 5;
    result.customer_responded = true;
    result.response_type = responseType;
    result.response_timestamp = new Date(
      nowMs + responseDelayMin * 60 * 1000,
    ).toISOString();
  }

  return { notification: result, fallbackUsed };
}
