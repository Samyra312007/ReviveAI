import { auth } from "@/auth";
import { getCouncilState } from "@/lib/db/query";
import { PageHeader, Table, EmptyState } from "@/components/ui";
import { CouncilInbox } from "@/components/council-inbox";

export const dynamic = "force-dynamic";

interface CouncilProposal {
  proposal_id: string;
  rule_id: string;
  parameter: string;
  current_display: string;
  proposed_display: string;
  rationale: string;
  blocked_count: number;
  blocked_recoverable_paise: number;
  avg_recovery_probability: number;
  status: string;
  created_at: string;
  decided_at: string | null;
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const PARAM_LABELS: Record<string, string> = {
  checkoutNudgeWindowHours: "Checkout nudge window",
  approvalThresholdPaise: "Approval threshold",
  dailyVolumeCapPaise: "Daily volume cap",
  maxRetriesPerRecord: "Retries per record",
  cooldownHours: "Cooldown period",
};

export default async function CouncilPage() {
  const { proposals, overrides } = await getCouncilState();
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending");

  return (
    <>
      <PageHeader
        title="Guardrail Tuning Council"
        description="The agent audits its own guardrail blocks after every run and proposes adjustments where it believes safety rules are too tight. A human approves or rejects — the agent cannot change its own boundaries. Approved overrides apply from the next batch run and are fully audited."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-400">Pending review</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{pending.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Active overrides</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-400">
            {overrides.length}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Decisions logged</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{decided.length}</div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Human Approval Inbox</h2>
        <CouncilInbox proposals={pending} />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Active Overrides</h2>
        {overrides.length === 0 ? (
          <EmptyState message="No active overrides. The agent is running on default guardrails." />
        ) : (
          <Table headers={["Parameter", "Value", "Origin rule", "Approved"]}>
            {overrides.map((o) => (
              <tr key={o.parameter} className="text-zinc-300">
                <td className="px-4 py-2.5">{PARAM_LABELS[o.parameter] ?? o.parameter}</td>
                <td className="px-4 py-2.5 tabular-nums text-emerald-400">
                  {o.parameter.endsWith("Paise") || o.parameter.includes("Paise")
                    ? formatInr(o.value)
                    : o.value}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">[{o.rule_source}]</td>
                <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{o.approved_at}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Decision History</h2>
        {decided.length === 0 ? (
          <p className="text-sm text-zinc-500">No decisions yet.</p>
        ) : (
          <Table headers={["Rule", "Change", "Decision", "When"]}>
            {decided.map((p) => {
              const typed = p as CouncilProposal;
              return (
                <tr key={typed.proposal_id} className="text-zinc-300">
                  <td className="px-4 py-2.5 font-mono text-xs">[{typed.rule_id}]</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className="text-zinc-500 line-through">{typed.current_display}</span>
                    {" → "}
                    <span className={typed.status === "approved" ? "text-emerald-400" : "text-zinc-400"}>
                      {typed.proposed_display}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-xs font-semibold capitalize ${typed.status === "approved" ? "text-emerald-400" : "text-rose-400"}`}>
                    {typed.status}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{typed.decided_at}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>

      <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="font-semibold">How governance works here</h3>
        <ol className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
          <li>After each batch, the council analyzes every guardrail block against ground-truth recovery likelihood</li>
          <li>Only rules that blocked ≥3 records with &gt;50% average recovery probability generate a proposal</li>
          <li>Proposals sit in this inbox until a human decides — the agent has no self-service path</li>
          <li>Approved values become active overrides for the next run; every decision is timestamped</li>
          <li>Rejecting is always safe: defaults stay in force until explicitly changed</li>
        </ol>
      </section>
    </>
  );
}
