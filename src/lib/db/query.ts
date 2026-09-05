import fs from "node:fs";

// ── Shared types ────────────────────────────────────────────────────────────

export interface AuditRow {
  id: number;
  run_id: string | null;
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

export interface TuningProposalInsert {
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
  created_at: string;
}

// ── Infrastructure ──────────────────────────────────────────────────────────

function pgAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Try a PG operation; return null on connection failure so caller falls back to SQLite. */
async function tryPg<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function getSqliteDb() {
  const DB_PATH = `${process.cwd()}/data/synthetic.db`;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 3000");
    return db;
  } catch {
    return null;
  }
}

// ── Query functions ─────────────────────────────────────────────────────────

export async function getAuditRows(
  merchantIds?: string[],
): Promise<AuditRow[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { auditLog } = await import("./schema");
      const { eq, and, inArray, desc, isNotNull } = await import("drizzle-orm");

      const latestRuns = await db.select({ runId: auditLog.runId }).from(auditLog)
        .where(isNotNull(auditLog.runId)).orderBy(desc(auditLog.id)).limit(1);
      const latestRunId = latestRuns[0]?.runId;

      const conds = [];
      if (latestRunId) conds.push(eq(auditLog.runId, latestRunId));
      if (merchantIds?.length) conds.push(inArray(auditLog.merchantId, merchantIds));

      const rows = await db.select().from(auditLog)
        .where(conds.length ? and(...conds) : undefined).orderBy(auditLog.id);

      return rows.map((r) => ({
        id: r.id, run_id: r.runId, timestamp: r.timestamp?.toISOString() ?? "",
        record_id: r.recordId, merchant_id: r.merchantId, customer_id: r.customerId,
        detected_category: r.detectedCategory, detected_subcategory: r.detectedSubcategory,
        detection_confidence: r.detectionConfidence, selected_strategy: r.selectedStrategy,
        decision_reasoning: r.decisionReasoning,
        guardrail_checks: r.guardrailChecks as string | null, action_taken: r.actionTaken,
        api_call: r.apiCall as string | null,
        outcome: r.outcome as AuditRow["outcome"],
        amount_recovered: r.amountRecovered, time_to_recovery_hours: r.timeToRecoveryHours,
        error: r.error as string | null,
      }));
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    const lr = db.prepare("SELECT run_id FROM audit_log WHERE run_id IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { run_id: string } | undefined;
    const lrId = lr?.run_id ?? null;
    if (lrId) {
      if (merchantIds?.length) {
        const ph = merchantIds.map(() => "?").join(", ");
        return db.prepare(`SELECT * FROM audit_log WHERE run_id = ? AND merchant_id IN (${ph}) ORDER BY id ASC`).all(lrId, ...merchantIds) as AuditRow[];
      }
      return db.prepare("SELECT * FROM audit_log WHERE run_id = ? ORDER BY id ASC").all(lrId) as AuditRow[];
    }
    if (merchantIds?.length) {
      const ph = merchantIds.map(() => "?").join(", ");
      return db.prepare(`SELECT * FROM audit_log WHERE merchant_id IN (${ph}) ORDER BY id ASC`).all(...merchantIds) as AuditRow[];
    }
    return db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all() as AuditRow[];
  } finally {
    db.close();
  }
}

export async function getAllAuditRows(
  merchantIds?: string[],
): Promise<AuditRow[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { auditLog } = await import("./schema");
      const { and, inArray } = await import("drizzle-orm");

      const conds = merchantIds?.length ? [inArray(auditLog.merchantId, merchantIds)] : [];
      const rows = await db.select().from(auditLog)
        .where(conds.length ? and(...conds) : undefined).orderBy(auditLog.id);

      return rows.map((r) => ({
        id: r.id, run_id: r.runId, timestamp: r.timestamp?.toISOString() ?? "",
        record_id: r.recordId, merchant_id: r.merchantId, customer_id: r.customerId,
        detected_category: r.detectedCategory, detected_subcategory: r.detectedSubcategory,
        detection_confidence: r.detectionConfidence, selected_strategy: r.selectedStrategy,
        decision_reasoning: r.decisionReasoning,
        guardrail_checks: r.guardrailChecks as string | null, action_taken: r.actionTaken,
        api_call: r.apiCall as string | null,
        outcome: r.outcome as AuditRow["outcome"],
        amount_recovered: r.amountRecovered, time_to_recovery_hours: r.timeToRecoveryHours,
        error: r.error as string | null,
      }));
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    if (merchantIds?.length) {
      const ph = merchantIds.map(() => "?").join(", ");
      return db.prepare(`SELECT * FROM audit_log WHERE merchant_id IN (${ph}) ORDER BY id ASC`).all(...merchantIds) as AuditRow[];
    }
    return db.prepare("SELECT * FROM audit_log ORDER BY id ASC").all() as AuditRow[];
  } finally {
    db.close();
  }
}

