export interface FleetRecordRow {
  merchant_id: string;
  type: string;
  amount: number;
  ground_truth: string;
  outcome: string | null;
  amount_recovered: number | null;
}

export interface MerchantFleetRow {
  merchant_id: string;
  total_records: number;
  at_risk_paise: number;
  recovered_paise: number;
  recovery_rate: number;
  interventions: number;
  escalated: number;
  blocked: number;
  attempts: number;
  block_rate: number;
}

export interface FairnessFlag {
  merchant_id: string;
  block_rate: number;
  median_block_rate: number;
}

export interface ArrProjection {
  per_merchant_monthly_paise: number;
  current_fleet_annual_paise: number;
  scaled_10k_annual_paise: number;
}

export interface FleetSummary {
  merchants: MerchantFleetRow[];
  totals: {
    merchants: number;
    records: number;
    at_risk_paise: number;
    recovered_paise: number;
    recovery_rate: number;
    prevented_count: number;
  };
  fairness_flags: FairnessFlag[];
  arr_projection: ArrProjection;
  assumption_text: string;
}

const MIN_ATTEMPTS_FOR_FAIRNESS = 5;
const FAIRNESS_MULTIPLIER = 2;
const SCALED_MERCHANT_COUNT = 10_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function buildFleetSummary(
  rows: FleetRecordRow[],
  preventedCount: number,
): FleetSummary {
  const byMerchant = new Map<string, MerchantFleetRow>();

  for (const row of rows) {
    let m = byMerchant.get(row.merchant_id);
    if (!m) {
      m = {
        merchant_id: row.merchant_id,
        total_records: 0,
        at_risk_paise: 0,
        recovered_paise: 0,
        recovery_rate: 0,
        interventions: 0,
        escalated: 0,
        blocked: 0,
        attempts: 0,
        block_rate: 0,
      };
      byMerchant.set(row.merchant_id, m);
    }

    m.total_records++;
    let recoverable = 0;
    try {
      recoverable = JSON.parse(row.ground_truth).recoverable_amount ?? 0;
    } catch {
      recoverable = 0;
    }
    m.at_risk_paise += recoverable;
    m.recovered_paise +=
      row.outcome === "recovered" ? (row.amount_recovered ?? 0) : 0;

    if (row.outcome === "recovered" || row.outcome === "failed") m.interventions++;
    else if (row.outcome === "escalated") m.escalated++;
    else if (row.outcome === "blocked") m.blocked++;
  }

  const merchants = [...byMerchant.values()].map((m) => {
    m.attempts = m.interventions + m.escalated + m.blocked;
    m.recovery_rate =
      m.at_risk_paise > 0
        ? Math.round((m.recovered_paise / m.at_risk_paise) * 1000) / 1000
        : 0;
    m.block_rate =
      m.attempts > 0 ? Math.round((m.blocked / m.attempts) * 1000) / 1000 : 0;
    return m;
  });

  const eligible = merchants.filter(
    (m) => m.attempts >= MIN_ATTEMPTS_FOR_FAIRNESS,
  );
  const medianBlockRate = median(eligible.map((m) => m.block_rate));
  const fairness_flags = eligible
    .filter(
      (m) =>
        medianBlockRate > 0 &&
        m.block_rate > medianBlockRate * FAIRNESS_MULTIPLIER,
    )
    .map((m) => ({
      merchant_id: m.merchant_id,
      block_rate: m.block_rate,
      median_block_rate: medianBlockRate,
    }));

  const totals = {
    merchants: merchants.length,
    records: rows.length,
    at_risk_paise: merchants.reduce((s, m) => s + m.at_risk_paise, 0),
    recovered_paise: merchants.reduce((s, m) => s + m.recovered_paise, 0),
    recovery_rate: 0,
    prevented_count: preventedCount,
  };
  totals.recovery_rate =
    totals.at_risk_paise > 0
      ? Math.round((totals.recovered_paise / totals.at_risk_paise) * 1000) / 1000
      : 0;

  const perMerchantMonthly =
    merchants.length > 0
      ? Math.round(totals.recovered_paise / merchants.length)
      : 0;

  return {
    merchants: merchants.sort((a, b) => b.recovered_paise - a.recovered_paise),
    totals,
    fairness_flags,
    arr_projection: {
      per_merchant_monthly_paise: perMerchantMonthly,
      current_fleet_annual_paise: totals.recovered_paise * 12,
      scaled_10k_annual_paise: perMerchantMonthly * 12 * SCALED_MERCHANT_COUNT,
    },
    assumption_text:
      "Assumes the batch represents ~30 days of revenue-leak events and linear scaling; illustrative sizing, not a forecast.",
  };
}
