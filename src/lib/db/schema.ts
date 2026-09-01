import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";

// ── Records (150 synthetic rows) ───────────────────────────────────────────
export const records = pgTable(
  "records",
  {
    recordId: text("record_id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    customerId: text("customer_id").notNull().unique(),
    type: text("type").notNull(),
    subcategory: text("subcategory").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("INR"),
    failureTimestamp: timestamp("failure_timestamp", { withTimezone: true }).notNull(),
    daysSinceLastOrder: integer("days_since_last_order").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerName: text("customer_name").notNull(),
    customerSegment: text("customer_segment").notNull(),
    previousPayments: integer("previous_payments").notNull(),
    avgOrderValue: integer("avg_order_value").notNull(),
    failureReason: text("failure_reason").notNull(),
    lifecycleStage: text("lifecycle_stage"),
    recoveryWindowHours: doublePrecision("recovery_window_hours"),
    promiseDueDate: timestamp("promise_due_date", { withTimezone: true }),
    promiseAmount: integer("promise_amount"),
    promiseStatus: text("promise_status"),
    preferredLanguage: text("preferred_language"),
    voiceOptIn: boolean("voice_opt_in"),
    lastVoiceSent: timestamp("last_voice_sent", { withTimezone: true }),
    groundTruth: jsonb("ground_truth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_records_type").on(t.type),
    index("idx_records_customer").on(t.customerId),
  ],
);

// ── Promises ────────────────────────────────────────────────────────────────
export const promises = pgTable(
  "promises",
  {
    promiseId: text("promise_id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => records.recordId),
    customerId: text("customer_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    promisedAmount: integer("promised_amount").notNull(),
    promisedDate: timestamp("promised_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    promiseSource: text("promise_source").notNull(),
    status: text("status").notNull(),
    renewalCount: integer("renewal_count").notNull().default(0),
    remindersSent: jsonb("reminders_sent").notNull().default([]),
    fulfilledAmount: integer("fulfilled_amount"),
    fulfilledDate: timestamp("fulfilled_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_promises_record").on(t.recordId)],
);

// ── Audit log (append-only in production) ──────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    recordId: text("record_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    customerId: text("customer_id").notNull(),
    detectedCategory: text("detected_category"),
    detectedSubcategory: text("detected_subcategory"),
    detectionConfidence: doublePrecision("detection_confidence"),
    selectedStrategy: text("selected_strategy"),
    decisionReasoning: text("decision_reasoning"),
    guardrailChecks: jsonb("guardrail_checks"),
    actionTaken: text("action_taken"),
    apiCall: jsonb("api_call"),
    outcome: text("outcome").notNull(),
    amountRecovered: integer("amount_recovered"),
    timeToRecoveryHours: doublePrecision("time_to_recovery_hours"),
    error: jsonb("error"),
  },
  (t) => [
    index("idx_audit_record").on(t.recordId),
    index("idx_audit_outcome").on(t.outcome),
  ],
);

// ── Voice notifications ─────────────────────────────────────────────────────
export const voiceNotifications = pgTable(
  "voice_notifications",
  {
    notificationId: text("notification_id").primaryKey(),
    recordId: text("record_id").notNull(),
    customerId: text("customer_id").notNull(),
    templateId: text("template_id").notNull(),
    language: text("language").notNull(),
    personalizedText: text("personalized_text").notNull(),
    tone: text("tone").notNull(),
    channel: text("channel").notNull(),
    deliveryStatus: text("delivery_status").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    audioFilePath: text("audio_file_path"),
    audioDurationSeconds: doublePrecision("audio_duration_seconds").notNull(),
    ttsEngine: text("tts_engine").notNull(),
    customerResponded: boolean("customer_responded").notNull().default(false),
    responseType: text("response_type"),
    responseTimestamp: timestamp("response_timestamp", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    simulated: boolean("simulated").notNull().default(true),
  },
  (t) => [index("idx_voice_record").on(t.recordId)],
);

// ── Council: tuning proposals ───────────────────────────────────────────────
export const tuningProposals = pgTable(
  "tuning_proposals",
  {
    proposalId: text("proposal_id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    parameter: text("parameter").notNull(),
    currentValue: doublePrecision("current_value").notNull(),
    proposedValue: doublePrecision("proposed_value").notNull(),
    currentDisplay: text("current_display").notNull(),
    proposedDisplay: text("proposed_display").notNull(),
    rationale: text("rationale").notNull(),
    blockedCount: integer("blocked_count").notNull(),
    blockedRecoverablePaise: integer("blocked_recoverable_paise").notNull(),
    avgRecoveryProbability: doublePrecision("avg_recovery_probability").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("idx_proposals_status").on(t.status)],
);

// ── Council: active overrides ───────────────────────────────────────────────
export const councilOverrides = pgTable("council_overrides", {
  parameter: text("parameter").primaryKey(),
  value: doublePrecision("value").notNull(),
  ruleSource: text("rule_source").notNull(),
  proposalId: text("proposal_id").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
});

// ── Two-way recovery conversations ──────────────────────────────────────────
export const conversations = pgTable("conversations", {
  recordId: text("record_id").primaryKey(),
  customerId: text("customer_id").notNull(),
  turns: jsonb("turns").notNull(),
  intent: text("intent"),
  resolution: text("resolution").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// ── Reports (replaces data/report.json file) ────────────────────────────────
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  report: jsonb("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Credentials users (email + password auth via Auth.js) ──────────────────
export const credentialsUsers = pgTable("credentials_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
