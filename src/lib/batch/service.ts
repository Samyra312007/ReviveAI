import fs from "node:fs";
import path from "node:path";
import {
  openDb,
  initSchema,
  insertPromises,
  insertVoiceNotifications,
  clearVoiceNotifications,
  insertTuningProposals,
} from "@/lib/db";
import { runBatch } from "@/lib/agent/core";
import { SqliteAuditWriter } from "@/lib/audit/logger";
import { computeVoiceMetrics } from "@/lib/voice/tracker";
import { generateTuningProposals, BlockObservation } from "@/lib/council/analyzer";
import { DEMO_BATCH_TOKEN, isTokenAuthorized } from "@/lib/auth";
import { loadBatchDataset, attachPromiseHistories } from "@/lib/batch/data-loader";

export { DEMO_BATCH_TOKEN };

const SERVER_SEED = 42;
const SERVER_NOW = Date.UTC(2026, 7, 25, 6, 0);

export interface BatchRunResponse {
  status: number;
  body: Record<string, unknown>;
}

let inFlight: Promise<BatchRunResponse> | null = null;

export function executeBatchRun(token: string | null): Promise<BatchRunResponse> {
  if (!isTokenAuthorized(token)) {
    return Promise.resolve({ status: 401, body: { error: "Unauthorized — missing or invalid x-batch-token" } });
  }
  if (inFlight) {
    return Promise.resolve({ status: 409, body: { error: "A batch run is already in progress" } });
  }
  inFlight = performRun().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function performRun(): Promise<BatchRunResponse> {
  const dbPath = path.join(process.cwd(), "data", "synthetic.db");
  if (!fs.existsSync(dbPath)) {
    return { status: 404, body: { error: "No dataset. Run npm run generate-data first." } };
  }

  const dataset = loadBatchDataset(dbPath);
  if (!dataset) {
    return { status: 404, body: { error: "Dataset empty." } };
  }

  const db = openDb(dbPath);
  try {
    initSchema(db);

    const overrideRows = db
      .prepare("SELECT parameter, value FROM council_overrides")
      .all() as { parameter: string; value: number }[];
    const guardrailOverrides = Object.fromEntries(
      overrideRows.map((o) => [o.parameter, o.value]),
    );

    const pendingParams = new Set(
      (
        db
          .prepare("SELECT DISTINCT parameter FROM tuning_proposals WHERE status = 'pending'")
          .all() as { parameter: string }[]
      ).map((r) => r.parameter),
    );
    const rejectedParams = new Set(
      (
        db
          .prepare("SELECT DISTINCT parameter FROM tuning_proposals WHERE status = 'rejected'")
          .all() as { parameter: string }[]
      ).map((r) => r.parameter),
    );

    const records = attachPromiseHistories(dataset);

    const result = await runBatch(records, {
      seed: SERVER_SEED,
      now: SERVER_NOW,
      guardrailConfig: guardrailOverrides,
    });

    const persist = db.transaction(() => {
      db.prepare("DELETE FROM audit_log").run();
      new SqliteAuditWriter(db).write(result.auditEntries);
      clearVoiceNotifications(db);
      insertVoiceNotifications(db, result.voiceNotifications);
      insertPromises(db, result.promiseUpdates);
    });
    persist();

    const blocks: BlockObservation[] = [];
    for (const d of result.decisions) {
      if (d.outcome !== "blocked") continue;
      for (const check of d.guardrailChecks ?? []) {
        if (!check.passed) {
          blocks.push({
            rule_id: check.rule_id,
            record_id: d.record.record_id,
            recovery_probability:
              d.record.ground_truth.expected_recovery_probability,
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
          recovery_probability:
            d.record.ground_truth.expected_recovery_probability,
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
      insertTuningProposals(db, proposals);
      proposalsInserted = proposals.length;
    }

    const reportPath = path.join(process.cwd(), "data", "report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(result.report, null, 2));

    const voiceMetrics = computeVoiceMetrics(
      result.voiceNotifications,
      result.decisions,
    );

    return {
      status: 200,
      body: {
        ok: true,
        processed: result.decisions.length,
        processing_time_ms: result.processingTimeMs,
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
        },
      },
    };
  } catch (err) {
    return {
      status: 500,
      body: {
        error: "Batch execution failed",
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    db.close();
  }
}
