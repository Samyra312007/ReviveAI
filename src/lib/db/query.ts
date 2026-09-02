import { openDb, initSchema, DB_PATH, upsertCouncilOverride } from "@/lib/db";
import fs from "node:fs";

// ── Shared types ────────────────────────────────────────────────────────────

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

export interface ConversationRow {
  record_id: string;
  customer_id: string;
  turns: string;
  intent: string | null;
  resolution: string;
  created_at: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Build a SQL WHERE clause for merchant_id filtering.
 * Returns [clause, params] where clause is "" if no filter is needed.
 * @param prefix Optional table alias prefix (e.g. "r." for records.r.merchant_id)
 */
function merchantFilter(
  merchantIds: string[] | undefined | null,
  prefix = "",
): { clause: string; params: string[] } {
  if (!merchantIds || merchantIds.length === 0) {
    return { clause: "", params: [] };
  }
  const placeholders = merchantIds.map(() => "?").join(", ");
  return {
    clause: `AND ${prefix}merchant_id IN (${placeholders})`,
    params: merchantIds,
  };
}

/**
 * Parse a JSON string column safely, returning the parsed object or the
 * original value if it's already an object.
 */
function parseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val as T;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return fallback;
  }
}

// ── Query functions (async, merchant-filtered) ──────────────────────────────

export async function getAuditRows(
  merchantIds?: string[],
): Promise<AuditRow[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const { clause, params } = merchantFilter(merchantIds);
    const sql = `SELECT * FROM audit_log WHERE 1=1 ${clause} ORDER BY id ASC`;
    return db.prepare(sql).all(...params) as AuditRow[];
  } finally {
    db.close();
  }
}

export async function getRecordsWithOutcomes(
  merchantIds?: string[],
): Promise<RecordWithOutcome[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const { clause, params } = merchantFilter(merchantIds, "r.");
    const sql = `
      SELECT
        r.record_id, r.merchant_id, r.customer_id, r.customer_name,
        r.type, r.subcategory, r.amount, r.failure_reason,
        r.customer_segment, r.failure_timestamp, r.ground_truth,
        a.outcome, a.detected_subcategory, a.detection_confidence,
        a.selected_strategy, a.decision_reasoning, a.amount_recovered
      FROM records r
      LEFT JOIN audit_log a ON a.record_id = r.record_id
      WHERE 1=1 ${clause}
      ORDER BY r.record_id ASC
    `;
    return db.prepare(sql).all(...params) as RecordWithOutcome[];
  } finally {
    db.close();
  }
}

export async function getPromiseRows(
  merchantIds?: string[],
): Promise<PromiseRow[]> {
  const db = getDb();
  if (!db) return [];
  try {
    // promises doesn't have merchant_id; filter via records join
    const joinClause = merchantIds?.length
      ? `AND r.merchant_id IN (${merchantIds.map(() => "?").join(", ")})`
      : "";
    const sql = `
      SELECT
        p.promise_id, p.record_id, r.customer_name,
        p.promised_amount, p.promised_date, p.due_date,
        p.promise_source, p.status, p.renewal_count,
        p.fulfilled_amount, p.fulfilled_date
      FROM promises p
      LEFT JOIN records r ON r.record_id = p.record_id
      WHERE 1=1 ${joinClause}
      ORDER BY p.due_date ASC
    `;
    return db.prepare(sql).all(...(merchantIds ?? [])) as PromiseRow[];
  } finally {
    db.close();
  }
}

export async function getVoiceRows(
  merchantIds?: string[],
): Promise<VoiceRow[]> {
  const db = getDb();
  if (!db) return [];
  try {
    // voice_notifications doesn't have merchant_id directly; filter via records join
    if (merchantIds?.length) {
      const placeholders = merchantIds.map(() => "?").join(", ");
      const sql = `
        SELECT v.*
        FROM voice_notifications v
        LEFT JOIN records r ON r.record_id = v.record_id
        WHERE r.merchant_id IN (${placeholders})
        ORDER BY v.created_at ASC
      `;
      return db.prepare(sql).all(...merchantIds) as VoiceRow[];
    }
    return db
      .prepare("SELECT * FROM voice_notifications ORDER BY created_at ASC")
      .all() as VoiceRow[];
  } finally {
    db.close();
  }
}

export async function getReportJson(
  reportPath?: string,
): Promise<unknown> {
  // 1) Try Postgres reports table when DATABASE_URL is set (production)
  if (process.env.DATABASE_URL) {
    try {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (db) {
        const { reports } = await import("./schema");
        const { desc } = await import("drizzle-orm");
        const rows = await db
          .select({ report: reports.report })
          .from(reports)
          .orderBy(desc(reports.createdAt))
          .limit(1);
        if (rows.length > 0 && rows[0].report) return rows[0].report;
      }
    } catch {
      // fall through to file fallback
    }
  }
  // 2) File fallback (local dev / hackathon demo / tests)
  const resolved = reportPath ?? `${process.cwd()}/data/report.json`;
  if (!fs.existsSync(resolved)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf-8"));
  } catch {
    return null;
  }
}

export async function getCouncilState(
  merchantIds?: string[],
): Promise<{
  proposals: CouncilProposal[];
  overrides: CouncilOverride[];
}> {
  const db = getDb();
  if (!db) return { proposals: [], overrides: [] };
  try {
    // Council proposals/overrides are global — no per-merchant filter needed
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

export async function decideCouncilProposalInDb(
  proposalId: string,
  decision: "approved" | "rejected",
): Promise<{ ok: boolean; proposal?: CouncilProposal; error?: string }> {
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

export async function getConversationRows(
  merchantIds?: string[],
): Promise<ConversationRow[]> {
  const db = getDb();
  if (!db) return [];
  try {
    if (merchantIds?.length) {
      const placeholders = merchantIds.map(() => "?").join(", ");
      const sql = `
        SELECT c.*
        FROM conversations c
        LEFT JOIN records r ON r.record_id = c.record_id
        WHERE r.merchant_id IN (${placeholders})
        ORDER BY c.created_at ASC
      `;
      return db.prepare(sql).all(...merchantIds) as ConversationRow[];
    }
    return db
      .prepare("SELECT * FROM conversations ORDER BY created_at ASC")
      .all() as ConversationRow[];
  } finally {
    db.close();
  }
}
