import { describe, it, expect, afterAll, vi } from "vitest";
import {
  generateTuningProposals,
  BlockObservation,
} from "@/lib/council/analyzer";
import {
  DEFAULT_GUARDRAIL_CONFIG,
  resolveGuardrailConfig,
} from "@/lib/guardrails/config";
import { runBatch } from "@/lib/agent/core";
import { generateBatch } from "@/lib/data/generator";
import {
  executeBatchRun,
} from "@/lib/batch/service";
import {
  getCouncilState,
  decideCouncilProposalInDb,
} from "@/lib/db/query";

const NOW = Date.UTC(2026, 7, 25, 6, 0);

function block(ruleId: string, i: number, prob = 0.7): BlockObservation {
  return {
    rule_id: ruleId,
    record_id: `rec_${String(i).padStart(3, "0")}`,
    recovery_probability: prob,
    recoverable_amount_paise: 5000_00,
  };
}

const baseCtx = (overrides: Partial<Parameters<typeof generateTuningProposals>[1]> = {}) => ({
  config: DEFAULT_GUARDRAIL_CONFIG,
  pendingParameters: new Set<string>(),
  overriddenParameters: new Set<string>(),
  rejectedParameters: new Set<string>(),
  nowMs: NOW,
  ...overrides,
});

describe("council analyzer", () => {
  it("proposes B3 window doubling when it blocked 3+ high-probability records", () => {
    const proposals = generateTuningProposals(
      [block("B3", 1), block("B3", 2), block("B3", 3)],
      baseCtx(),
    );
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.rule_id).toBe("B3");
    expect(p.parameter).toBe("checkoutNudgeWindowHours");
    expect(p.proposed_value).toBe(DEFAULT_GUARDRAIL_CONFIG.checkoutNudgeWindowHours * 2);
    expect(p.rationale).toContain("[B3]");
  });

  it("single high-probability block still generates a proposal (threshold = 1)", () => {
    const proposals = generateTuningProposals([block("B4", 1, 0.65)], baseCtx());
    expect(proposals).toHaveLength(1);
    expect(proposals[0].rule_id).toBe("B4");
    expect(proposals[0].proposed_value).toBe(
      DEFAULT_GUARDRAIL_CONFIG.subscriptionRetryWindowDays + 3,
    );
  });

  it("ignores zero-probability observations entirely", () => {
    const proposals = generateTuningProposals(
      [block("B3", 1, 0.0)],
      baseCtx(),
    );
    expect(proposals).toHaveLength(0);
  });

  it("suppresses parameters that were previously rejected by the human", () => {
    const blocks = [block("B3", 1), block("B3", 2)];
    const suppressed = generateTuningProposals(
      blocks,
      baseCtx({ rejectedParameters: new Set(["checkoutNudgeWindowHours"]) }),
    );
    expect(suppressed).toHaveLength(0);

    const notSuppressed = generateTuningProposals(blocks, baseCtx());
    expect(notSuppressed).toHaveLength(1);
  });

  it("ignores blocks on low-probability records (avg p <= 0.5)", () => {
    const proposals = generateTuningProposals(
      [
        block("B3", 1, 0.2),
        block("B3", 2, 0.3),
        block("B3", 3, 0.4),
      ],
      baseCtx(),
    );
    expect(proposals).toHaveLength(0);
  });

  it("skips parameters that already have a pending proposal or an override", () => {
    const blocks = [block("C4", 1), block("C4", 2), block("C4", 3)];
    const withPending = generateTuningProposals(
      blocks,
      baseCtx({ pendingParameters: new Set(["approvalThresholdPaise"]) }),
    );
    expect(withPending).toHaveLength(0);

    const withOverride = generateTuningProposals(
      blocks,
      baseCtx({ overriddenParameters: new Set(["approvalThresholdPaise"]) }),
    );
    expect(withOverride).toHaveLength(0);
  });

  it("never proposes unbounded values (caps enforced)", () => {
    const tightConfig = resolveGuardrailConfig({ checkoutNudgeWindowHours: 8 });
    const proposals = generateTuningProposals(
      [block("B3", 1), block("B3", 2), block("B3", 3)],
      baseCtx({ config: tightConfig }),
    );
    expect(proposals).toHaveLength(0);
  });

  it("sorts proposals by blocked count descending", () => {
    const proposals = generateTuningProposals(
      [
        block("A1", 1), block("A1", 2), block("A1", 7),
        block("B3", 1), block("B3", 2), block("B3", 3), block("B3", 4), block("B3", 8), block("B3", 9),
        block("D2", 1), block("D2", 2), block("D2", 3), block("D2", 5),
      ],
      baseCtx(),
    );
    expect(proposals.map((p) => p.rule_id)).toEqual(["B3", "D2", "A1"]);
  });
});

