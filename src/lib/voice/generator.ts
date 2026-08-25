import { SyntheticRecord, VoiceNotification } from "@/lib/data/schema";
import { Strategy } from "@/lib/agent/strategy";
import { VOICE_TEMPLATES, renderTemplate } from "./templates";
import { toIstParts } from "@/lib/agent/context";

export type VoiceAction =
  | "VOICE_PAYMENT_NUDGE"
  | "VOICE_CART_REMINDER"
  | "VOICE_SUBSCRIPTION_NUDGE"
  | "VOICE_INVOICE_REMINDER"
  | "NO_VOICE"
  | "SKIP_VOICE";

export interface VoiceStrategyResult {
  action: VoiceAction;
  templateId?: string;
  language: "en" | "hi" | "hinglish";
  reasoning: string;
}

export function selectVoiceStrategy(
  record: SyntheticRecord,
  strategy: Strategy,
): VoiceStrategyResult {
  if (record.type === "control") {
    return {
      action: "NO_VOICE",
      language: record.preferred_language ?? "hinglish",
      reasoning: "Control group, no notification needed",
    };
  }

  if (record.voice_opt_in === false) {
    return {
      action: "SKIP_VOICE",
      language: record.preferred_language ?? "hinglish",
      reasoning: "Customer has not opted into voice notifications",
    };
  }

  const language = record.preferred_language ?? "hinglish";
  const action = strategy.action;

  if (action === "RETRY_IN_24H" || action === "RETRY_IN_48H") {
    return {
      action: "VOICE_PAYMENT_NUDGE",
      templateId: "VT-01",
      language,
      reasoning: `Voice nudge for ${language} speaker, payment retry scenario`,
    };
  }
  if (action === "RETRY_IMMEDIATELY") {
    return {
      action: "VOICE_PAYMENT_NUDGE",
      templateId: "VT-02",
      language,
      reasoning: `Voice nudge for ${language} speaker, transient failure`,
    };
  }
  if (action === "CART_REMINDER_WHATSAPP") {
    return {
      action: "VOICE_CART_REMINDER",
      templateId: "VT-03",
      language,
      reasoning: `Voice reminder for fresh abandoned checkout, ${language} language`,
    };
  }
  if (action === "SMS_PAYMENT_LINK") {
    return {
      action: "VOICE_CART_REMINDER",
      templateId: "VT-04",
      language,
      reasoning: `Urgent voice reminder for abandoned checkout, ${language} language`,
    };
  }
  if (action === "MANDATE_RETRY") {
    return {
      action: "VOICE_SUBSCRIPTION_NUDGE",
      templateId: "VT-05",
      language,
      reasoning: `Voice nudge for subscription retry, ${language} language`,
    };
  }
  if (action === "GENTLE_REMINDER") {
    return {
      action: "VOICE_INVOICE_REMINDER",
      templateId: "VT-06",
      language,
      reasoning: `Friendly voice reminder for overdue invoice, ${language} language`,
    };
  }
  if (action === "FIRM_NOTICE") {
    return {
      action: "VOICE_INVOICE_REMINDER",
      templateId: "VT-07",
      language,
      reasoning: `Formal voice reminder for overdue invoice, ${language} language`,
    };
  }

  return {
    action: "SKIP_VOICE",
    language,
    reasoning: "No matching voice template for this action",
  };
}

export function isWithinVoiceWindow(nowMs: number): boolean {
  const { hour } = toIstParts(nowMs);
  return hour >= 9 && hour < 20;
}

export function buildVoiceNotification(
  rng: () => number,
  num: number,
  record: SyntheticRecord,
  voiceStrategy: VoiceStrategyResult,
  nowMs: number,
): VoiceNotification {
  const template = VOICE_TEMPLATES.find((t) => t.id === voiceStrategy.templateId);
  const text = template
    ? renderTemplate(template, {
        name: record.customer_name.split(" ")[0],
        amount: (record.amount / 100).toLocaleString("en-IN"),
        merchant: record.merchant_id.replace("mer_", "").replace(/_/g, " "),
        discount: "100",
      })
    : "Payment reminder from merchant.";

  return {
    notification_id: `vn_${String(num).padStart(3, "0")}`,
    record_id: record.record_id,
    customer_id: record.customer_id,
    template_id: voiceStrategy.templateId ?? "VT-X",
    language: voiceStrategy.language,
    personalized_text: text,
    tone: template?.tone ?? "friendly",
    channel: "whatsapp",
    delivery_status: "queued",
    audio_file_path: `data/voice/${voiceStrategy.templateId}_${record.record_id}.mp3`,
    audio_duration_seconds:
      template?.duration_seconds ?? Math.round(10 + rng() * 15),
    tts_engine: "simulated-tts-v1",
    customer_responded: false,
    created_at: new Date(nowMs).toISOString(),
    simulated: true,
  };
}
