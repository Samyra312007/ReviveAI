import Link from "next/link";
import { auth } from "@/auth";
import { getAuditRows, getReportJson } from "@/lib/db/query";
import { MetricCard, PageHeader, EmptyState, Table, OutcomeBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Report {
  exceptions: {
    record_id: string;
    type: string;
    reason: string;
    outcome: string;
  }[];
}

export default async function ExceptionsPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const report = (await getReportJson()) as Report | null;

  if (!report) {
    return (
      <>
        <PageHeader title="Exception Report" description="Records the agent couldn't handle — and exactly why." />
        <EmptyState message="No results yet. Run the batch via `npm run run-batch`." />
      </>
    );
  }

  const rows = await getAuditRows(merchantIds);
  const byOutcome = report.exceptions.reduce<Record<string, number>>((acc, e) => {
    acc[e.outcome] = (acc[e.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Exception Report"
        description="Honest reporting: these records were skipped, escalated, or blocked — with the exact reason. No cherry-picking."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Exceptions" value={String(report.exceptions.length)} sub={`of ${rows.length} total records`} accent="text-amber-400" />
        <MetricCard label="Escalated" value={String(byOutcome.escalated ?? 0)} sub="need manual review" accent="text-amber-400" />
        <MetricCard label="Skipped / Blocked" value={String((byOutcome.skipped ?? 0) + (byOutcome.blocked ?? 0))} sub="low confidence or guardrails" />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">All Exceptions</h2>
        {report.exceptions.length === 0 ? (
          <p className="text-sm text-zinc-500">No exceptions — every record was handled.</p>
        ) : (
          <Table headers={["Record", "Type", "Outcome", "Reason", ""]}>
            {report.exceptions.map((e) => (
              <tr key={e.record_id} className="text-zinc-300">
                <td className="px-4 py-2.5 font-mono text-xs">{e.record_id}</td>
                <td className="px-4 py-2.5 capitalize text-zinc-400">{e.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2.5"><OutcomeBadge outcome={e.outcome} /></td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">{e.reason}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/audit?record_id=${e.record_id}`}
                    className="text-xs font-medium text-emerald-400 hover:underline"
                  >
                    Inspect →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="font-semibold">Why exceptions are a feature</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
          <li>Low-confidence detections (&lt; 0.4) are skipped rather than guessed</li>
          <li>Fraud-flagged accounts are never auto-intervened</li>
          <li>Amounts above ₹50,000 always require human approval</li>
          <li>API failures skip gracefully instead of corrupting the batch</li>
          <li>Every exception is auditable and reversible by a human</li>
        </ul>
      </section>
    </>
  );
}
