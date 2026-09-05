import { auth } from "@/auth";
import { getPromiseRows } from "@/lib/db/query";
import { MetricCard, PageHeader, EmptyState, Table, formatInr } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  fulfilled: { label: "Fulfilled ✓", cls: "text-emerald-400" },
  pending: { label: "Pending ⏳", cls: "text-sky-400" },
  broken: { label: "Broken ✕", cls: "text-rose-400" },
  escalated: { label: "Escalated ⚠", cls: "text-fuchsia-400" },
  renewed: { label: "Renewed ↻", cls: "text-amber-400" },
};

const NOW = Date.now();

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - NOW) / (24 * 3600 * 1000));
}

export default async function PromisesPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const rows = await getPromiseRows(merchantIds);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Promise-to-Pay Tracker" description="Customer payment promises, tracked and enforced." />
        <EmptyState message="No promises in the dataset yet. Regenerate data via `npm run generate-data`." />
      </>
    );
  }

  const counts = rows.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  const fulfilledAmount = rows
    .filter((p) => p.status === "fulfilled")
    .reduce((s, p) => s + (p.fulfilled_amount ?? 0), 0);
  const fulfillmentRate = ((counts.fulfilled ?? 0) / rows.length) * 100;

  const upcoming = rows.filter((p) => p.status === "pending").slice(0, 8);
  const broken = rows.filter(
    (p) => p.status === "broken" || p.status === "escalated",
  );

  return (
    <>
      <PageHeader
        title="Promise-to-Pay Tracker"
        description="Turning informal commitments like 'I'll pay by Friday' into tracked, followable, escalatable revenue."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Promises Tracked" value={String(rows.length)} />
        <MetricCard
          label="Fulfillment Rate"
          value={`${fulfillmentRate.toFixed(1)}%`}
          sub={`${counts.fulfilled ?? 0} fulfilled`}
          accent={fulfillmentRate >= 65 ? "text-emerald-400" : "text-amber-400"}
        />
        <MetricCard label="Recovered via Promises" value={formatInr(fulfilledAmount)} accent="text-emerald-400" />
        <MetricCard
          label="Broken / Escalated"
          value={String((counts.broken ?? 0) + (counts.escalated ?? 0))}
          sub="requiring action"
          accent="text-rose-400"
        />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Upcoming Due Dates</h2>
        <Table headers={["Customer", "Record", "Amount", "Due", "Source", "Status"]}>
          {upcoming.map((p) => {
            const d = daysUntil(p.due_date);
            const dueLabel = d > 1 ? `in ${d} days` : d === 1 ? "tomorrow" : d === 0 ? "today" : `${Math.abs(d)}d overdue`;
            return (
              <tr key={p.promise_id} className="text-zinc-300">
                <td className="px-4 py-2.5">{p.customer_name ?? p.promise_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{p.record_id}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatInr(p.promised_amount)}</td>
                <td className={`px-4 py-2.5 tabular-nums ${d <= 0 ? "font-medium text-rose-400" : d <= 1 ? "text-amber-400" : ""}`}>
                  {dueLabel}
                </td>
                <td className="px-4 py-2.5 capitalize text-zinc-500">{p.promise_source}</td>
                <td className={`px-4 py-2.5 text-xs font-medium ${STATUS_STYLES[p.status]?.cls}`}>
                  {STATUS_STYLES[p.status]?.label ?? p.status}
                </td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Broken Promises Requiring Action</h2>
        {broken.length === 0 ? (
          <p className="text-sm text-zinc-500">No broken promises, all on track.</p>
        ) : (
          <Table headers={["Customer", "Record", "Amount", "Was Due", "Renewals", "Action"]}>
            {broken.map((p) => (
              <tr key={p.promise_id} className="text-zinc-300">
                <td className="px-4 py-2.5">{p.customer_name ?? p.promise_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{p.record_id}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatInr(p.promised_amount)}</td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {new Date(p.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </td>
                <td className={`px-4 py-2.5 tabular-nums ${p.renewal_count >= 2 ? "font-medium text-rose-400" : "text-zinc-400"}`}>
                  {p.renewal_count}
                  {p.renewal_count >= 2 && (
                    <span className="ml-2 rounded bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] text-fuchsia-400">
                      G1 limit
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-xs font-medium ${STATUS_STYLES[p.status]?.cls}`}>
                  {p.status === "escalated"
                    ? "Collections handoff"
                    : p.renewal_count >= 2
                      ? "Escalate: no more renewals"
                      : "Send firm notice"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="font-semibold">Lifecycle</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          {["OFFER", "PENDING", "FULFILLED"].map((s) => (
            <span key={s} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400">
              {s}
            </span>
          ))}
          <span className="text-zinc-600">·</span>
          {["PENDING → BROKEN → ESCALATED"].map((s) => (
            <span key={s} className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-400">
              {s}
            </span>
          ))}
          <span className="text-zinc-600">→ every transition audited</span>
        </div>
      </section>
    </>
  );
}
