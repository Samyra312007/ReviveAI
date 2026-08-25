import { SyntheticRecord } from "@/lib/data/schema";
import { DetectionResult } from "@/lib/detection/types";
import { Strategy } from "@/lib/agent/strategy";
import { GuardrailCheckResult } from "@/lib/guardrails/rules";
import { ApiCallRecord } from "@/lib/razorpay/client";

export type AuditOutcome =
  | "recovered"
  | "failed"
  | "escalated"
  | "skipped"
  | "blocked";

export interface AuditLogEntry {
  timestamp: string;
  record_id: string;
  merchant_id: string;
  customer_id: string;

  detected_category: string | null;
  detected_subcategory: string | null;
  detection_confidence: number | null;

  selected_strategy: string | null;
  decision_reasoning: string | null;
  guardrail_checks: {
    rule_id: string;
    passed: boolean;
    block_reason?: string;
  }[] | null;

  action_taken: string | null;
  api_call: ApiCallRecord | null;

  outcome: AuditOutcome;
  amount_recovered?: number;
  time_to_recovery_hours?: number;

  error?: { type: string; message: string; handled: boolean };
}

export interface RecordDecision {
  record: SyntheticRecord;
  detection: DetectionResult;
  strategy?: Strategy;
  guardrailChecks?: GuardrailCheckResult[];
  apiCall?: ApiCallRecord;
  outcome: AuditOutcome;
  amountRecovered: number;
  timeToRecoveryHours?: number;
  error?: { type: string; message: string; handled: boolean };
}

export function toAuditEntry(decision: RecordDecision): AuditLogEntry {
  const r = decision.record;
  return {
    timestamp: new Date().toISOString(),
    record_id: r.record_id,
    merchant_id: r.merchant_id,
    customer_id: r.customer_id,
    detected_category: decision.detection.detected_category,
    detected_subcategory: decision.detection.detected_subcategory,
    detection_confidence: decision.detection.detection_confidence,
    selected_strategy: decision.strategy?.action ?? null,
    decision_reasoning: decision.strategy?.reasoning ?? decision.detection.route_reason,
    guardrail_checks: decision.guardrailChecks ?? null,
    action_taken: decision.strategy?.action ?? decision.detection.route.toUpperCase(),
    api_call: decision.apiCall ?? null,
    outcome: decision.outcome,
    amount_recovered: decision.amountRecovered || undefined,
    time_to_recovery_hours: decision.timeToRecoveryHours,
    error: decision.error,
  };
}

import BetterSqlite3 from "better-sqlite3";

export interface AuditWriter {
  write(entries: AuditLogEntry[]): void;
}

export class SqliteAuditWriter implements AuditWriter {
  private insert: ReturnType<BetterSqlite3.Database["prepare"]>;
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    this.insert = db.prepare(`
      INSERT INTO audit_log (
        timestamp, record_id, merchant_id, customer_id,
        detected_category, detected_subcategory, detection_confidence,
        selected_strategy, decision_reasoning, guardrail_checks,
        action_taken, api_call, outcome, amount_recovered,
        time_to_recovery_hours, error
      ) VALUES (
        @timestamp, @record_id, @merchant_id, @customer_id,
        @detected_category, @detected_subcategory, @detection_confidence,
        @selected_strategy, @decision_reasoning, @guardrail_checks,
        @action_taken, @api_call, @outcome, @amount_recovered,
        @time_to_recovery_hours, @error
      )
    `);
  }

  write(entries: AuditLogEntry[]): void {
    const tx = this.db.transaction((all: AuditLogEntry[]) => {
      for (const e of all) {
        this.insert.run({
          ...e,
          detected_category: e.detected_category ?? null,
          detected_subcategory: e.detected_subcategory ?? null,
          detection_confidence: e.detection_confidence ?? null,
          selected_strategy: e.selected_strategy ?? null,
          decision_reasoning: e.decision_reasoning ?? null,
          guardrail_checks: e.guardrail_checks ? JSON.stringify(e.guardrail_checks) : null,
          action_taken: e.action_taken ?? null,
          api_call: e.api_call ? JSON.stringify(e.api_call) : null,
          amount_recovered: e.amount_recovered ?? null,
          time_to_recovery_hours: e.time_to_recovery_hours ?? null,
          error: e.error ? JSON.stringify(e.error) : null,
        });
      }
    });
    tx(entries);
  }
}

export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: AuditLogEntry[] = [];
  write(entries: AuditLogEntry[]): void {
    this.entries.push(...entries);
  }
}
