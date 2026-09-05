"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScenarioSummary {
  effective_config: Record<string, number>;
  recovered_paise: number;
  at_risk_paise: number;
  recovery_rate_pct: number;
  interventions: number;
  blocked: number;
  escalated: number;
  skipped: number;
  attempted_volume_paise: number;
  blocks_by_rule: Record<string, number>;
  by_category: {
    category: string;
    at_risk_paise: number;
    recovered_paise: number;
    rate: number;
  }[];
}

interface SimulateResponse {
  ok: boolean;
  baseline: ScenarioSummary;
  scenario: ScenarioSummary;
  applied_overrides: Record<string, number>;
  rejected_keys: string[];
  error?: string;
}

const SLIDERS: {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  defaultValue: number;
}[] = [
  {
    key: "approvalThresholdPaise",
    label: "Approval cap (single intervention)",
    min: 1000000,
    max: 20000000,
    step: 500000,
    format: (v) => `₹${(v / 100).toLocaleString("en-IN")}`,
    defaultValue: 5000000,
  },
  {
    key: "dailyVolumeCapPaise",
    label: "Daily recovery volume cap",
    min: 10000000,
    max: 200000000,
    step: 10000000,
    format: (v) => `₹${(v / 100).toLocaleString("en-IN")}`,
    defaultValue: 50000000,
  },
  {
    key: "maxRetriesPerRecord",
    label: "Max retries per record",
    min: 0,
    max: 4,
    step: 1,
    format: (v) => `${v}`,
    defaultValue: 2,
  },
  {
    key: "cooldownHours",
    label: "Customer cooldown",
    min: 1,
    max: 24,
    step: 1,
    format: (v) => `${v}h`,
    defaultValue: 4,
  },
  {
    key: "checkoutNudgeWindowHours",
    label: "Checkout nudge window",
    min: 0.5,
    max: 8,
    step: 0.5,
    format: (v) => `${v}h`,
    defaultValue: 2,
  },
];

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function WhatIfConsole() {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [data, setData] = useState<SimulateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const runSimulation = useCallback(async (ovr: Record<string, number>) => {
    setLoading(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: ovr }),
      });
      const json: SimulateResponse = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok || json.error) setError(json.error ?? "Simulation failed");
      else {
        setData(json);
        setError(null);
      }
    } catch {
      if (mountedRef.current) setError("Network error during simulation");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSimulation(overrides), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [overrides, runSimulation]);

  function setOverride(key: string, value: number) {
    setOverrides((prev) => {
      const next = { ...prev };
      const slider = SLIDERS.find((s) => s.key === key)!;
      if (value === slider.defaultValue) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function reset() {
    setOverrides({});
  }

  const baseline = data?.baseline;
  const scenario = data?.scenario;
  const deltaRecovered =
    scenario && baseline ? scenario.recovered_paise - baseline.recovered_paise : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Guardrail levers</h2>
          <button
            onClick={reset}
            disabled={Object.keys(overrides).length === 0}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-400 disabled:opacity-40"
          >
            Reset to defaults
          </button>
        </div>

        {SLIDERS.map((s) => {
          const current = overrides[s.key] ?? s.defaultValue;
          const changed = overrides[s.key] !== undefined;
          return (
            <div key={s.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={changed ? "font-medium text-sky-400" : "text-zinc-400"}>
                  {s.label}
                  {changed && " *"}
                </span>
                <span className={`tabular-nums ${changed ? "font-semibold text-sky-400" : "text-zinc-500"}`}>
                  {s.format(current)}
                </span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={current}
                onChange={(e) => setOverride(s.key, Number(e.target.value))}
                className="clay-range w-full"
              />
            </div>
          );
        })}

        <p className="border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500">
          Simulations run the full agent pipeline in-memory against the same 150
          records and never touch production data. Values are clamped to safe
          ranges server-side.
        </p>
      </div>

      <div className="space-y-5 lg:col-span-3">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="flex h-full items-center justify-center rounded-xl border border-zinc-800 p-10 text-sm text-zinc-500">
            Running baseline simulation…
          </div>
        )}

        {scenario && baseline && (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="text-xs uppercase tracking-wider text-zinc-500">
                Recovered in this scenario
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-emerald-400">
                  {inr(scenario.recovered_paise)}
                </span>
                <span className="text-sm text-zinc-500">
                  baseline {inr(baseline.recovered_paise)}
                </span>
                {deltaRecovered !== 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                      deltaRecovered > 0
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/15 text-rose-400"
                    }`}
                  >
                    {deltaRecovered > 0 ? "+" : ""}
                    {inr(deltaRecovered)} vs baseline
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Recovery rate {(baseline.recovery_rate_pct).toFixed(1)}% →{" "}
                <span className="font-semibold text-zinc-300">
                  {(scenario.recovery_rate_pct).toFixed(1)}%
                </span>{" "}
                · risk exposure {inr(scenario.attempted_volume_paise)} (baseline{" "}
                {inr(baseline.attempted_volume_paise)})
              </div>
              {loading && (
                <p className="mt-2 animate-pulse text-xs text-sky-400">
                  Recalculating…
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Interventions", base: baseline.interventions, now: scenario.interventions },
                { label: "Blocked", base: baseline.blocked, now: scenario.blocked },
                { label: "Escalated", base: baseline.escalated, now: scenario.escalated },
                { label: "Skipped", base: baseline.skipped, now: scenario.skipped },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {m.label}
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums">{m.now}</div>
                  <div
                    className={`text-[10px] tabular-nums ${
                      m.now > m.base ? "text-sky-400" : m.now < m.base ? "text-amber-400" : "text-zinc-600"
                    }`}
                  >
                    base {m.base}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Category breakdown (scenario)
              </h3>
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-zinc-800/60">
                  {scenario.by_category.map((c) => (
                    <tr key={c.category}>
                      <td className="py-1.5 capitalize text-zinc-400">
                        {c.category.replace(/_/g, " ")}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-500">
                        of {inr(c.at_risk_paise)}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums text-emerald-400">
                        {inr(c.recovered_paise)}
                      </td>
                      <td className="w-16 py-1.5 pl-3 text-right tabular-nums">
                        {(c.rate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs leading-relaxed text-zinc-600">
              Loosening guardrails recovers more money but raises compliance risk
              exposure; tightening does the opposite. The council-approved
              configuration lives on the{" "}
              <span className="text-zinc-400">Council</span> page; simulations
              here never change it.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
