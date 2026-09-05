import { auth } from "@/auth";
import { getAuditRows, getReportJson } from "@/lib/db/query";
import { MetricCard, PageHeader, EmptyState, Table, ProgressBar } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Report {
  guardrails: { total_blocks: number; block_rate: number; blocks_by_rule: Record<string, number> };
}

const RULE_DESCRIPTIONS: Record<string, string> = {
  A1: "Max retries per record = 2",
  A2: "Max retries per customer per day = 3",
  A3: "Max total interventions in batch = 80%",
  B1: "No interventions 21:00–08:00 IST",
  B2: "Min 4 hours between retries to same customer",
  B3: "Checkout nudge window = max 2 hours",
  B4: "Subscription retry window = max 7 days",
  C1: "Max 1 SMS per customer per day",
  C2: "Respect DND preferences",
  C3: "No intervention on fraud-flagged accounts",
  C4: "Amount > ₹50,000 requires manual approval",
  D1: "Max single intervention amount = ₹50,000",
  D2: "Max daily recovery attempt volume = ₹5,00,000",
  D3: "Auto-skip if recovery cost > 30% of amount",
  F1: "Max 1 voice call per customer per week",
  F2: "No voice calls before 09:00 / after 20:00 IST",
  F3: "Max 3 voice attempts before switching to text",
  F4: "Respect voice opt-in, never force",
  G1: "Max 2 promise renewals per record",
};

interface GuardrailCheck {
  rule_id: string;
  rule_description: string;
  passed: boolean;
  block_reason?: string;
}

export default async function GuardrailsPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const report = (await getReportJson()) as Report | null;

  if (!report) {
    return (
      <>
        <PageHeader title="Guardrail Report" description="Safety rules that bound the agent's actions." />
        <EmptyState message="No results yet. Run the batch via `npm run run-batch`." />
      </>
    );
  }

  const allRows = await getAuditRows(merchantIds);
  const blockedRows = allRows.filter((r) => r.outcome === "blocked");
  const byRule = report.guardrails.blocks_by_rule;
  const maxRuleCount = Math.max(1, ...Object.values(byRule));
  const totalChecks = allRows.reduce((sum, r) => {
    if (!r.guardrail_checks) return sum;
    const checks = Array.isArray(r.guardrail_checks)
      ? r.guardrail_checks
      : [];
    return sum + checks.length;
  }, 0);
  const totalPassed = totalChecks - Object.values(byRule).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Guardrail Report"
        description={`The agent ran ${totalChecks.toLocaleString("en-IN")} guardrail checks. ${totalPassed.toLocaleString("en-IN")} passed, ${Object.values(byRule).reduce((a, b) => a + b, 0)} fired.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Interventions Blocked" value={String(report.guardrails.total_blocks)} sub={`${report.guardrails.block_rate}% of batch`} accent="text-fuchsia-400" />
        <MetricCard label="Block Rate" value={`${report.guardrails.block_rate}%`} sub="target < 10%" accent={report.guardrails.block_rate < 10 ? "text-emerald-400" : "text-amber-400"} />
        <MetricCard label="Rules Enforced" value="19" sub="categories A–G" />
      </div>

      <section className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold">Blocks by Rule</h2>
          {Object.keys(byRule).length === 0 ? (
            <p className="text-sm text-zinc-500">No blocks in the latest run.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byRule)
                .sort(([, a], [, b]) => b - a)
                .map(([rule, count]) => (
                  <div key={rule}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-300">
                        [{rule}] {RULE_DESCRIPTIONS[rule] ?? ""}
                      </span>
                      <span className="tabular-nums text-zinc-500">{count}</span>
                    </div>
                    <ProgressBar pct={(count / maxRuleCount) * 100} color="bg-fuchsia-500" />
                  </div>
                ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Rule Reference</h2>
          <ul className="max-h-96 space-y-1 overflow-auto rounded-xl border border-zinc-800 p-4 text-xs text-zinc-400">
            {Object.entries(RULE_DESCRIPTIONS).map(([id, desc]) => (
              <li key={id} className="flex gap-2">
                <span className="w-8 shrink-0 font-mono text-zinc-500">{id}</span>
                {desc}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Blocked Records</h2>
        {blockedRows.length === 0 ? (
          <p className="text-sm text-zinc-500">None in the latest run.</p>
        ) : (
          <Table headers={["Record", "Category", "Strategy Attempted", "Blocked By", "Reason"]}>
            {blockedRows.map((row) => {
              const checks = Array.isArray(row.guardrail_checks)
                ? (row.guardrail_checks as GuardrailCheck[])
                : [];
              const failed = checks.filter((c) => !c.passed);
              return (
                <tr key={row.id} className="text-zinc-300">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.record_id}</td>
                  <td className="px-4 py-2.5 capitalize text-zinc-400">
                    {row.detected_category?.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-sky-400">
                      {row.selected_strategy}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fuchsia-400">
                    {failed.map((f) => f.rule_id).join(", ")}
                  </td>
                  <td className="px-4 py-2.5 max-w-md truncate text-xs text-zinc-400">
                    {failed.map((f) => f.block_reason).join("; ")}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </>
  );
}
