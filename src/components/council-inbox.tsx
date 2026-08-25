"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Proposal {
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
}

export function CouncilInbox({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(proposalId: string, decision: "approved" | "rejected") {
    setPending(proposalId);
    setMessage(null);
    try {
      const res = await fetch("/api/council/decide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-token":
            process.env.NEXT_PUBLIC_BATCH_TOKEN ?? "reviveai-demo-token",
        },
        body: JSON.stringify({ proposal_id: proposalId, decision }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessage(data.error ?? "Decision failed");
      } else {
        setMessage(data.note);
        router.refresh();
      }
    } catch {
      setMessage("Network error");
    } finally {
      setPending(null);
    }
  }

  if (proposals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        No pending proposals. The council reviews guardrail blocks after every batch run.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {proposals.map((p) => (
        <div
          key={p.proposal_id}
          className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-amber-400">
                  [{p.rule_id}]
                </span>
                <span className="text-sm text-zinc-400">adjustment requested</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="text-zinc-500 line-through">{p.current_display}</span>
                <span className="text-zinc-600">→</span>
                <span className="text-emerald-400">{p.proposed_display}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decide(p.proposal_id, "rejected")}
                disabled={pending === p.proposal_id}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => decide(p.proposal_id, "approved")}
                disabled={pending === p.proposal_id}
                className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {pending === p.proposal_id ? "…" : "Approve"}
              </button>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{p.rationale}</p>

          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-zinc-800 pt-3 text-xs">
            <div>
              <span className="text-zinc-500">Records blocked</span>
              <div className="font-semibold tabular-nums text-white">{p.blocked_count}</div>
            </div>
            <div>
              <span className="text-zinc-500">Money at stake</span>
              <div className="font-semibold tabular-nums text-white">
                ₹{(p.blocked_recoverable_paise / 100).toLocaleString("en-IN")}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Avg recovery probability</span>
              <div className="font-semibold tabular-nums text-white">
                {(p.avg_recovery_probability * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      ))}

      {message && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-300">
          {message}
        </div>
      )}
    </div>
  );
}
