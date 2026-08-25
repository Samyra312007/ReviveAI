import { openDb, initSchema, DB_PATH, upsertCouncilOverride } from "@/lib/db";
import fs from "node:fs";

export interface AuditRow {
  id: number;
  timestamp: string;
  record_id: string;
  merchant_id: string;
  customer_id: string;
  detected_category: string | null;
  detected_subcategory: string | null;
  detection_confidence: number | null;
  selected_strategy: string | null;
  decision_reasoning: string | null;
  guardrail_checks: string | null;
  action_taken: string | null;
  api_call: string | null;
  outcome: "recovered" | "failed" | "escalated" | "skipped" | "blocked";
  amount_recovered: number | null;
  time_to_recovery_hours: number | null;
  error: string | null;
}

export function getDb() {
  if (!fs.existsSync(DB_PATH)) return null;
  const db = openDb();
  try {
    initSchema(db);
    return db;
  } catch {
    db.close();
    return null;
  }
}

export function getAuditRows(): AuditRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM audit_log ORDER BY id ASC")
      .all() as AuditRow[];
  } finally {
    db.close();
  }
}

export interface RecordWithOutcome {
  record_id: string;
  merchant_id: string;
  customer_id: string;
  customer_name: string;
  type: string;
  subcategory: string;
  amount: number;
  failure_reason: string;
  customer_segment: string;
  failure_timestamp: string;
  ground_truth: string;
  outcome: string | null;
  detected_subcategory: string | null;
  detection_confidence: number | null;
  selected_strategy: string | null;
  decision_reasoning: string | null;
  amount_recovered: number | null;
}

export function getRecordsWithOutcomes(): RecordWithOutcome[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare(`
        SELECT
          r.record_id, r.merchant_id, r.customer_id, r.customer_name,
          r.type, r.subcategory, r.amount, r.failure_reason,
          r.customer_segment, r.failure_timestamp, r.ground_truth,
          a.outcome, a.detected_subcategory, a.detection_confidence,
          a.selected_strategy, a.decision_reasoning, a.amount_recovered
        FROM records r
        LEFT JOIN audit_log a ON a.record_id = r.record_id
        ORDER BY r.record_id ASC
      `)
      .all() as RecordWithOutcome[];
  } finally {
    db.close();
  }
}

export interface PromiseRow {
  promise_id: string;
  record_id: string;
  customer_name: string;
  promised_amount: number;
  promised_date: string;
  due_date: string;
  promise_source: string;
  status: string;
  renewal_count: number;
  fulfilled_amount: number | null;
  fulfilled_date: string | null;
}

export function getPromiseRows(): PromiseRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare(`
        SELECT
          p.promise_id, p.record_id, r.customer_name,
          p.promised_amount, p.promised_date, p.due_date,
          p.promise_source, p.status, p.renewal_count,
          p.fulfilled_amount, p.fulfilled_date
        FROM promises p
        LEFT JOIN records r ON r.record_id = p.record_id
        ORDER BY p.due_date ASC
      `)
      .all() as PromiseRow[];
  } finally {
    db.close();
  }
}

export interface VoiceRow {
  notification_id: string;
  record_id: string;
  customer_id: string;
  template_id: string;
  language: string;
  personalized_text: string;
  tone: string;
  channel: string;
  delivery_status: string;
  delivered_at: string | null;
  audio_duration_seconds: number;
  customer_responded: number;
  response_type: string | null;
  response_timestamp: string | null;
  created_at: string;
}

export function getVoiceRows(): VoiceRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM voice_notifications ORDER BY created_at ASC")
      .all() as VoiceRow[];
  } finally {
    db.close();
  }
}

export function getReportJson(reportPath?: string): unknown {
  const resolved = reportPath ?? `${process.cwd()}/data/report.json`;
  if (!fs.existsSync(resolved)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch {
    return null;
  }
}

export interface CouncilProposal {
  proposal_id: string;
  rule_id: string;
  parameter: string;
  current_value: number;
  proposed_value: number;
  current_display: string;
  proposed_display: string;
  rationale: string;
  blocked_count: number;
  blocked_recoverable_paise: number;
  avg_recovery_probability: number;
  status: string;
  created_at: string;
  decided_at: string | null;
}

export interface CouncilOverride {
  parameter: string;
  value: number;
  rule_source: string;
  proposal_id: string;
  approved_at: string;
}

export function getCouncilState(): {
  proposals: CouncilProposal[];
  overrides: CouncilOverride[];
} {
  const db = getDb();
  if (!db) return { proposals: [], overrides: [] };
  try {
    const proposals = db
      .prepare(
        `SELECT * FROM tuning_proposals
         ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC`,
      )
      .all() as CouncilProposal[];
    const overrides = db
      .prepare("SELECT * FROM council_overrides ORDER BY approved_at ASC")
      .all() as CouncilOverride[];
    return { proposals, overrides };
  } finally {
    db.close();
  }
}

export function decideCouncilProposalInDb(
  proposalId: string,
  decision: "approved" | "rejected",
): { ok: boolean; proposal?: CouncilProposal; error?: string } {
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };
  try {
    const row = db
      .prepare("SELECT * FROM tuning_proposals WHERE proposal_id = ?")
      .get(proposalId) as CouncilProposal | undefined;
    if (!row) return { ok: false, error: "Proposal not found" };
    if (row.status !== "pending")
      return { ok: false, error: `Proposal already ${row.status}` };

    db.prepare(
      "UPDATE tuning_proposals SET status = ?, decided_at = ? WHERE proposal_id = ?",
    ).run(decision, new Date().toISOString(), proposalId);

    if (decision === "approved") {
      upsertCouncilOverride(db, {
        parameter: row.parameter,
        value: row.proposed_value,
        rule_source: row.rule_id,
        proposal_id: row.proposal_id,
        approved_at: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      proposal: { ...row, status: decision, decided_at: new Date().toISOString() },
    };
  } finally {
    db.close();
  }
}

export interface ConversationRow {
  record_id: string;
  customer_id: string;
  turns: string;
  intent: string | null;
  resolution: string;
  created_at: string;
}

export function getConversationRows(): ConversationRow[] {
  const db = getDb();
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM conversations ORDER BY created_at ASC")
      .all() as ConversationRow[];
  } finally {
    db.close();
  }
}
