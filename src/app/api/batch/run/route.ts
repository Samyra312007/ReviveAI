import { NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";
import { executeBatchRun } from "@/lib/batch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const rl = checkRateLimit(clientKey(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — retry shortly" },
      { status: 429 },
    );
  }

  await request.json().catch(() => ({}));
  const token = request.headers.get("x-batch-token");
  const result = await executeBatchRun(token);
  return NextResponse.json(result.body, { status: result.status });
}
