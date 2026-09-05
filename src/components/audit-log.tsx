"use client";

import { Fragment, useMemo, useState } from "react";
import { OutcomeBadge } from "./ui";
import { buildCsv } from "@/lib/csv";
import { safeJsonParse } from "@/lib/db/json";

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

export function AuditLog({
  entries,
  initialQuery = "",
}: {
  entries: AuditEntry[];
  initialQuery?: string;
}) {
  const [outcome, setOutcome] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState<number | null>(null);

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.detected_category).filter(Boolean))],
    [entries],
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (outcome !== "all" && e.outcome !== outcome) return false;
      if (category !== "all" && e.detected_category !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = [
          e.record_id,
          e.customer_id,
          e.detected_subcategory,
          e.selected_strategy,
          e.decision_reasoning,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, outcome, category, query]);

  function exportCsv() {
    const headers = [
      "timestamp", "record_id", "customer_id", "detected_category",
      "detected_subcategory", "detection_confidence", "selected_strategy",
      "action_taken", "outcome", "amount_recovered_paise",
      "time_to_recovery_hours", "decision_reasoning",
    ];
    const rows = filtered.map((e) => [
      e.timestamp,
      e.record_id,
      e.customer_id,
      e.detected_category ?? "",
      e.detected_subcategory ?? "",
      e.detection_confidence ?? "",
      e.selected_strategy ?? "",
      e.action_taken ?? "",
      e.outcome,
      e.amount_recovered ?? "",
      e.time_to_recovery_hours ?? "",
      e.decision_reasoning ?? "",
    ]);
    const blob = new Blob([buildCsv(headers, rows)], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reviveai-audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (entries.length === 0)
    return <p className="text-sm text-zinc-500">No audit entries yet, run the batch first.</p>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search record, customer, strategy…"
          className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none placeholder:text-zinc-600 focus:border-emerald-500/50"
        />
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm capitalize outline-none"
        >
          {["all", "recovered", "failed", "escalated", "skipped", "blocked"].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm capitalize outline-none"
        >
          <option value="all">all categories</option>
          {categories.map((c) => (
            <option key={c} value={c!}>{c!.replace(/_/g, " ")}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          {filtered.length} / {entries.length} entries
        </span>
        <button
          onClick={exportCsv}
          className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-400"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              {["Record", "Category", "Strategy", "Outcome", "Amount", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filtered.slice(0, 200).map((e) => (
              <Fragment key={e.id}>
                <tr className="text-zinc-300 hover:bg-zinc-900/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{e.record_id}</td>
                  <td className="px-4 py-2.5 capitalize text-xs">
                    {e.detected_category?.replace(/_/g, " ")}/
                    {e.detected_subcategory?.replace(/_/g, " ")}
                    {e.detection_confidence !== null && (
                      <span className="ml-1 text-zinc-600">
                        ({Math.round(e.detection_confidence * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-sky-400">
                      {e.action_taken ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><OutcomeBadge outcome={e.outcome} /></td>
                  <td className="px-4 py-2.5 tabular-nums text-emerald-400">
                    {e.amount_recovered ? `₹${(e.amount_recovered / 100).toLocaleString("en-IN")}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      className="text-xs text-emerald-400 hover:underline"
                    >
                      {expanded === e.id ? "Hide" : "Detail"}
                    </button>
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr className="bg-zinc-900/70">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="space-y-2 text-xs">
                          <div><span className="text-zinc-500">Customer:</span> <span className="font-mono">{e.customer_id}</span></div>
                          <div><span className="text-zinc-500">Timestamp:</span> <span className="font-mono">{e.timestamp}</span></div>
                          <div><span className="text-zinc-500">Reasoning:</span> {e.decision_reasoning}</div>
                          {e.guardrail_checks && (
                            <ul className="space-y-0.5">
                              {(safeJsonParse<{ rule_id: string; passed: boolean; block_reason?: string }[]>(e.guardrail_checks, [])).filter(c => !c.passed).map(
                                (c, i) => (
                                  <li key={i} className="text-fuchsia-400">
                                    ✕ [{c.rule_id}] {c.block_reason}
                                  </li>
                                ),
                              )}
                            </ul>
                          )}
                          {e.error && (
                            <pre className="overflow-auto rounded-lg bg-clay-200/80 p-2 font-mono text-[10px] text-rose-400 shadow-clay-inset">
                              {JSON.stringify(safeJsonParse(e.error, {}), null, 2)}
                            </pre>
                          )}
                        </div>
                        {e.api_call && (
                          <pre className="max-h-48 overflow-auto rounded-lg bg-clay-200/80 p-2 font-mono text-[10px] text-zinc-400 shadow-clay-inset">
                            {JSON.stringify(safeJsonParse(e.api_call, {}), null, 2)}
                          </pre>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <p className="mt-2 text-xs text-zinc-600">
          Showing first 200 of {filtered.length}. Refine filters to narrow down.
        </p>
      )}
    </>
  );
}
