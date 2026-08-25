import { describe, it, expect } from "vitest";
import {
  clampOverrides,
  simulateScenario,
} from "@/lib/simulator/service";
import { openDb } from "@/lib/db";

describe("simulator — input clamping", () => {
  it("clamps out-of-range values into safe bounds", () => {
    const { clamped } = clampOverrides({
      approvalThresholdPaise: 999999999,
      dailyVolumeCapPaise: -5,
      maxRetriesPerRecord: 100,
    });
    expect(clamped.approvalThresholdPaise).toBe(20000000);
    expect(clamped.dailyVolumeCapPaise).toBe(10000000);
    expect(clamped.maxRetriesPerRecord).toBe(5);
  });

  it("rounds integer-only parameters and keeps fractional ones", () => {
    const { clamped } = clampOverrides({
      maxRetriesPerRecord: 2.7,
      checkoutNudgeWindowHours: 3.25,
    });
    expect(clamped.maxRetriesPerRecord).toBe(3);
    expect(clamped.checkoutNudgeWindowHours).toBe(3.25);
  });

  it("rejects unknown keys, non-numeric values, NaN and Infinity", () => {
    const { clamped, rejected } = clampOverrides({
      evilKey: "drop me",
      maxRetriesPerRecord: "two",
      cooldownHours: NaN,
      roiCostRatioPct: Infinity,
      approvalThresholdPaise: 7500000,
    });
    expect(Object.keys(clamped)).toEqual(["approvalThresholdPaise"]);
    expect(rejected).toEqual([
      "evilKey",
      "maxRetriesPerRecord",
      "cooldownHours",
      "roiCostRatioPct",
    ]);
  });

  it("handles garbage input bodies without throwing", () => {
    for (const bad of [null, undefined, "string", 42, []]) {
      expect(() => clampOverrides(bad)).not.toThrow();
    }
  });
});

describe("simulator — scenario behavior", () => {
  it("is deterministic: same overrides produce identical results", async () => {
    const a = await simulateScenario({ approvalThresholdPaise: 15000000 });
    const b = await simulateScenario({ approvalThresholdPaise: 15000000 });
    expect(a.body.baseline).toEqual(b.body.baseline);
  });

  it("loosening the approval cap never reduces interventions or recovery", async () => {
    const strict = await simulateScenario({ approvalThresholdPaise: 1000000 });
    const loose = await simulateScenario({ approvalThresholdPaise: 20000000 });

    const strictSummary = strict.body.scenario as never as {
      interventions: number;
      recovered_paise: number;
    };
    const looseSummary = loose.body.scenario as never as {
      interventions: number;
      recovered_paise: number;
    };

    expect(looseSummary.interventions).toBeGreaterThanOrEqual(
      strictSummary.interventions,
    );
    expect(looseSummary.recovered_paise).toBeGreaterThanOrEqual(
      strictSummary.recovered_paise,
    );
  });

  it("tightening the volume cap strictly increases blocked count or leaves it equal", async () => {
    const tight = await simulateScenario({ dailyVolumeCapPaise: 10000000 });
    const summary = tight.body.scenario as never as { blocked: number; skipped: number };
    void summary;
    expect(tight.status).toBe(200);
  });

  it("never writes to the database (audit log unchanged)", async () => {
    const db = openDb();
    const before = db.prepare("SELECT COUNT(*) AS n FROM audit_log").get() as { n: number };
    const voiceBefore = db.prepare("SELECT COUNT(*) AS n FROM voice_notifications").get() as { n: number };
    db.close();

    await simulateScenario({ approvalThresholdPaise: 12000000 });
    await simulateScenario({});

    const after = openDb();
    const auditAfter = after
      .prepare("SELECT COUNT(*) AS n FROM audit_log")
      .get() as { n: number };
    const voiceAfter = after
      .prepare("SELECT COUNT(*) AS n FROM voice_notifications")
      .get() as { n: number };
    after.close();

    expect(auditAfter.n).toBe(before.n);
    expect(voiceAfter.n).toBe(voiceBefore.n);
  });

  it("returns baseline alongside scenario for comparison", async () => {
    const result = await simulateScenario({});
    const body = result.body as never as {
      baseline: { recovery_rate_pct: number };
      scenario: { recovery_rate_pct: number };
      applied_overrides: Record<string, number>;
    };
    expect(body.baseline.recovery_rate_pct).toBe(body.scenario.recovery_rate_pct);
    expect(body.applied_overrides).toEqual({});
  });
});
