"use client";
import { useState } from "react";
import { GatedLink } from "@/components/landing/gated-link";

export function MiniSimulator() {
  const [cap, setCap] = useState(50000);
  const baseline = 598132;
  const factor = Math.max(0.35, Math.min(1, cap / 50000));
  const recovered = Math.round(199_948 + (baseline - 199_948) * (factor - 0.2) / 0.8);
  const clamped = Math.max(199_948, Math.min(baseline, recovered));
  const interventions = Math.round(71 + 37 * factor);
  const blocked = Math.round(38 * (1 - factor + 0.2));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Try the guardrail economics</h3>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
          Live simulation
        </span>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-zinc-500">Approval cap</span>
          <span className="tabular-nums font-medium text-sky-400">₹{cap.toLocaleString("en-IN")}</span>
        </div>
        <input
          type="range"
          min={10000}
          max={200000}
          step={5000}
          value={cap}
          onChange={(e) => setCap(Number(e.target.value))}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>₹10k (strict)</span>
          <span>₹2L (permissive)</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Recovered</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-emerald-400">₹{clamped.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Interventions</div>
          <div className="mt-1 text-sm font-bold tabular-nums">{interventions}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Blocked</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-amber-400">{Math.max(1, blocked)}</div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500">
        <GatedLink href="/simulator" className="text-emerald-400 hover:underline">Open full simulator →</GatedLink>{" "}
        (zero DB writes, deterministic)
      </p>
    </div>
  );
}
