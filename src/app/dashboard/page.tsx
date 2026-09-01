import Link from "next/link";
import { auth } from "@/auth";
import { getRecordsWithOutcomes, getReportJson } from "@/lib/db/query";
import { MetricCard, PageHeader, EmptyState, Table } from "@/components/ui";
import { LiveProcessing } from "@/components/live-processing";

export const dynamic = "force-dynamic";

interface Report {
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
  guardrails: { total_blocks: number; block_rate: number };
  operational: { total_records: number; records_intervened: number; records_skipped: number; records_escalated: number; records_blocked: number; records_prevented?: number };
  prevention?: { prevented: number; protected_amount_paise: number };
}

const PAGES = [
  { href: "/results", label: "Recovery Results", desc: "Hero metrics and category breakdown" },
  { href: "/timeline", label: "Decision Timeline", desc: "Every decision in processing order" },
  { href: "/guardrails", label: "Guardrail Report", desc: "Blocks by rule with reasons" },
  { href: "/exceptions", label: "Exception Report", desc: "What the agent couldn't handle — honestly" },
  { href: "/audit", label: "Full Audit Log", desc: "Searchable, filterable, exportable" },
];

export default async function DashboardPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const report = (await getReportJson()) as Report | null;
  const records = await getRecordsWithOutcomes(merchantIds);

  if (!report) {
    return (
      <>
        <PageHeader
          title="ReviveAI Control Center"
          description="Autonomous revenue recovery agent — detect → diagnose → intervene → measure."
        />
        <EmptyState message="No batch results yet. Run the batch from below or via `npm run run-batch`." />
        <div className="mt-6">
          <LiveProcessing totalRecords={records.length || 150} />
        </div>
      </>
    );
  }

  const op = report.operational;

  return (
    <>
      <PageHeader
        title="ReviveAI Control Center"
        description="Autonomous revenue recovery agent — detect → diagnose → intervene → measure."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Revenue Recovered"
          value={report.hero.recovered_display}
          sub={`from ${report.hero.at_risk_display} at risk`}
          accent="text-emerald-400"
        />
        <MetricCard
          label="Recovery Rate"
          value={`${report.hero.recovery_rate_pct}%`}
          sub="of at-risk revenue"
        />
        <MetricCard
          label="Net ROI"
          value={report.hero.roi_display}
          sub="recovered vs intervention cost"
          accent="text-sky-400"
        />
        <MetricCard
          label="Detection F1"
          value={String(report.accuracy.overall.f1 ?? "—")}
          sub={`precision ${report.accuracy.overall.precision ?? "—"} · recall ${report.accuracy.overall.recall ?? "—"}`}
          accent="text-violet-400"
        />
        {report.prevention && report.prevention.prevented > 0 && (
          <MetricCard
            label="Revenue Protected"
            value={`+₹${(report.prevention.protected_amount_paise / 100).toLocaleString("en-IN")}`}
            sub={`${report.prevention.prevented} churn-risk customers retained pre-failure`}
            accent="text-sky-300"
          />
        )}
      </div>

      <div className="mt-8">
        <LiveProcessing totalRecords={op.total_records} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Category Breakdown</h2>
        <Table headers={["Category", "At Risk", "Recovered", "Rate"]}>
          {report.recovery_by_category.map((c) => (
            <tr key={c.category} className="text-zinc-300">
              <td className="px-4 py-2.5 capitalize">{c.category.replace(/_/g, " ")}</td>
              <td className="px-4 py-2.5 tabular-nums">{`₹${(c.at_risk_paise / 100).toLocaleString("en-IN")}`}</td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-400">{`₹${(c.recovered_paise / 100).toLocaleString("en-IN")}`}</td>
              <td className="px-4 py-2.5 tabular-nums">
                {(c.recovery_rate * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Intervened" value={String(op.records_intervened)} accent="text-emerald-400" />
        <MetricCard label="Skipped" value={String(op.records_skipped)} />
        <MetricCard label="Escalated" value={String(op.records_escalated)} accent="text-amber-400" />
        <MetricCard label="Blocked" value={String(op.records_blocked)} accent="text-fuchsia-400" />
      </section>

      <section className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-emerald-500/40 hover:bg-zinc-900"
          >
            <div className="font-medium text-zinc-200 group-hover:text-emerald-400">{p.label}</div>
            <div className="mt-1 text-xs text-zinc-500">{p.desc}</div>
          </Link>
        ))}
      </section>

      <p className="mt-10 text-xs text-zinc-600">
        Dataset: {records.length || op.total_records} synthetic records · every metric is computed against ground truth labels, no cherry-picking.
      </p>
    </>
  );
}
