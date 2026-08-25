"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressBar } from "./ui";

interface RunResponse {
  ok: boolean;
  processed: number;
  processing_time_ms: number;
  report?: {
    hero: { recovered_display: string; at_risk_display: string; recovery_rate_pct: number };
  };
  error?: string;
}

export function LiveProcessing({ totalRecords }: { totalRecords: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function runBatch() {
    setRunning(true);
    setResult(null);
    setError(null);
    setCount(0);

    let fake = 0;
    timerRef.current = setInterval(() => {
      fake = Math.min(totalRecords - 1, fake + Math.ceil(Math.random() * 9));
      setCount(fake);
    }, 90);

    try {
      const res = await fetch("/api/batch/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-token":
            process.env.NEXT_PUBLIC_BATCH_TOKEN ?? "reviveai-demo-token",
        },
      });
      const data: RunResponse = await res.json();
      if (timerRef.current) clearInterval(timerRef.current);
      if (!res.ok || data.error) {
        setError(data.error ?? "Batch failed");
      } else {
        setCount(totalRecords);
        setResult(data);
        router.refresh();
      }
    } catch {
      if (timerRef.current) clearInterval(timerRef.current);
      setError("Network error while running batch");
    } finally {
      setRunning(false);
    }
  }

  const pct = totalRecords > 0 ? (count / totalRecords) * 100 : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Live Batch Processing</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Runs the full detect → diagnose → guardrail → execute → measure loop
            over all {totalRecords} records.
          </p>
        </div>
        <button
          onClick={runBatch}
          disabled={running}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Processing…" : "Run Batch"}
        </button>
      </div>

      {(running || result) && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-sm tabular-nums">
            <span className="text-zinc-400">
              Records processed:{" "}
              <span className="font-semibold text-emerald-400">
                {count} / {totalRecords}
              </span>
            </span>
            <span className="text-zinc-500">{Math.round(pct)}%</span>
          </div>
          <ProgressBar pct={pct} />
          {running && (
            <p className="text-xs text-zinc-600">
              Classifying failures · selecting strategies · checking guardrails…
            </p>
          )}
        </div>
      )}

      {result?.report && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <span className="font-semibold text-emerald-400">✓ Batch complete</span>{" "}
          <span className="text-zinc-300">
            {result.report.hero.recovered_display} recovered from{" "}
            {result.report.hero.at_risk_display} at risk (
            {result.report.hero.recovery_rate_pct}%) in{" "}
            {result.processing_time_ms}ms
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          ✕ {error}
        </div>
      )}
    </div>
  );
}
