import { NextResponse } from "next/server";
import { auth } from "@/auth";
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

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  await request.json().catch(() => ({}));
  const result = await executeBatchRun();
  return NextResponse.json(result.body, { status: result.status });
}
