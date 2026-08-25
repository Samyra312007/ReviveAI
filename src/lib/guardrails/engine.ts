import { SyntheticRecord } from "@/lib/data/schema";
import { Strategy } from "@/lib/agent/strategy";
import { BatchState } from "@/lib/agent/context";
import {
  GuardrailCheckResult,
  GuardrailOutcome,
  RULES,
  buildRuleContext,
} from "./rules";

export interface GuardrailAuditEntry {
  record_id: string;
  rule_id: string;
  rule_description: string;
  timestamp: string;
  action_taken: "SKIP" | "ESCALATE" | "RESCHEDULE" | "QUEUE" | "PAUSE";
  reasoning: string;
}

export function evaluateGuardrails(
  record: SyntheticRecord,
  strategy: Strategy,
  state: BatchState,
): { outcome: GuardrailOutcome; auditEntries: GuardrailAuditEntry[] } {
  const ctx = buildRuleContext(record, strategy, state);
  const checks: GuardrailCheckResult[] = [];
  const auditEntries: GuardrailAuditEntry[] = [];
  let block: GuardrailOutcome["block"];

  for (const rule of RULES) {
    if (!rule.applies(ctx)) continue;
    const result = rule.check(ctx);
    checks.push({
      rule_id: rule.id,
      rule_description: rule.description,
      passed: result.passed,
      block_reason: result.block_reason,
    });

    if (!result.passed && !block) {
      block = {
        rule_id: rule.id,
        rule_description: rule.description,
        action_taken: result.action_taken ?? "SKIP",
        reasoning: result.block_reason ?? "Rule violated",
      };
    }
  }

  for (const check of checks) {
    if (!check.passed) {
      auditEntries.push({
        record_id: record.record_id,
        rule_id: check.rule_id,
        rule_description: check.rule_description,
        timestamp: new Date(state.now).toISOString(),
        action_taken: block?.rule_id === check.rule_id ? (block?.action_taken ?? "SKIP") : "SKIP",
        reasoning: check.block_reason ?? "Rule violated",
      });
    }
  }

  return { outcome: { passed: !block, checks, block }, auditEntries };
}
