import { executeBatchRun } from "../src/lib/batch/service";

async function main() {
  console.log("Running batch...\n");
  const start = Date.now();

  const result = await executeBatchRun();

  if (result.status !== 200) {
    console.error("Batch failed:", result.body);
    process.exit(1);
  }

  const body = result.body as {
    ok: boolean;
    processed: number;
    processing_time_ms: number;
    report_warning?: string;
    report: {
      hero: {
        recovered_display: string;
        at_risk_display: string;
        recovery_rate_pct: number;
        roi_display: string;
      };
      recovery_by_category: {
        category: string;
        at_risk_paise: number;
        recovered_paise: number;
        recovery_rate: number;
      }[];
      accuracy: {
        overall: { precision: number | null; recall: number | null; f1: number | null };
        false_positive_rate: number;
      };
      guardrails: { total_blocks: number; block_rate: number; blocks_by_rule: Record<string, number> };
      operational: { records_intervened: number; records_skipped: number; records_escalated: number; records_blocked: number; api_errors: number };
    };
    voice: { sent: number; metrics: unknown; events: number };
    conversations: { total: number };
  };

  if (body.report_warning) {
    console.warn("⚠ ", body.report_warning);
  }

  const hero = body.report.hero;
  console.log("═══════════════════════════════════════════");
  console.log(`  ${hero.recovered_display} recovered from ${hero.at_risk_display} at risk`);
  console.log(`  Recovery Rate: ${hero.recovery_rate_pct}%   Net ROI: ${hero.roi_display}`);
  console.log("═══════════════════════════════════════════");

  console.log("\nBy category:");
  for (const cat of body.report.recovery_by_category) {
    console.log(
      `  ${cat.category.padEnd(24)} at risk ${(cat.at_risk_paise / 100).toLocaleString("en-IN").padStart(10)}  recovered ${(cat.recovered_paise / 100).toLocaleString("en-IN").padStart(10)}  rate ${Math.round(cat.recovery_rate * 1000) / 10}%`,
    );
  }

  console.log("\nDetection accuracy:");
  console.log(
    `  precision=${body.report.accuracy.overall.precision} recall=${body.report.accuracy.overall.recall} f1=${body.report.accuracy.overall.f1} fp_rate=${body.report.accuracy.false_positive_rate}`,
  );

  console.log("\nGuardrails:");
  console.log(`  blocks=${body.report.guardrails.total_blocks} (${body.report.guardrails.block_rate}%)`);
  for (const [rule, count] of Object.entries(body.report.guardrails.blocks_by_rule)) {
    console.log(`    ${rule}: ${count}`);
  }

  console.log(`\nOperational:`);
  const op = body.report.operational;
  console.log(
    `  intervened=${op.records_intervened} skipped=${op.records_skipped} escalated=${op.records_escalated} blocked=${op.records_blocked} api_errors=${op.api_errors}`,
  );
  console.log(`  wall time: ${Date.now() - start}ms`);
  console.log(`\nProcessed: ${body.processed} records`);
  console.log(`Voice notifications: ${body.voice.sent}`);
  console.log(`Conversations: ${body.conversations.total}`);
}

main().catch((err) => {
  console.error("Batch failed:", err);
  process.exit(1);
});