export async function getRecordsWithOutcomes(
  merchantIds?: string[],
): Promise<RecordWithOutcome[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { records, auditLog } = await import("./schema");
      const { eq, and, inArray, desc, isNotNull } = await import("drizzle-orm");

      const latestRuns = await db.select({ runId: auditLog.runId }).from(auditLog)
        .where(isNotNull(auditLog.runId)).orderBy(desc(auditLog.id)).limit(1);
      const latestRunId = latestRuns[0]?.runId;

      const mConds = merchantIds?.length ? [inArray(records.merchantId, merchantIds)] : [];
      const allRecords = await db.select().from(records)
        .where(mConds.length ? and(...mConds) : undefined).orderBy(records.recordId);

      const aConds = [];
      if (latestRunId) aConds.push(eq(auditLog.runId, latestRunId));
      if (merchantIds?.length) aConds.push(inArray(auditLog.merchantId, merchantIds));
      const auditRows = await db.select().from(auditLog)
        .where(aConds.length ? and(...aConds) : undefined);

      const auditByRecord = new Map<string, typeof auditRows[0]>();
      for (const a of auditRows) auditByRecord.set(a.recordId, a);

      return allRecords.map((r) => {
        const a = auditByRecord.get(r.recordId);
        return {
          record_id: r.recordId, merchant_id: r.merchantId, customer_id: r.customerId,
          customer_name: r.customerName, type: r.type, subcategory: r.subcategory,
          amount: r.amount, failure_reason: r.failureReason, customer_segment: r.customerSegment,
          failure_timestamp: r.failureTimestamp?.toISOString() ?? "",
          ground_truth: JSON.stringify(r.groundTruth),
          outcome: a?.outcome ?? null, detected_subcategory: a?.detectedSubcategory ?? null,
          detection_confidence: a?.detectionConfidence ?? null,
          selected_strategy: a?.selectedStrategy ?? null,
          decision_reasoning: a?.decisionReasoning ?? null,
          amount_recovered: a?.amountRecovered ?? null,
        };
      });
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    const lr = db.prepare("SELECT run_id FROM audit_log WHERE run_id IS NOT NULL ORDER BY id DESC LIMIT 1").get() as { run_id: string } | undefined;
    const lrId = lr?.run_id ?? null;
    const join = lrId ? `LEFT JOIN audit_log a ON a.record_id = r.record_id AND a.run_id = ?` : `LEFT JOIN audit_log a ON a.record_id = r.record_id`;
    const mCl = merchantIds?.length ? `AND r.merchant_id IN (${merchantIds.map(() => "?").join(", ")})` : "";
    const jp = lrId ? [lrId, ...(merchantIds ?? [])] : (merchantIds ?? []);
    const sql = `
      SELECT r.record_id, r.merchant_id, r.customer_id, r.customer_name,
        r.type, r.subcategory, r.amount, r.failure_reason,
        r.customer_segment, r.failure_timestamp, r.ground_truth,
        a.outcome, a.detected_subcategory, a.detection_confidence,
        a.selected_strategy, a.decision_reasoning, a.amount_recovered
      FROM records r ${join} WHERE 1=1 ${mCl} ORDER BY r.record_id ASC
    `;
    return db.prepare(sql).all(...jp) as RecordWithOutcome[];
  } finally {
    db.close();
  }
}

