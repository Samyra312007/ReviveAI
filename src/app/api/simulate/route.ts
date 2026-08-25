import { NextResponse } from "next/server";
import { simulateScenario } from "@/lib/simulator/service";
import { isTokenAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isTokenAuthorized(request.headers.get("x-batch-token"))) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid x-batch-token" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const result = await simulateScenario(body.overrides);
  return NextResponse.json(result.body, { status: result.status });
}
