import { NextResponse } from "next/server";
import { executeBatchRun } from "@/lib/batch/service";
import { sendBatchAlert } from "@/lib/notification/alerts";
import { childLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const log = childLogger("api/cron/process");

export async function GET(request: Request) {
  // Vercel Cron sends the secret in the Authorization header as "Bearer <CRON_SECRET>".
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  log.info("Cron batch run triggered");
  try {
    const result = await executeBatchRun();
    if (result.status !== 200) {
      await sendBatchAlert({
        event: "failed",
        summary: { reason: "Cron batch returned non-200", status: result.status },
        error: typeof result.body.error === "string" ? result.body.error : "batch failed",
      });
      return NextResponse.json(result.body, { status: result.status });
    }
    return NextResponse.json(result.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "Cron batch failed");
    await sendBatchAlert({
      event: "failed",
      summary: { phase: "cron" },
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}