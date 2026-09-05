export function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const OUTCOME_STYLES: Record<string, { bg: string; label: string }> = {
  recovered: { bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Recovered" },
  failed: { bg: "bg-rose-500/15 text-rose-400 border-rose-500/30", label: "Failed" },
  escalated: { bg: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Escalated" },
  skipped: { bg: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", label: "Skipped" },
  blocked: { bg: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30", label: "Blocked" },
};

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return (
      <span className="inline-block rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
        Not processed
      </span>
    );
  }
  const style = OUTCOME_STYLES[outcome] ?? OUTCOME_STYLES.skipped;
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${style.bg}`}>
      {style.label}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  accent = "text-zinc-950",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-clay-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function ProgressBar({ pct, color = "bg-emerald-500" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 shadow-clay-inset">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: { label: string; variant?: "demo" | "connected" };
}) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {badge && (
          <span
            className={
              badge.variant === "connected"
                ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20"
                : "rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 border border-amber-500/20"
            }
          >
            {badge.label}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">{description}</p>
    </header>
  );
}

export function EmptyState({ message }: { message: string }) {
  const [first, ...rest] = message.split("`");
  return (
    <div className="rounded-2xl border border-dashed border-zinc-700 bg-clay-100 p-10 text-center text-sm text-zinc-500 shadow-clay-inset">
      <p>
        {first}
        {rest.map((part, i) =>
          i % 2 === 0 ? (
            part
          ) : (
            <code key={i} className="mx-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">
              {part}
            </code>
          ),
        )}
      </p>
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-clay-100 shadow-clay-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">{children}</tbody>
      </table>
    </div>
  );
}
