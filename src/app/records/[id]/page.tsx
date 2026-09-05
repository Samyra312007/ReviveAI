import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getRecordsWithOutcomes, getAuditRows } from "@/lib/db/query";
import { PageHeader, OutcomeBadge, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;

  const records = await getRecordsWithOutcomes(merchantIds);
  const record = records.find((r) => r.record_id === id);
  if (!record) notFound();

  const auditRows = (await getAuditRows(merchantIds)).filter(
    (a) => a.record_id === id,
  );
  const latestAudit = auditRows[auditRows.length - 1] ?? null;

  let groundTruth: Record<string, unknown> | null = null;
  try {
    groundTruth = JSON.parse(record.ground_truth);
  } catch {
    groundTruth = null;
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/records"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-300 shadow-clay-sm transition hover:border-emerald-500/50 hover:text-emerald-400"
        >
          <span aria-hidden>←</span> Back to Records
        </Link>
      </div>
      <PageHeader
        title={record.record_id}
        description={`${record.customer_name} · ${record.type.replace(/_/g, " ")} · ${record.subcategory.replace(/_/g, " ")}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-base font-semibold">Record</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ["Amount", `₹${(record.amount / 100).toLocaleString("en-IN")}`],
              ["Customer segment", record.customer_segment],
              ["Failure reason", record.failure_reason],
              ["Failure time", new Date(record.failure_timestamp).toLocaleString()],
              ["Merchant", record.merchant_id],
              ["Customer", record.customer_id],
            ].map(([k, v]) => (
              <div key={k} className={k === "Failure reason" ? "col-span-2" : ""}>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">{k}</dt>
                <dd className="mt-0.5 text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-base font-semibold">Latest decision</h2>
          {latestAudit ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Outcome</dt>
                <OutcomeBadge outcome={latestAudit.outcome} />
              </div>
              {[
                ["Category", latestAudit.detected_category],
                ["Strategy", latestAudit.selected_strategy],
                ["Confidence", latestAudit.detection_confidence?.toFixed(3)],
                ["Recovered", latestAudit.amount_recovered ? `₹${(latestAudit.amount_recovered / 100).toLocaleString("en-IN")}` : "-"],
                ["Run", latestAudit.run_id],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4">
                  <dt className="shrink-0 text-xs uppercase tracking-wider text-zinc-500">{k}</dt>
                  <dd className="truncate text-right text-zinc-200">{v ?? "-"}</dd>
                </div>
              ))}
              {latestAudit.decision_reasoning && (
                <p className="rounded-xl bg-clay-200/80 p-3 text-xs leading-relaxed text-zinc-400 shadow-clay-inset">
                  {latestAudit.decision_reasoning}
                </p>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Not processed yet. Run a batch to get a decision for this record.
            </p>
          )}
        </section>
      </div>

      {groundTruth && (
        <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-base font-semibold">Ground truth</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            {Object.entries(groundTruth).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">
                  {k.replace(/_/g, " ")}
                </dt>
                <dd className="mt-0.5 text-zinc-200">{typeof v === "number" ? v.toLocaleString() : String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Audit history</h2>
        {auditRows.length > 0 ? (
          <Table headers={["Time", "Run", "Outcome", "Strategy", "Amount"]}>
            {auditRows.map((a) => (
              <tr key={a.id} className="text-zinc-300">
                <td className="px-4 py-2.5">{new Date(a.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.run_id ?? "-"}</td>
                <td className="px-4 py-2.5"><OutcomeBadge outcome={a.outcome} /></td>
                <td className="px-4 py-2.5">{a.selected_strategy ?? "-"}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {a.amount_recovered ? `₹${(a.amount_recovered / 100).toLocaleString("en-IN")}` : "-"}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-zinc-500">No audit entries yet.</p>
        )}
      </section>

      <p className="mt-8 text-sm">
        <Link href="/results" className="text-emerald-400 hover:underline">
          ← Back to results
        </Link>
      </p>
    </>
  );
}