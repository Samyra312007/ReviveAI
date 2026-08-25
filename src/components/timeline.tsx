"use client";

import { useState } from "react";
import { OutcomeBadge } from "./ui";

interface AuditEntry {
  id: number;
  timestamp: string;
  record_id: string;
  customer_id: string;
  detected_category: string | null;
  detected_subcategory: string | null;
  detection_confidence: number | null;
  selected_strategy: string | null;
  decision_reasoning: string | null;
  guardrail_checks: string | null;
  action_taken: string | null;
  api_call: string | null;
  outcome: string;
  amount_recovered: number | null;
  time_to_recovery_hours: number | null;
  error: string | null;
}

const DOT_COLORS: Record<string, string> = {
  recovered: "bg-emerald-500",
  failed: "bg-rose-500",
  escalated: "bg-amber-500",
  skipped: "bg-zinc-600",
  blocked: "bg-fuchsia-500",
};

export function Timeline({
  entries,
  conversationMap = {},
}: {
  entries: AuditEntry[];
  conversationMap?: Record<
    string,
    { turns: { speaker: string; text: string }[]; intent: string | null; resolution: string }
  >;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  if (entries.length === 0)
    return <p className="text-sm text-zinc-500">No decisions yet — run the batch first.</p>;

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.outcome === filter);

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        {["all", "recovered", "failed", "escalated", "skipped", "blocked"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {f} {f !== "all" && `(${entries.filter((e) => e.outcome === f).length})`}
          </button>
        ))}
      </div>

      <div className="relative space-y-1 border-l border-zinc-800 pl-6">
        {visible.map((e) => (
          <div key={e.id} className="relative">
            <span
              className={`absolute -left-[31px] top-4 h-3 w-3 rounded-full ring-4 ring-zinc-950 ${DOT_COLORS[e.outcome] ?? DOT_COLORS.skipped}`}
            />
            <button
              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
              className="w-full rounded-lg border border-transparent p-3 text-left transition hover:border-zinc-800 hover:bg-zinc-900/50"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-zinc-500">{e.record_id}</span>
                <OutcomeBadge outcome={e.outcome} />
                <span className="text-sm text-zinc-300">
                  {e.detected_category?.replace(/_/g, " ")} /{" "}
                  {e.detected_subcategory?.replace(/_/g, " ")}
                </span>
                {e.selected_strategy && (
                  <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-sky-400">
                    {e.selected_strategy}
                  </span>
                )}
                {e.amount_recovered ? (
                  <span className="text-sm font-medium tabular-nums text-emerald-400">
                    +₹{(e.amount_recovered / 100).toLocaleString("en-IN")}
                    {e.time_to_recovery_hours !== null && (
                      <span className="ml-1 text-xs font-normal text-zinc-500">
                        in {e.time_to_recovery_hours}h
                      </span>
                    )}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                {e.decision_reasoning ?? "—"}
              </p>
            </button>

            {expanded === e.id && (
              <div className="mb-3 ml-2 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 text-xs">
                <div>
                  <h4 className="font-semibold text-zinc-300">Detection</h4>
                  <p className="mt-1 text-zinc-400">
                    Confidence:{" "}
                    <span className="tabular-nums">
                      {e.detection_confidence !== null
                        ? `${Math.round(e.detection_confidence * 100)}%`
                        : "—"}
                    </span>{" "}
                    · Category: {e.detected_category}/{e.detected_subcategory}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-zinc-300">Decision</h4>
                  <p className="mt-1 text-zinc-400">{e.decision_reasoning}</p>
                </div>
                {e.guardrail_checks && (
                  <div>
                    <h4 className="font-semibold text-zinc-300">Guardrail checks</h4>
                    <ul className="mt-1 space-y-0.5">
                      {(JSON.parse(e.guardrail_checks) as { rule_id: string; passed: boolean; block_reason?: string }[]).map(
                        (c, i) => (
                          <li key={i} className={c.passed ? "text-zinc-500" : "text-fuchsia-400"}>
                            {c.passed ? "✓" : "✕"} [{c.rule_id}]{" "}
                            {c.block_reason ?? "passed"}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {e.api_call && (
                  <div>
                    <h4 className="font-semibold text-zinc-300">API call</h4>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10px] text-zinc-400">
                      {JSON.stringify(JSON.parse(e.api_call), null, 2)}
                    </pre>
                  </div>
                )}
                {conversationMap[e.record_id] && (
                  <div>
                    <h4 className="font-semibold text-zinc-300">
                      Customer conversation{" "}
                      <span className="ml-1 rounded bg-sky-500/15 px-1.5 py-0.5 font-normal text-sky-400">
                        {conversationMap[e.record_id].resolution.replace(/_/g, " ")}
                      </span>
                    </h4>
                    <div className="mt-2 space-y-1.5">
                      {conversationMap[e.record_id].turns.map((t, i) => (
                        <div
                          key={i}
                          className={`max-w-[85%] rounded-lg px-3 py-1.5 ${
                            t.speaker === "customer"
                              ? "mr-auto bg-zinc-800 text-zinc-300"
                              : "ml-auto bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                            {t.speaker}
                          </div>
                          {t.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {e.error && (
                  <div>
                    <h4 className="font-semibold text-rose-400">Error</h4>
                    <pre className="mt-1 rounded bg-zinc-950 p-2 font-mono text-[10px] text-rose-300">
                      {JSON.stringify(JSON.parse(e.error), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
