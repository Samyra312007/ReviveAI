import { NextResponse } from "next/server";
import { isPostgresEnabled, checkPostgresHealth } from "@/lib/db/pool";
import { getReportJson } from "@/lib/db/query";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  // 1) DB health
  let dbStatus: "sqlite" | "postgres:ok" | "postgres:unreachable" | "missing" = "missing";
  let dbLatencyMs: number | null = null;

  const dbPath = path.join(process.cwd(), "data", "synthetic.db");
  if (isPostgresEnabled()) {
    const t0 = Date.now();
    const ok = await checkPostgresHealth();
    dbLatencyMs = Date.now() - t0;
    if (ok) {
      dbStatus = "postgres:ok";
    } else if (fs.existsSync(dbPath)) {
      // Neon unreachable but local SQLite fallback still serves traffic (dev/CI)
      dbStatus = "sqlite";
      dbLatencyMs = null;
    } else {
      dbStatus = "postgres:unreachable";
    }
  } else if (fs.existsSync(dbPath)) {
    dbStatus = "sqlite";
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
    (dbStatus === "sqlite" || dbStatus === "postgres:ok") && report !== null;

  return NextResponse.json(
    {
      ok: healthy,
      timestamp: new Date().toISOString(),
      uptime_s: Math.round(process.uptime()),
      db: {
        mode: isPostgresEnabled() ? "postgres" : "sqlite",
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
      latency_ms: Date.now() - startedAt,
    },
    { status: healthy ? 200 : 503 },
  );
}