export async function getPromiseRows(
  merchantIds?: string[],
): Promise<PromiseRow[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { promises, records } = await import("./schema");
      const { and, inArray, eq } = await import("drizzle-orm");

      if (merchantIds?.length) {
        const rows = await db.select({
          promise_id: promises.promiseId, record_id: promises.recordId,
          customer_name: records.customerName, promised_amount: promises.promisedAmount,
          promised_date: promises.promisedDate, due_date: promises.dueDate,
          promise_source: promises.promiseSource, status: promises.status,
          renewal_count: promises.renewalCount, fulfilled_amount: promises.fulfilledAmount,
          fulfilled_date: promises.fulfilledDate,
        }).from(promises).leftJoin(records, eq(promises.recordId, records.recordId))
          .where(inArray(records.merchantId, merchantIds)).orderBy(promises.dueDate);
        return rows.map((r) => ({
          promise_id: r.promise_id, record_id: r.record_id, customer_name: r.customer_name ?? "",
          promised_amount: r.promised_amount, promised_date: r.promised_date?.toISOString() ?? "",
          due_date: r.due_date?.toISOString() ?? "", promise_source: r.promise_source,
          status: r.status, renewal_count: r.renewal_count,
          fulfilled_amount: r.fulfilled_amount, fulfilled_date: r.fulfilled_date?.toISOString() ?? null,
        }));
      }
      const rows = await db.select().from(promises).orderBy(promises.dueDate);
      return rows.map((r) => ({
        promise_id: r.promiseId, record_id: r.recordId, customer_name: "",
        promised_amount: r.promisedAmount, promised_date: r.promisedDate?.toISOString() ?? "",
        due_date: r.dueDate?.toISOString() ?? "", promise_source: r.promiseSource,
        status: r.status, renewal_count: r.renewalCount,
        fulfilled_amount: r.fulfilledAmount, fulfilled_date: r.fulfilledDate?.toISOString() ?? null,
      }));
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    if (merchantIds?.length) {
      const ph = merchantIds.map(() => "?").join(", ");
      return db.prepare(`
        SELECT p.promise_id, p.record_id, r.customer_name,
          p.promised_amount, p.promised_date, p.due_date,
          p.promise_source, p.status, p.renewal_count,
          p.fulfilled_amount, p.fulfilled_date
        FROM promises p LEFT JOIN records r ON r.record_id = p.record_id
        WHERE r.merchant_id IN (${ph}) ORDER BY p.due_date ASC
      `).all(...merchantIds) as PromiseRow[];
    }
    return db.prepare("SELECT * FROM promises ORDER BY due_date ASC").all() as PromiseRow[];
  } finally {
    db.close();
  }
}

export async function getVoiceRows(
  merchantIds?: string[],
): Promise<VoiceRow[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { voiceNotifications, records } = await import("./schema");
      const { and, inArray, eq } = await import("drizzle-orm");

      const cols = {
        notificationId: voiceNotifications.notificationId,
        recordId: voiceNotifications.recordId, customerId: voiceNotifications.customerId,
        templateId: voiceNotifications.templateId, language: voiceNotifications.language,
        personalizedText: voiceNotifications.personalizedText, tone: voiceNotifications.tone,
        channel: voiceNotifications.channel, deliveryStatus: voiceNotifications.deliveryStatus,
        deliveredAt: voiceNotifications.deliveredAt,
        audioDurationSeconds: voiceNotifications.audioDurationSeconds,
        customerResponded: voiceNotifications.customerResponded,
        responseType: voiceNotifications.responseType,
        responseTimestamp: voiceNotifications.responseTimestamp,
        createdAt: voiceNotifications.createdAt,
      };
      const rows = merchantIds?.length
        ? await db.select(cols).from(voiceNotifications)
            .leftJoin(records, eq(voiceNotifications.recordId, records.recordId))
            .where(inArray(records.merchantId, merchantIds))
            .orderBy(voiceNotifications.createdAt)
        : await db.select(cols).from(voiceNotifications).orderBy(voiceNotifications.createdAt);

      return rows.map((r) => ({
        notification_id: r.notificationId, record_id: r.recordId,
        customer_id: r.customerId, template_id: r.templateId,
        language: r.language, personalized_text: r.personalizedText,
        tone: r.tone, channel: r.channel, delivery_status: r.deliveryStatus,
        delivered_at: r.deliveredAt?.toISOString() ?? null,
        audio_duration_seconds: r.audioDurationSeconds,
        customer_responded: r.customerResponded ? 1 : 0,
        response_type: r.responseType,
        response_timestamp: r.responseTimestamp?.toISOString() ?? null,
        created_at: r.createdAt?.toISOString() ?? "",
      }));
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    if (merchantIds?.length) {
      const ph = merchantIds.map(() => "?").join(", ");
      return db.prepare(`SELECT v.* FROM voice_notifications v LEFT JOIN records r ON r.record_id = v.record_id WHERE r.merchant_id IN (${ph}) ORDER BY v.created_at ASC`).all(...merchantIds) as VoiceRow[];
    }
    return db.prepare("SELECT * FROM voice_notifications ORDER BY created_at ASC").all() as VoiceRow[];
  } finally {
    db.close();
  }
}

