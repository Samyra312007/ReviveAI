CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text,
	"timestamp" timestamp with time zone NOT NULL,
	"record_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"detected_category" text,
	"detected_subcategory" text,
	"detection_confidence" double precision,
	"selected_strategy" text,
	"decision_reasoning" text,
	"guardrail_checks" jsonb,
	"action_taken" text,
	"api_call" jsonb,
	"outcome" text NOT NULL,
	"amount_recovered" integer,
	"time_to_recovery_hours" double precision,
	"error" jsonb
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"record_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"turns" jsonb NOT NULL,
	"intent" text,
	"resolution" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "council_overrides" (
	"parameter" text PRIMARY KEY NOT NULL,
	"value" double precision NOT NULL,
	"rule_source" text NOT NULL,
	"proposal_id" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"merchant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_name" text NOT NULL,
	"razorpay_key_id" text NOT NULL,
	"razorpay_key_secret_enc" text NOT NULL,
	"webhook_secret_enc" text NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"promise_id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"promised_amount" integer NOT NULL,
	"promised_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"promise_source" text NOT NULL,
	"status" text NOT NULL,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fulfilled_amount" integer,
	"fulfilled_date" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"record_id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"subcategory" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"failure_timestamp" timestamp with time zone NOT NULL,
	"days_since_last_order" integer NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_segment" text NOT NULL,
	"previous_payments" integer NOT NULL,
	"avg_order_value" integer NOT NULL,
	"failure_reason" text NOT NULL,
	"lifecycle_stage" text,
	"recovery_window_hours" double precision,
	"promise_due_date" timestamp with time zone,
	"promise_amount" integer,
	"promise_status" text,
	"preferred_language" text,
	"voice_opt_in" boolean,
	"last_voice_sent" timestamp with time zone,
	"ground_truth" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tuning_proposals" (
	"proposal_id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"parameter" text NOT NULL,
	"current_value" double precision NOT NULL,
	"proposed_value" double precision NOT NULL,
	"current_display" text NOT NULL,
	"proposed_display" text NOT NULL,
	"rationale" text NOT NULL,
	"blocked_count" integer NOT NULL,
	"blocked_recoverable_paise" integer NOT NULL,
	"avg_recovery_probability" double precision NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "voice_notifications" (
	"notification_id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"template_id" text NOT NULL,
	"language" text NOT NULL,
	"personalized_text" text NOT NULL,
	"tone" text NOT NULL,
	"channel" text NOT NULL,
	"delivery_status" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"audio_file_path" text,
	"audio_duration_seconds" double precision NOT NULL,
	"tts_engine" text NOT NULL,
	"customer_responded" boolean DEFAULT false NOT NULL,
	"response_type" text,
	"response_timestamp" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_credentials_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."credentials_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_record_id_records_record_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("record_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_record" ON "audit_log" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "idx_audit_outcome" ON "audit_log" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_audit_run_id" ON "audit_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_merchants_user" ON "merchants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_promises_record" ON "promises" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX "idx_records_type" ON "records" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_records_customer" ON "records" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_status" ON "tuning_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_voice_record" ON "voice_notifications" USING btree ("record_id");