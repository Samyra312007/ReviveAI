export type RecordType =
  | "payment_failure"
  | "checkout_abandonment"
  | "subscription_failure"
  | "overdue_invoice"
  | "control";

export type CustomerSegment = "high_value" | "mid_value" | "low_value";

export type PreferredLanguage = "en" | "hi" | "hinglish";

export type PromiseStatus = "pending" | "fulfilled" | "broken" | "none";

export interface GroundTruth {
  recoverable: boolean;
  recommended_intervention: string;
  expected_recovery_probability: number;
  max_retries_allowed: number;
  recoverable_amount: number;
}

export interface SyntheticRecord {
  record_id: string;
  merchant_id: string;
  customer_id: string;

  type: RecordType;
  subcategory: string;

  amount: number; // in paise
  currency: "INR";

  failure_timestamp: string; // ISO 8601
  days_since_last_order: number;

  customer_email: string;
  customer_phone: string;
  customer_name: string;
  customer_segment: CustomerSegment;
  previous_payments: number;
  avg_order_value: number;

  failure_reason: string;
  lifecycle_stage?: string;
  recovery_window_hours?: number;

  promise_due_date?: string;
  promise_amount?: number;
  promise_status?: PromiseStatus;
  promise_history?: PromiseRecord[];

  preferred_language?: PreferredLanguage;
  voice_opt_in?: boolean;
  last_voice_sent?: string;

  ground_truth: GroundTruth;
}

export type PromiseSource = "voice" | "sms" | "email" | "chat" | "manual";
export type PromiseLifecycleStatus =
  | "pending"
  | "fulfilled"
  | "broken"
  | "renewed"
  | "escalated";
export type ReminderType = "pre_due" | "on_due" | "post_due" | "escalation";
export type Channel = "sms" | "email" | "whatsapp" | "voice";

export interface ReminderRecord {
  reminder_id: string;
  reminder_type: ReminderType;
  channel: Channel;
  sent_at: string;
  message: string;
}

export interface PromiseRecord {
  promise_id: string;
  record_id: string;
  customer_id: string;
  merchant_id: string;

  promised_amount: number;
  promised_date: string;
  due_date: string;
  promise_source: PromiseSource;

  status: PromiseLifecycleStatus;
  renewal_count: number;

  reminders_sent: ReminderRecord[];

  fulfilled_amount?: number;
  fulfilled_date?: string;

  created_at: string;
  updated_at: string;
}

export type VoiceLanguage = "en" | "hi" | "hinglish";
export type VoiceChannel = "whatsapp" | "sms" | "both";
export type DeliveryStatus = "sent" | "delivered" | "failed" | "queued";
export type ResponseType =
  | "clicked_link"
  | "called_back"
  | "replied"
  | "no_response";

export interface VoiceNotification {
  notification_id: string;
  record_id: string;
  customer_id: string;

  template_id: string;
  language: VoiceLanguage;
  personalized_text: string;
  tone: "friendly" | "urgent" | "formal";

  channel: VoiceChannel;
  delivery_status: DeliveryStatus;
  delivered_at?: string;

  audio_file_path?: string;
  audio_duration_seconds: number;
  tts_engine: string;

  customer_responded: boolean;
  response_type?: ResponseType;
  response_timestamp?: string;

  created_at: string;
  simulated: boolean;
}

export const RECORD_COUNTS: Record<RecordType, number> = {
  payment_failure: 50,
  checkout_abandonment: 30,
  subscription_failure: 30,
  overdue_invoice: 20,
  control: 20,
};

export const SUBCATEGORY_COUNTS: Record<string, Record<string, number>> = {
  payment_failure: {
    insufficient_funds: 20,
    network_timeout: 13,
    card_expired: 7,
    bank_declined: 6,
    fraud_hold: 4,
  },
  checkout_abandonment: {
    form_abandonment: 11,
    payment_page_exit: 9,
    price_shock: 6,
    comparison_shopping: 4,
  },
  subscription_failure: {
    insufficient_balance: 11,
    mandate_not_triggered: 9,
    card_expired: 6,
    bank_rejection: 4,
  },
  overdue_invoice: {
    "7_day_late": 6,
    "14_day_late": 6,
    "30_day_late": 5,
    "60_day_plus_late": 3,
  },
  control: { healthy: 20 },
};