export async function getReportJson(reportPath?: string, merchantIds?: string[]): Promise<unknown> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { reports } = await import("./schema");
      const { desc, sql, and } = await import("drizzle-orm");

      const conds = [];
      // When merchant IDs are provided, filter to reports generated for those merchants.
      // This ensures a connected merchant only sees their own report data, never demo data.
      // Use @> (contains) with a JSONB array for each merchant ID, joined with OR.
      if (merchantIds?.length) {
        const orParts = merchantIds.map((id) =>
          sql`${reports.merchantIds} @> ${JSON.stringify([id])}::jsonb`
        );
        conds.push(sql`(${sql.join(orParts, sql` OR `)})`);
      }

      const rows = await db.select({ report: reports.report }).from(reports)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(reports.createdAt)).limit(1);
      return rows.length > 0 ? rows[0].report : null;
    });
    if (r !== null) return r;
  }

  // SQLite / file fallback
  const resolved = reportPath ?? `${process.cwd()}/data/report.json`;
  if (!fs.existsSync(resolved)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));

    // If merchant IDs are provided and the JSON has _merchant_ids, filter by overlap
    if (merchantIds?.length && Array.isArray(raw._merchant_ids) && raw._merchant_ids.length > 0) {
      const hasOverlap = merchantIds.some((id) => raw._merchant_ids.includes(id));
      if (!hasOverlap) return null;
    }

    // Strip the internal _merchant_ids before returning to callers
    const report = Object.fromEntries(
      Object.entries(raw).filter(([k]) => k !== "_merchant_ids")
    );
    return report;
  } catch {
    return null;
  }
}

export async function getCouncilState(
  merchantIds?: string[],
): Promise<{ proposals: CouncilProposal[]; overrides: CouncilOverride[] }> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { tuningProposals, councilOverrides } = await import("./schema");
      const { desc, asc, sql } = await import("drizzle-orm");

      const proposalRows = await db.select().from(tuningProposals).orderBy(
        asc(sql`CASE ${tuningProposals.status} WHEN 'pending' THEN 0 ELSE 1 END`),
        desc(tuningProposals.createdAt),
      );
      const overrideRows = await db.select().from(councilOverrides).orderBy(councilOverrides.approvedAt);

      return {
        proposals: proposalRows.map((r) => ({
          proposal_id: r.proposalId, rule_id: r.ruleId, parameter: r.parameter,
          current_value: r.currentValue, proposed_value: r.proposedValue,
          current_display: r.currentDisplay, proposed_display: r.proposedDisplay,
          rationale: r.rationale, blocked_count: r.blockedCount,
          blocked_recoverable_paise: r.blockedRecoverablePaise,
          avg_recovery_probability: r.avgRecoveryProbability, status: r.status,
          created_at: r.createdAt?.toISOString() ?? "",
          decided_at: r.decidedAt?.toISOString() ?? null,
        })),
        overrides: overrideRows.map((r) => ({
          parameter: r.parameter, value: r.value, rule_source: r.ruleSource,
          proposal_id: r.proposalId, approved_at: r.approvedAt?.toISOString() ?? "",
        })),
      };
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return { proposals: [], overrides: [] };
  try {
    const proposals = db.prepare("SELECT * FROM tuning_proposals ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC").all() as CouncilProposal[];
    const overrides = db.prepare("SELECT * FROM council_overrides ORDER BY approved_at ASC").all() as CouncilOverride[];
    return { proposals, overrides };
  } finally {
    db.close();
  }
}

