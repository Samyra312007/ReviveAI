import { getReportJson } from "@/lib/db/query";
import { MetricCard, PageHeader, EmptyState, Table, ProgressBar } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Report {
  hero: {
    recovered_display: string;
    at_risk_display: string;
    recovery_rate_pct: number;
    roi_display: string;
  };
  recovery: {
    at_risk_paise: number;
    recovered_paise: number;
    avg_time_to_recovery_hours: number | null;
    recoverable_records: number;
    recovered_records: number;
  };
  recovery_by_category: {
    category: string;
    at_risk_paise: number;
    recovered_paise: number;
    recovery_rate: number;
    recovered_records: number;
    recoverable_records: number;
  }[];
  accuracy: {
    overall: { category: string; tp: number; fp: number; tn: number; fn: number; precision: number | null; recall: number | null; f1: number | null };
    by_category: { category: string; tp: number; fp: number; tn: number; fn: number; precision: number | null; recall: number | null; f1: number | null }[];
    false_positive_rate: number;
  };
  cost_benefit: {
    intervention_cost_paise: number;
    net_recovered_paise: number;
    roi_multiple: number | null;
  };
}

export default function ResultsPage() {
  const report = getReportJson() as Report | null;

  if (!report) {
    return (
      <>
        <PageHeader title="Recovery Results" description="Measured money recovered across the batch." />
        <EmptyState message="No results yet. Run the batch via `npm run run-batch` or the Dashboard." />
      </>
    );
  }

  const r = report.recovery;

  return (
    <>
      <PageHeader
        title="Recovery Results"
        description="Honest measurement against ground truth — all 150 records accounted for, including failures."
      />

      <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-8">
        <div className="text-sm uppercase tracking-wider text-zinc-400">
          Total Recovered
        </div>
        <div className="mt-2 text-5xl font-bold tabular-nums text-emerald-400">
          {report.hero.recovered_display}
        </div>
        <div className="mt-2 text-lg text-zinc-300">
          of {report.hero.at_risk_display} at risk ·{" "}
          <span className="font-semibold text-white">{report.hero.recovery_rate_pct}%</span> recovery rate
        </div>
        <div className="mt-6 max-w-xl">
          <ProgressBar pct={report.hero.recovery_rate_pct} />
        </div>
      </div>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Records Recovered" value={`${r.recovered_records} / ${r.recoverable_records}`} sub="recoverable records" accent="text-emerald-400" />
        <MetricCard label="Avg Time to Recovery" value={r.avg_time_to_recovery_hours !== null ? `${r.avg_time_to_recovery_hours}h` : "—"} sub="for recovered records" />
        <MetricCard label="Intervention Cost" value={`₹${(report.cost_benefit.intervention_cost_paise / 100).toFixed(2)}`} sub="channels + API" />
        <MetricCard label="Net ROI" value={report.hero.roi_display} sub={`net ₹${(report.cost_benefit.net_recovered_paise / 100).toLocaleString("en-IN")}`} accent="text-sky-400" />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Recovery by Category</h2>
        <Table headers={["Category", "At Risk", "Recovered", "Rate", "Records"]}>
          {report.recovery_by_category.map((c) => (
            <tr key={c.category} className="text-zinc-300">
              <td className="px-4 py-2.5 capitalize">{c.category.replace(/_/g, " ")}</td>
              <td className="px-4 py-2.5 tabular-nums">{`₹${(c.at_risk_paise / 100).toLocaleString("en-IN")}`}</td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-400">{`₹${(c.recovered_paise / 100).toLocaleString("en-IN")}`}</td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{(c.recovery_rate * 100).toFixed(1)}%</span>
                  <div className="w-20"><ProgressBar pct={c.recovery_rate * 100} /></div>
                </div>
              </td>
              <td className="px-4 py-2.5 tabular-nums text-zinc-500">
                {c.recovered_records}/{c.recoverable_records}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Detection Accuracy vs Ground Truth</h2>
        <Table headers={["Category", "TP", "FP", "TN", "FN", "Precision", "Recall", "F1"]}>
          {[report.accuracy.overall, ...report.accuracy.by_category].map((a) => (
            <tr
              key={a.category}
              className={a.category === "overall" ? "bg-zinc-900/70 font-medium text-white" : "text-zinc-300"}
            >
              <td className="px-4 py-2.5 capitalize">{a.category === "overall" ? "Overall" : a.category.replace(/_/g, " ")}</td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-400">{a.tp}</td>
              <td className="px-4 py-2.5 tabular-nums text-rose-400">{a.fp}</td>
              <td className="px-4 py-2.5 tabular-nums">{a.tn}</td>
              <td className="px-4 py-2.5 tabular-nums text-amber-400">{a.fn}</td>
              <td className="px-4 py-2.5 tabular-nums">{a.precision ?? "—"}</td>
              <td className="px-4 py-2.5 tabular-nums">{a.recall ?? "—"}</td>
              <td className="px-4 py-2.5 tabular-nums">{a.f1 ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-zinc-500">
          False positive rate: {(report.accuracy.false_positive_rate * 100).toFixed(1)}% — interventions on healthy records are counted and shown.
        </p>
      </section>
    </>
  );
}
