import { NextResponse } from "next/server";
import { checkPostgresHealth } from "@/lib/db/pool";
import { getReportJson } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  // 1) DB health
  let dbStatus: "postgres:ok" | "postgres:unreachable" | "file-only" | "missing" = "missing";
  let dbLatencyMs: number | null = null;

  if (process.env.DATABASE_URL) {
    const t0 = Date.now();
    const ok = await checkPostgresHealth();
    dbLatencyMs = Date.now() - t0;
    dbStatus = ok ? "postgres:ok" : "postgres:unreachable";
  } else {
    // No DATABASE_URL: check if file-based data exists
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dbPath = path.join(process.cwd(), "data", "synthetic.db");
    dbStatus = fs.existsSync(dbPath) ? "file-only" : "missing";
  }

  // 2) Report freshness
  const report = (await getReportJson()) as {
    generated_at?: string;
    hero?: { recovery_rate_pct?: number };
  } | null;
  const reportAgeMs = report?.generated_at
    ? Date.now() - new Date(report.generated_at).getTime()
    : null;
  const reportAgeHours =
    reportAgeMs !== null ? Math.round((reportAgeMs / 3600000) * 10) / 10 : null;

  const healthy =
    (dbStatus === "file-only" || dbStatus === "postgres:ok") && report !== null;

  return NextResponse.json(
    {
      ok: healthy,
      timestamp: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      db: {
        mode: process.env.DATABASE_URL ? "postgres" : "sqlite",
        status: dbStatus,
        latency_ms: dbLatencyMs,
      },
      report: report
        ? {
            present: true,
            generated_at: report.generated_at,
            age_hours: reportAgeHours,
            recovery_rate_pct: report.hero?.recovery_rate_pct ?? null,
          }
        : { present: false },
      env: {
        node_env: process.env.NODE_ENV ?? "unknown",
        sentry_enabled: !!(process.env.NEXT_PUBLIC_SENTRY_DSN),
        auth_configured: !!(process.env.AUTH_SECRET),
      },
      latency_ms: Date.now() - startedAt,
    },
    { status: healthy ? 200 : 503 },
  );
}
