import { describe, it, expect } from "vitest";
import {
  buildFleetSummary,
  FleetRecordRow,
} from "@/lib/fleet/aggregate";

function row(overrides: Partial<FleetRecordRow> & { merchant_id: string; i?: number }): FleetRecordRow {
  const { merchant_id, i = 0, ...rest } = overrides;
  return {
    type: "payment_failure",
    amount: 250000,
    ground_truth: JSON.stringify({ recoverable_amount: 200000 }),
    outcome: "recovered",
    amount_recovered: 200000,
    ...rest,
    record_id: `rec_${merchant_id}_${i}`,
    merchant_id,
  } as FleetRecordRow;
}

describe("fleet aggregation", () => {
  it("sums per-merchant at-risk, recovered, and counts correctly", () => {
    const rows = [
      row({ merchant_id: "mer_a", amount_recovered: 100000 }),
      row({ merchant_id: "mer_a", outcome: "failed", amount_recovered: null, i: 1 }),
      row({ merchant_id: "mer_a", outcome: "blocked", i: 2 }),
      row({ merchant_id: "mer_b", amount_recovered: 300000, i: 3 }),
    ];

    const fleet = buildFleetSummary(rows, 0);
    const a = fleet.merchants.find((m) => m.merchant_id === "mer_a")!;
    const b = fleet.merchants.find((m) => m.merchant_id === "mer_b")!;

    expect(a.total_records).toBe(3);
    expect(a.at_risk_paise).toBe(600000);
    expect(a.recovered_paise).toBe(100000);
    expect(a.interventions).toBe(2);
    expect(a.blocked).toBe(1);
    expect(a.attempts).toBe(3);
    expect(b.recovered_paise).toBe(300000);
  });

  it("computes totals as the sum across merchants", () => {
    const rows = [
      row({ merchant_id: "mer_a" }),
      row({ merchant_id: "mer_b", i: 1 }),
      row({ merchant_id: "mer_b", i: 2 }),
    ];
    const fleet = buildFleetSummary(rows, 0);
    expect(fleet.totals.merchants).toBe(2);
    expect(fleet.totals.records).toBe(3);
    expect(fleet.totals.recovered_paise).toBe(600000);
    expect(fleet.merchants[0].merchant_id).toBe("mer_b");
  });

  it("handles zero-recovery merchants without division errors", () => {
    const rows = [
      row({
        merchant_id: "mer_c",
        outcome: "skipped",
        amount_recovered: null,
        ground_truth: JSON.stringify({ recoverable_amount: 0 }),
      }),
    ];
    const fleet = buildFleetSummary(rows, 0);
    expect(fleet.merchants[0].recovery_rate).toBe(0);
    expect(fleet.totals.recovery_rate).toBe(0);
  });

  it("passes prevention count through to totals", () => {
    const fleet = buildFleetSummary([row({ merchant_id: "mer_a" })], 7);
    expect(fleet.totals.prevented_count).toBe(7);
  });
});

describe("fleet fairness check", () => {
  function fleetWithBlockRates(rates: [string, number][]): FleetRecordRow[] {
    const rows: FleetRecordRow[] = [];
    for (const [merchantId, rate] of rates) {
      const attempts = 10;
      const blockedCount = Math.round(rate * attempts);
      for (let i = 0; i < blockedCount; i++) {
        rows.push(
          row({ merchant_id: merchantId, outcome: "blocked", amount_recovered: null, i }),
        );
      }
      for (let i = blockedCount; i < attempts; i++) {
        rows.push(row({ merchant_id: merchantId, i: i + 100 }));
      }
    }
    return rows;
  }

  it("flags no merchant when all block rates are similar", () => {
    const fleet = buildFleetSummary(
      fleetWithBlockRates([
        ["mer_a", 0.1],
        ["mer_b", 0.1],
        ["mer_c", 0.2],
      ]),
      0,
    );
    expect(fleet.fairness_flags).toHaveLength(0);
  });

  it("flags merchants blocking at more than 2× the median rate", () => {
    const fleet = buildFleetSummary(
      fleetWithBlockRates([
        ["mer_a", 0.05],
        ["mer_b", 0.05],
        ["mer_c", 0.3],
      ]),
      0,
    );
    expect(fleet.fairness_flags).toHaveLength(1);
    expect(fleet.fairness_flags[0].merchant_id).toBe("mer_c");
    expect(fleet.fairness_flags[0].median_block_rate).toBeCloseTo(0.1, 5);
  });

  it("ignores merchants with too few attempts for statistical meaning", () => {
    const rows: FleetRecordRow[] = [
      ...fleetWithBlockRates([
        ["mer_a", 0.1],
        ["mer_b", 0.1],
      ]),
      row({ merchant_id: "mer_tiny", outcome: "blocked", amount_recovered: null }),
    ];
    const fleet = buildFleetSummary(rows, 0);
    expect(
      fleet.fairness_flags.find((f) => f.merchant_id === "mer_tiny"),
    ).toBeUndefined();
  });
});

describe("fleet ARR projection", () => {
  it("projects ₹-scale numbers for 10k merchants", () => {
    const rows = [
      row({ merchant_id: "mer_a", amount_recovered: 10000000 }),
      row({ merchant_id: "mer_b", amount_recovered: 10000000 }),
    ];
    const fleet = buildFleetSummary(rows, 0);
    expect(fleet.arr_projection.per_merchant_monthly_paise).toBe(10000000);
    expect(fleet.arr_projection.current_fleet_annual_paise).toBe(240000000);
    expect(fleet.arr_projection.scaled_10k_annual_paise).toBe(
      10000000 * 12 * 10000,
    );
  });
});
