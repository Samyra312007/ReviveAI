import { NextResponse } from "next/server";
import { executeBatchRun } from "@/lib/batch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  await request.json().catch(() => ({}));
  const token = request.headers.get("x-batch-token");
  const result = await executeBatchRun(token);
  return NextResponse.json(result.body, { status: result.status });
}
