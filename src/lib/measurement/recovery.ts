import { RecordDecision } from "@/lib/audit/logger";

export interface RecoveryTotals {
  at_risk_paise: number;
  recovered_paise: number;
  recovery_rate: number;
  avg_time_to_recovery_hours: number | null;
  recoverable_records: number;
  recovered_records: number;
}

export interface CategoryRecovery extends RecoveryTotals {
  category: string;
}

export function recoveryTotals(decisions: RecordDecision[]): RecoveryTotals {
  let atRisk = 0;
  let recovered = 0;
  let recoverableRecords = 0;
  let recoveredRecords = 0;
  let totalTime = 0;

  for (const d of decisions) {
    atRisk += d.record.ground_truth.recoverable_amount;
    recovered += d.amountRecovered;
    if (d.record.ground_truth.recoverable) recoverableRecords++;
    if (d.outcome === "recovered") {
      recoveredRecords++;
      totalTime += d.timeToRecoveryHours ?? 0;
    }
  }

  return {
    at_risk_paise: atRisk,
    recovered_paise: recovered,
    recovery_rate: atRisk > 0 ? Math.round((recovered / atRisk) * 1000) / 1000 : 0,
    avg_time_to_recovery_hours:
      recoveredRecords > 0 ? Math.round((totalTime / recoveredRecords) * 10) / 10 : null,
    recoverable_records: recoverableRecords,
    recovered_records: recoveredRecords,
  };
}

export function recoveryByCategory(
  decisions: RecordDecision[],
): CategoryRecovery[] {
  const categories = [
    ...new Set(decisions.map((d) => d.record.type)),
  ];
  return categories
    .map((category) => ({
      category,
      ...recoveryTotals(decisions.filter((d) => d.record.type === category)),
    }))
    .sort((a, b) => b.recovered_paise - a.recovered_paise);
}