describe("guardrail config actually changes agent behavior", () => {
  it("raising the approval threshold recovers invoices that were previously escalated", async () => {
    const { records } = generateBatch(42, NOW);

    const strict = await runBatch(records, {
      seed: 42,
      now: NOW,
      enableVoice: false,
      enablePromises: false,
      guardrailConfig: { approvalThresholdPaise: 100_000 },
    });
    const lenient = await runBatch(records, {
      seed: 42,
      now: NOW,
      enableVoice: false,
      enablePromises: false,
      guardrailConfig: { approvalThresholdPaise: 200_000 * 100 },
    });

    const c4Strict = strict.decisions.filter((d) =>
      d.guardrailChecks?.some((c) => c.rule_id === "C4" && !c.passed),
    ).length;
    const c4Lenient = lenient.decisions.filter((d) =>
      d.guardrailChecks?.some((c) => c.rule_id === "C4" && !c.passed),
    ).length;

    expect(c4Lenient).toBeLessThan(c4Strict);
    expect(lenient.report.recovery.recovered_paise).toBeGreaterThanOrEqual(
      strict.report.recovery.recovered_paise,
    );
  });

  it("defaults are used when no config is passed", () => {
    const state = resolveGuardrailConfig();
    expect(state.approvalThresholdPaise).toBe(DEFAULT_GUARDRAIL_CONFIG.approvalThresholdPaise);
  });
});

describe("council service roundtrip — approve → applied next run", () => {
  afterAll(async () => {
    const { openDb } = await import("@/lib/db");
    const db = openDb();
    db.prepare("DELETE FROM council_overrides").run();
    db.prepare("DELETE FROM tuning_proposals").run();
    db.close();
  });

  it("full lifecycle: run → propose → approve → override active → next run reports it", async () => {
    void afterAll;
    const seedRun = await executeBatchRun();
    expect(seedRun.status).toBe(200);
    void seedRun;

    const state = await getCouncilState();

    let target = state.proposals.find((p) => p.status === "pending");

    if (!target) {
      const fakeId = `tun_C4_${Date.now()}_test`;
      const { openDb, insertTuningProposals } = await import("@/lib/db");
      const db = openDb();
      insertTuningProposals(db, [
        {
          proposal_id: fakeId,
          rule_id: "C4",
          parameter: "approvalThresholdPaise",
          current_value: DEFAULT_GUARDRAIL_CONFIG.approvalThresholdPaise,
          proposed_value: 75000 * 100,
          current_display: "₹50,000 approval cap",
          proposed_display: "₹75,000 approval cap",
          rationale: "[C4] test-seeded proposal for roundtrip verification",
          blocked_count: 5,
          blocked_recoverable_paise: 300000_00,
          avg_recovery_probability: 0.65,
          created_at: new Date().toISOString(),
        },
      ]);
      db.close();
      const refreshed = await getCouncilState();
      target = refreshed.proposals.find((p) => p.status === "pending")!;
    }

    expect(target).toBeDefined();

    const decision = await decideCouncilProposalInDb(target!.proposal_id, "approved");
    expect(decision.ok).toBe(true);

    const doubleDecide = await decideCouncilProposalInDb(target!.proposal_id, "rejected");
    expect(doubleDecide.ok).toBe(false);

    const appliedRun = await executeBatchRun();
    expect(appliedRun.status).toBe(200);
    const council = (
      appliedRun.body as {
        report: { council: { applied_overrides: string[]; active_override_values: Record<string, number> } };
      }
    ).report.council;
    expect(council.applied_overrides).toContain(target!.parameter);
    expect(council.active_override_values[target!.parameter]).toBe(
      target!.proposed_value,
    );

    const afterState = await getCouncilState();
    const decidedRow = afterState.proposals.find(
      (p) => p.proposal_id === target!.proposal_id,
    )!;
    expect(decidedRow.status).toBe("approved");
    expect(afterState.overrides.length).toBeGreaterThan(0);
  });

  it("decide API rejects unauthorized calls at the route level", async () => {
    // Mock auth to return null (unauthenticated)
    vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
    const { POST } = await import("@/app/api/council/decide/route");
    const res = await POST(
      new Request("http://localhost/api/council/decide", {
        method: "POST",
        body: JSON.stringify({ proposal_id: "x", decision: "approved" }),
      }) as never,
    );
    expect(res.status).toBe(401);
    vi.restoreAllMocks();
  });
});