export async function decideCouncilProposalInDb(
  proposalId: string,
  decision: "approved" | "rejected",
): Promise<{ ok: boolean; proposal?: CouncilProposal; error?: string }> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { tuningProposals, councilOverrides } = await import("./schema");
      const { eq } = await import("drizzle-orm");

      const rows = await db.select().from(tuningProposals).where(eq(tuningProposals.proposalId, proposalId)).limit(1);
      const row = rows[0];
      if (!row) return { ok: false, error: "Proposal not found" };
      if (row.status !== "pending") return { ok: false, error: `Proposal already ${row.status}` };

      await db.update(tuningProposals).set({ status: decision, decidedAt: new Date() })
        .where(eq(tuningProposals.proposalId, proposalId));

      if (decision === "approved") {
        await db.insert(councilOverrides).values({
          parameter: row.parameter, value: row.proposedValue,
          ruleSource: row.ruleId, proposalId: row.proposalId, approvedAt: new Date(),
        });
      }

      return {
        ok: true,
        proposal: {
          proposal_id: row.proposalId, rule_id: row.ruleId, parameter: row.parameter,
          current_value: row.currentValue, proposed_value: row.proposedValue,
          current_display: row.currentDisplay, proposed_display: row.proposedDisplay,
          rationale: row.rationale, blocked_count: row.blockedCount,
          blocked_recoverable_paise: row.blockedRecoverablePaise,
          avg_recovery_probability: row.avgRecoveryProbability, status: decision,
          created_at: row.createdAt?.toISOString() ?? "",
          decided_at: new Date().toISOString(),
        },
      };
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return { ok: false, error: "No database" };
  try {
    const row = db.prepare("SELECT * FROM tuning_proposals WHERE proposal_id = ?").get(proposalId) as CouncilProposal | undefined;
    if (!row) return { ok: false, error: "Proposal not found" };
    if (row.status !== "pending") return { ok: false, error: `Proposal already ${row.status}` };

    db.prepare("UPDATE tuning_proposals SET status = ?, decided_at = ? WHERE proposal_id = ?")
      .run(decision, new Date().toISOString(), proposalId);

    if (decision === "approved") {
      db.prepare(`INSERT OR REPLACE INTO council_overrides (parameter, value, rule_source, proposal_id, approved_at) VALUES (?, ?, ?, ?, ?)`)
        .run(row.parameter, row.proposed_value, row.rule_id, row.proposal_id, new Date().toISOString());
    }

    return { ok: true, proposal: { ...row, status: decision, decided_at: new Date().toISOString() } };
  } finally {
    db.close();
  }
}

export async function getConversationRows(
  merchantIds?: string[],
): Promise<ConversationRow[]> {
  if (pgAvailable()) {
    const r = await tryPg(async () => {
      const { getDrizzle } = await import("./pool");
      const db = getDrizzle();
      if (!db) return null;
      const { conversations, records } = await import("./schema");
      const { and, inArray, eq } = await import("drizzle-orm");

      const cols = {
        recordId: conversations.recordId, customerId: conversations.customerId,
        turns: conversations.turns, intent: conversations.intent,
        resolution: conversations.resolution, createdAt: conversations.createdAt,
      };
      const rows = merchantIds?.length
        ? await db.select(cols).from(conversations)
            .leftJoin(records, eq(conversations.recordId, records.recordId))
            .where(inArray(records.merchantId, merchantIds))
            .orderBy(conversations.createdAt)
        : await db.select(cols).from(conversations).orderBy(conversations.createdAt);

      return rows.map((r) => ({
        record_id: r.recordId, customer_id: r.customerId,
        turns: JSON.stringify(r.turns), intent: r.intent,
        resolution: r.resolution,
        created_at: r.createdAt?.toISOString() ?? "",
      }));
    });
    if (r !== null) return r;
  }

  const db = getSqliteDb();
  if (!db) return [];
  try {
    if (merchantIds?.length) {
      const ph = merchantIds.map(() => "?").join(", ");
      return db.prepare(`SELECT c.* FROM conversations c LEFT JOIN records r ON r.record_id = c.record_id WHERE r.merchant_id IN (${ph}) ORDER BY c.created_at ASC`).all(...merchantIds) as ConversationRow[];
    }
    return db.prepare("SELECT * FROM conversations ORDER BY created_at ASC").all() as ConversationRow[];
  } finally {
    db.close();
  }
}
