import { auth } from "@/auth";
import { getRecordsWithOutcomes, getReportJson } from "@/lib/db/query";
import { buildFleetSummary } from "@/lib/fleet/aggregate";
import { MetricCard, PageHeader, EmptyState, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

interface ReportLike {
  prevention?: { prevented: number };
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatCr(paise: number): string {
  const cr = paise / 1_000_000_000;
  return `₹${cr.toFixed(2)} Cr`;
}

export default async function FleetPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const report = (await getReportJson(undefined, merchantIds)) as ReportLike | null;
  const rows = (await getRecordsWithOutcomes(merchantIds)).map((r) => ({
    merchant_id: r.merchant_id,
    type: r.type,
    amount: r.amount,
    ground_truth: r.ground_truth,
    outcome: r.outcome,
    amount_recovered: r.amount_recovered,
  }));
  const dataBadge = merchantIds?.length
    ? { label: "Live Data", variant: "connected" as const }
    : { label: "Demo Data", variant: "demo" as const };

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Multi-Merchant Fleet View" description="Recovery performance and guardrail fairness across the merchant fleet." badge={dataBadge} />
        <EmptyState message="No dataset. Run `npm run generate-data` first." />
      </>
    );
  }

  const fleet = buildFleetSummary(rows, report?.prevention?.prevented ?? 0);

  return (
    <>
      <PageHeader
        title="Multi-Merchant Fleet View"
        description="Per-merchant recovery economics with a cross-fleet guardrail fairness check: no merchant segment gets disproportionately blocked."
        badge={dataBadge}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Merchants" value={String(fleet.totals.merchants)} sub={`${fleet.totals.records} records`} />
        <MetricCard
          label="Fleet Recovered"
          value={formatInr(fleet.totals.recovered_paise)}
          sub={`of ${formatInr(fleet.totals.at_risk_paise)} at risk`}
          accent="text-emerald-400"
        />
        <MetricCard
          label="Fleet Recovery Rate"
          value={`${(fleet.totals.recovery_rate * 100).toFixed(1)}%`}
          sub="weighted across merchants"
        />
        <MetricCard
          label="Fairness Flags"
          value={String(fleet.fairness_flags.length)}
          sub={fleet.fairness_flags.length === 0 ? "all within 2× median block rate" : "review below"}
          accent={fleet.fairness_flags.length === 0 ? "text-emerald-400" : "text-amber-400"}
        />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Merchant Performance</h2>
        <Table headers={["Merchant", "Records", "At Risk", "Recovered", "Rate", "Attempts", "Block Rate"]}>
          {fleet.merchants.map((m) => (
            <tr key={m.merchant_id} className="text-zinc-300">
              <td className="px-4 py-2.5 font-mono text-xs">{m.merchant_id}</td>
              <td className="px-4 py-2.5 tabular-nums">{m.total_records}</td>
              <td className="px-4 py-2.5 tabular-nums">{formatInr(m.at_risk_paise)}</td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-400">
                {formatInr(m.recovered_paise)}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{(m.recovery_rate * 100).toFixed(1)}%</td>
              <td className="px-4 py-2.5 tabular-nums text-zinc-500">{m.attempts}</td>
              <td className={`px-4 py-2.5 tabular-nums ${m.block_rate > 0.1 ? "text-amber-400" : ""}`}>
                {(m.block_rate * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Guardrail Fairness Check</h2>
        {fleet.fairness_flags.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            ✓ No fairness violations: every merchant&#39;s block rate is within 2× the fleet median.
          </div>
        ) : (
          <div className="space-y-3">
            {fleet.fairness_flags.map((f) => (
              <div
                key={f.merchant_id}
                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
              >
                <span className="font-mono text-xs text-amber-400">{f.merchant_id}</span>{" "}
                has a block rate of{" "}
                <span className="font-bold tabular-nums">{(f.block_rate * 100).toFixed(1)}%</span>,{" "}
                {(f.block_rate / f.median_block_rate).toFixed(1)}× the fleet median (
                {(f.median_block_rate * 100).toFixed(1)}%). Guardrail tuning for this
                merchant should be reviewed before scaling.
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Per merchant / month</div>
          <div className="mt-2 text-xl font-bold tabular-nums">
            {formatInr(fleet.arr_projection.per_merchant_monthly_paise)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            Current fleet annualized ({fleet.totals.merchants} merchants)
          </div>
          <div className="mt-2 text-xl font-bold tabular-nums text-sky-400">
            {formatCr(fleet.arr_projection.current_fleet_annual_paise)}
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent p-5">
          <div className="text-xs uppercase tracking-wider text-sky-400">
            At 10,000-merchant scale (annual)
          </div>
          <div className="mt-2 text-xl font-bold tabular-nums text-sky-300">
            {formatCr(fleet.arr_projection.scaled_10k_annual_paise)}
          </div>
        </div>
      </section>

      <p className="mt-4 text-xs text-zinc-500">{fleet.assumption_text}</p>
    </>
  );
}
