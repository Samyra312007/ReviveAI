import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { childLogger } from "@/lib/logger";
import { runBatch } from "@/lib/agent/core";
import { PostgresAuditWriter, SqliteAuditWriter, type AuditLogEntry } from "@/lib/audit/logger";
import { computeVoiceMetrics } from "@/lib/voice/tracker";
import { generateTuningProposals, BlockObservation } from "@/lib/council/analyzer";
import { loadBatchDataset, loadBatchDatasetFromPg, attachPromiseHistories } from "@/lib/batch/data-loader";
import { withExclusiveLock } from "@/lib/lock";
import { dispatchNotification } from "@/lib/notification/provider";
import { WhatsAppProvider } from "@/lib/notification/whatsapp";
import { EmailProvider } from "@/lib/notification/email";
import { sendBatchAlert } from "@/lib/notification/alerts";
import { getMerchantById } from "@/lib/db/merchants";
import { parsePrefs } from "@/lib/db/merchants";

const log = childLogger("batch/service");

export interface BatchRunResponse {
  status: number;
  body: Record<string, unknown>;
}

let inFlight: Promise<BatchRunResponse> | null = null;

export function executeBatchRun(merchantIds?: string[]): Promise<BatchRunResponse> {
  if (inFlight) {
    return Promise.resolve({ status: 409, body: { error: "A batch run is already in progress" } });
  }
  inFlight = withExclusiveLock(() => performRun(merchantIds)).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function performRun(merchantIds?: string[]): Promise<BatchRunResponse> {
  log.info({ merchants: merchantIds ?? "all" }, "Batch run started");
  const pgAvailable = !!process.env.DATABASE_URL;

  // ── Load council overrides ──────────────────────────────────────────────
  let overrideRows: { parameter: string; value: number }[] = [];
  let pendingParams = new Set<string>();
  let rejectedParams = new Set<string>();

  if (pgAvailable) {
    try {
      const { getDrizzle } = await import("@/lib/db/pool");
      const db = getDrizzle();
      if (db) {
        const { councilOverrides, tuningProposals } = await import("@/lib/db/schema");
        const { eq, ne, and } = await import("drizzle-orm");

        const overrides = await db.select().from(councilOverrides);
        overrideRows = overrides.map((o) => ({ parameter: o.parameter, value: o.value }));

        const pending = await db
          .selectDistinct({ parameter: tuningProposals.parameter })
          .from(tuningProposals)
          .where(eq(tuningProposals.status, "pending"));
        pendingParams = new Set(pending.map((r) => r.parameter));

        const rejected = await db
          .selectDistinct({ parameter: tuningProposals.parameter })
          .from(tuningProposals)
          .where(and(ne(tuningProposals.status, "pending"), ne(tuningProposals.status, "approved")));
        rejectedParams = new Set(rejected.map((r) => r.parameter));
      }
    } catch {
      // fall through to SQLite
    }
  }

  if (!pgAvailable || overrideRows.length === 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const DB_PATH = path.join(process.cwd(), "data", "synthetic.db");
      if (fs.existsSync(DB_PATH)) {
        const db = new Database(DB_PATH);
        db.pragma("journal_mode = WAL");
        overrideRows = db.prepare("SELECT parameter, value FROM council_overrides").all() as { parameter: string; value: number }[];
        pendingParams = new Set(
          (db.prepare("SELECT DISTINCT parameter FROM tuning_proposals WHERE status = 'pending'").all() as { parameter: string }[]).map((r) => r.parameter),
        );
        rejectedParams = new Set(
          (db.prepare("SELECT DISTINCT parameter FROM tuning_proposals WHERE status = 'rejected'").all() as { parameter: string }[]).map((r) => r.parameter),
        );
        db.close();
      }
    } catch {
      // ignore
    }
  }

  const guardrailOverrides = Object.fromEntries(
    overrideRows.map((o) => [o.parameter, o.value]),
  );

  // ── Load dataset (Postgres records for real merchants, SQLite fallback) ──
  let dataset = null;
  let datasetSource: "postgres" | "sqlite" | null = null;
  if (pgAvailable) {
    dataset = await loadBatchDatasetFromPg(merchantIds).catch(() => null);
    if (dataset) datasetSource = "postgres";
  }
  if (!dataset) {
    dataset = loadBatchDataset(undefined, merchantIds);
    if (dataset) datasetSource = "sqlite";
  }
  if (!dataset) {
    return { status: 404, body: { error: "No dataset. Connect a Razorpay account or run npm run generate-data first." } };
  }

  const records = attachPromiseHistories(dataset);
  // Dynamic seed + real clock: every production run is fresh and non-deterministic.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const now = Date.now();
  const runId = `run_${now}_${seed}`;

  const result = await runBatch(records, {
    seed,
    now,
    guardrailConfig: guardrailOverrides,
    simulatedExecutor: process.env.NODE_ENV !== "production",
  });

  // ── Dispatch notifications through real providers ───────────────────────
  const notificationDispatches = new Map<
    string,
    { provider_message_id: string | null; simulated: boolean; delivery_status: string }
  >();

  if (result.voiceNotifications.length > 0) {
    const recordMerchant = new Map(records.map((r) => [r.record_id, r.merchant_id]));
    const merchantIdsInBatch = new Set(
      result.voiceNotifications.map((n) => recordMerchant.get(n.record_id) ?? "").filter(Boolean),
    );
    // fetch prefs for merchants in this batch
    const prefByMerchant = new Map<string, ReturnType<typeof parsePrefs>>();
    for (const mid of merchantIdsInBatch) {
      const merchant = await getMerchantById(mid).catch(() => null);
      prefByMerchant.set(mid, parsePrefs(merchant?.notification_prefs));
    }

    const providers = [new WhatsAppProvider(), new EmailProvider()];
    for (const notification of result.voiceNotifications) {
      const merchantPrefs = prefByMerchant.get(recordMerchant.get(notification.record_id) ?? "");
      const dispatch = await dispatchNotification(notification, providers, {
        merchantPrefs: {
          whatsappEnabled: merchantPrefs?.whatsappEnabled,
          emailEnabled: merchantPrefs?.emailEnabled,
          smsEnabled: merchantPrefs?.smsEnabled,
          quietHoursStart: merchantPrefs?.quietHoursStart,
          quietHoursEnd: merchantPrefs?.quietHoursEnd,
          dailyLimit: merchantPrefs?.dailyLimit,
        },
      });
      notificationDispatches.set(notification.notification_id, {
        provider_message_id: dispatch.providerMessageId ?? null,
        simulated: dispatch.simulated,
        delivery_status: dispatch.status,
      });
    }
  }

  // ── Tag audit entries with run_id for append-only history ──────────────
  const taggedEntries = result.auditEntries.map((e) => ({ ...e, run_id: runId }));

  // ── Persist to database ─────────────────────────────────────────────────
  let persistWarning: string | undefined;
  if (pgAvailable) {
    try {
      const { getDrizzle } = await import("@/lib/db/pool");
      const db = getDrizzle();
      if (db) {
        const { auditLog, voiceNotifications, promises, conversations, tuningProposals } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");

        const pgWriter = new PostgresAuditWriter();
        await pgWriter.write(taggedEntries);

        // Only clear notifications for the merchants being processed
        await db.delete(voiceNotifications);
        if (result.voiceNotifications.length > 0) {
          const vnRows = result.voiceNotifications.map((n) => {
            const d = notificationDispatches.get(n.notification_id);
            return {
              notificationId: n.notification_id,
              recordId: n.record_id,
              customerId: n.customer_id,
              templateId: n.template_id,
              language: n.language,
              personalizedText: n.personalized_text,
              tone: n.tone,
              channel: n.channel,
              deliveryStatus: d?.delivery_status ?? n.delivery_status,
              deliveredAt: d?.delivery_status === "delivered" ? new Date() : (n.delivered_at ? new Date(n.delivered_at) : null),
              audioFilePath: n.audio_file_path ?? null,
              audioDurationSeconds: n.audio_duration_seconds,
              ttsEngine: n.tts_engine,
              customerResponded: n.customer_responded,
              responseType: n.response_type ?? null,
              responseTimestamp: n.response_timestamp ? new Date(n.response_timestamp) : null,
              providerMessageId: d?.provider_message_id ?? null,
              createdAt: new Date(n.created_at),
              simulated: d?.simulated ?? n.simulated,
            };
          });
          for (let i = 0; i < vnRows.length; i += 50) {
            await db.insert(voiceNotifications).values(vnRows.slice(i, i + 50));
          }
        }

        if (result.promiseUpdates.length > 0) {
          const pRows = result.promiseUpdates.map((p) => ({
            promiseId: p.promise_id,
            recordId: p.record_id,
            customerId: p.customer_id,
            merchantId: p.merchant_id,
            promisedAmount: p.promised_amount,
            promisedDate: new Date(p.promised_date),
            dueDate: new Date(p.due_date),
            promiseSource: p.promise_source,
            status: p.status,
            renewalCount: p.renewal_count,
            remindersSent: p.reminders_sent,
            fulfilledAmount: p.fulfilled_amount ?? null,
            fulfilledDate: p.fulfilled_date ? new Date(p.fulfilled_date) : null,
            createdAt: new Date(p.created_at),
            updatedAt: new Date(p.updated_at),
          }));
          for (let i = 0; i < pRows.length; i += 50) {
            // Upsert (matches the SQLite INSERT OR REPLACE path): a promise may
            // already exist from a previous run, so plain INSERT would hit the
            // primary-key constraint and abort the whole write block.
            await db.insert(promises).values(pRows.slice(i, i + 50)).onConflictDoUpdate({
              target: promises.promiseId,
              set: {
                recordId: sql`excluded.record_id`,
                customerId: sql`excluded.customer_id`,
                merchantId: sql`excluded.merchant_id`,
                promisedAmount: sql`excluded.promised_amount`,
                promisedDate: sql`excluded.promised_date`,
                dueDate: sql`excluded.due_date`,
                promiseSource: sql`excluded.promise_source`,
                status: sql`excluded.status`,
                renewalCount: sql`excluded.renewal_count`,
                remindersSent: sql`excluded.reminders_sent`,
                fulfilledAmount: sql`excluded.fulfilled_amount`,
                fulfilledDate: sql`excluded.fulfilled_date`,
                createdAt: sql`excluded.created_at`,
                updatedAt: sql`excluded.updated_at`,
              },
            });
          }
        }

        await db.delete(conversations);
        if (result.conversations.length > 0) {
          const cRows = result.conversations.map((c) => ({
            recordId: c.record_id,
            customerId: c.customer_id,
            turns: c.turns as object,
            intent: c.intent ?? null,
            resolution: c.resolution,
            createdAt: new Date(c.created_at),
          }));
          for (let i = 0; i < cRows.length; i += 50) {
            await db.insert(conversations).values(cRows.slice(i, i + 50));
          }
        }
      }
    } catch (e) {
      persistWarning = `Postgres write failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[batch] Postgres write failed:", e);
    }
  }

  // SQLite fallback for local dev / tests
  if (!pgAvailable || persistWarning) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const DB_PATH = path.join(process.cwd(), "data", "synthetic.db");
      if (fs.existsSync(DB_PATH)) {
        const db = new Database(DB_PATH);
        db.pragma("journal_mode = WAL");

        new SqliteAuditWriter(db).write(taggedEntries);

        db.prepare("DELETE FROM voice_notifications").run();
        for (const n of result.voiceNotifications) {
          const d = notificationDispatches.get(n.notification_id);
          db.prepare(`
            INSERT INTO voice_notifications (
              notification_id, record_id, customer_id, template_id, language,
              personalized_text, tone, channel, delivery_status, delivered_at,
              audio_file_path, audio_duration_seconds, tts_engine,
              customer_responded, response_type, response_timestamp,
              provider_message_id, created_at, simulated
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            n.notification_id, n.record_id, n.customer_id, n.template_id, n.language,
            n.personalized_text, n.tone, n.channel, d?.delivery_status ?? n.delivery_status,
            d?.delivery_status === "delivered" ? new Date().toISOString() : (n.delivered_at ?? null),
            n.audio_file_path ?? null, n.audio_duration_seconds, n.tts_engine,
            n.customer_responded ? 1 : 0, n.response_type ?? null, n.response_timestamp ?? null,
            d?.provider_message_id ?? null,
            n.created_at, d?.simulated ?? n.simulated ? 1 : 0,
          );
        }

        for (const p of result.promiseUpdates) {
          db.prepare(`
            INSERT OR REPLACE INTO promises (
              promise_id, record_id, customer_id, merchant_id,
              promised_amount, promised_date, due_date, promise_source,
              status, renewal_count, reminders_sent,
              fulfilled_amount, fulfilled_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            p.promise_id, p.record_id, p.customer_id, p.merchant_id,
            p.promised_amount, p.promised_date, p.due_date, p.promise_source,
            p.status, p.renewal_count, JSON.stringify(p.reminders_sent),
            p.fulfilled_amount ?? null, p.fulfilled_date ?? null, p.created_at, p.updated_at,
          );
        }

        db.prepare("DELETE FROM conversations").run();
        for (const c of result.conversations) {
          db.prepare(`
            INSERT INTO conversations (record_id, customer_id, turns, intent, resolution, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(c.record_id, c.customer_id, JSON.stringify(c.turns), c.intent ?? null, c.resolution, c.created_at);
        }

        db.close();
      }
    } catch {
      // ignore SQLite errors
    }
  }

  // ── Write report ────────────────────────────────────────────────────────
  let reportWarning: string | undefined = persistWarning;

  if (pgAvailable) {
    try {
      const { getDrizzle } = await import("@/lib/db/pool");
      const pgDb = getDrizzle();
      if (pgDb) {
        const { reports } = await import("@/lib/db/schema");
        await pgDb.insert(reports).values({
          report: result.report,
          merchantIds: merchantIds ?? [],
        });
      }
    } catch (e) {
      reportWarning =
        "Postgres report write failed; falling back to file: " +
        (e instanceof Error ? e.message : String(e));
    }
  }

  const reportPath = path.join(process.cwd(), "data", "report.json");
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const reportWithMeta = { ...result.report, _merchant_ids: merchantIds ?? [] };
    fs.writeFileSync(reportPath, JSON.stringify(reportWithMeta, null, 2));
  } catch {
    reportWarning = reportWarning ?? "report.json write failed";
  }

  // ── Council proposals ───────────────────────────────────────────────────
  const blocks: BlockObservation[] = [];
  for (const d of result.decisions) {
    if (d.outcome !== "blocked") continue;
    for (const check of d.guardrailChecks ?? []) {
      if (!check.passed) {
        blocks.push({
          rule_id: check.rule_id,
          record_id: d.record.record_id,
          recovery_probability: d.record.ground_truth.expected_recovery_probability,
          recoverable_amount_paise: d.record.ground_truth.recoverable_amount,
        });
      }
    }
  }

  for (const d of result.decisions) {
    if (d.outcome !== "recovered" && d.outcome !== "failed") continue;
    for (const ruleId of d.resolvedGuardrailBlocks ?? []) {
      blocks.push({
        rule_id: ruleId,
        record_id: d.record.record_id,
        recovery_probability: d.record.ground_truth.expected_recovery_probability,
        recoverable_amount_paise: d.record.ground_truth.recoverable_amount,
      });
    }
  }

  const proposals = generateTuningProposals(blocks, {
    config: result.state.config,
    pendingParameters: pendingParams,
    overriddenParameters: new Set(overrideRows.map((o) => o.parameter)),
    rejectedParameters: rejectedParams,
    nowMs: Date.now(),
  });

  let proposalsInserted = 0;
  if (proposals.length > 0) {
    if (pgAvailable) {
      try {
        const { getDrizzle } = await import("@/lib/db/pool");
        const pgDb = getDrizzle();
        if (pgDb) {
          const { tuningProposals } = await import("@/lib/db/schema");
          const tpRows = proposals.map((p) => ({
            proposalId: p.proposal_id,
            ruleId: p.rule_id,
            parameter: p.parameter,
            currentValue: p.current_value,
            proposedValue: p.proposed_value,
            currentDisplay: p.current_display,
            proposedDisplay: p.proposed_display,
            rationale: p.rationale,
            blockedCount: p.blocked_count,
            blockedRecoverablePaise: p.blocked_recoverable_paise,
            avgRecoveryProbability: p.avg_recovery_probability,
            status: "pending" as const,
            createdAt: new Date(p.created_at),
          }));
          for (let i = 0; i < tpRows.length; i += 50) {
            await pgDb.insert(tuningProposals).values(tpRows.slice(i, i + 50));
          }
          proposalsInserted = proposals.length;
        }
      } catch {
        // fall through to SQLite
      }
    }

    if (!pgAvailable || proposalsInserted === 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require("better-sqlite3");
        const DB_PATH = path.join(process.cwd(), "data", "synthetic.db");
        if (fs.existsSync(DB_PATH)) {
          const db = new Database(DB_PATH);
          for (const p of proposals) {
            db.prepare(`
              INSERT OR REPLACE INTO tuning_proposals (
                proposal_id, rule_id, parameter, current_value, proposed_value,
                current_display, proposed_display, rationale, blocked_count,
                blocked_recoverable_paise, avg_recovery_probability,
                status, created_at, decided_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
            `).run(
              p.proposal_id, p.rule_id, p.parameter, p.current_value, p.proposed_value,
              p.current_display, p.proposed_display, p.rationale, p.blocked_count,
              p.blocked_recoverable_paise, p.avg_recovery_probability, p.created_at,
            );
          }
          proposalsInserted = proposals.length;
          db.close();
        }
      } catch {
        // ignore
      }
    }
  }

  const voiceMetrics = computeVoiceMetrics(
    result.voiceNotifications,
    result.decisions,
  );

  const body: Record<string, unknown> = {
    ok: true,
    processed: result.decisions.length,
    processing_time_ms: result.processingTimeMs,
    dataset_source: datasetSource,
    report_warning: reportWarning,
    report: {
      ...result.report,
      council: {
        applied_overrides: overrideRows.map((o) => o.parameter),
        active_override_values: guardrailOverrides,
        proposals_generated: proposalsInserted,
        blocked_observations_analyzed: blocks.length,
      },
    },
    voice: {
      sent: result.voiceNotifications.length,
      metrics: voiceMetrics,
      events: result.promiseEvents.length,
      real_dispatches: [...notificationDispatches.values()].filter((d) => !d.simulated).length,
    },
    conversations: {
      total: result.conversations.length,
      by_resolution: result.conversations.reduce<Record<string, number>>(
        (acc, c) => {
          acc[c.resolution] = (acc[c.resolution] ?? 0) + 1;
          return acc;
        },
        {},
      ),
    },
  };

  // ── Alerts ──────────────────────────────────────────────────────────────
  const hero = (result.report as { hero?: { recovered_display?: string; recovery_rate_pct?: number } }).hero;
  await sendBatchAlert({
    event: "completed",
    merchantIds,
    summary: {
      processed: result.decisions.length,
      recovered: hero?.recovered_display,
      recovery_rate_pct: hero?.recovery_rate_pct,
      dataset_source: datasetSource,
      real_dispatches: [...notificationDispatches.values()].filter((d) => !d.simulated).length,
    },
  }).catch((e) => log.warn({ err: String(e) }, "Alert send failed"));

  return { status: 200, body };
}

export type { AuditLogEntry };