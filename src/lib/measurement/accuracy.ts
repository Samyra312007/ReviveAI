import { RecordDecision } from "@/lib/audit/logger";

export interface CategoryAccuracy {
  category: string;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface AccuracyReport {
  overall: CategoryAccuracy;
  by_category: CategoryAccuracy[];
  false_positive_rate: number;
}

interface Counts {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

function emptyCounts(): Counts {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

export function computeAccuracy(
  decisions: RecordDecision[],
): AccuracyReport {
  const overall = emptyCounts();
  const perCategory = new Map<string, Counts>();

  for (const d of decisions) {
    const record = d.record;
    const gtRecoverable = record.ground_truth.recoverable;
    const isControl = record.type === "control";
    const intervened = ["recovered", "failed"].includes(d.outcome);

    const counts = perCategory.get(record.type) ?? emptyCounts();
    if (!perCategory.has(record.type)) perCategory.set(record.type, counts);

    if (isControl) {
      if (intervened) {
        counts.fp++;
        overall.fp++;
      } else {
        counts.tn++;
        overall.tn++;
      }
      continue;
    }

    if (gtRecoverable && intervened) {
      counts.tp++;
      overall.tp++;
    } else if (gtRecoverable && !intervened && d.outcome !== "escalated") {
      counts.fn++;
      overall.fn++;
    } else if (gtRecoverable && d.outcome === "escalated") {
      counts.tp++;
      overall.tp++;
    } else if (!gtRecoverable && intervened) {
      counts.fp++;
      overall.fp++;
    } else {
      counts.tn++;
      overall.tn++;
    }
  }

  const rates = (c: Counts) => ({
    precision: c.tp + c.fp > 0 ? round3(c.tp / (c.tp + c.fp)) : null,
    recall: c.tp + c.fn > 0 ? round3(c.tp / (c.tp + c.fn)) : null,
  });

  const toCategory = (category: string, c: Counts): CategoryAccuracy => ({
    category,
    ...c,
    ...rates(c),
    f1:
      rates(c).precision !== null && rates(c).recall !== null
        ? round3(
            (2 * (rates(c).precision! * rates(c).recall!)) /
              (rates(c).precision! + rates(c).recall!),
          )
        : null,
  });

  return {
    overall: toCategory("overall", overall),
    by_category: [...perCategory.entries()].map(([cat, c]) => toCategory(cat, c)),
    false_positive_rate:
      overall.fp + overall.tn > 0 ? round3(overall.fp / (overall.fp + overall.tn)) : 0,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
