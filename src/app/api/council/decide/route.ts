import { NextResponse } from "next/server";
import { checkRateLimit, clientKey } from "@/lib/ratelimit";
import { decideCouncilProposalInDb } from "@/lib/db/query";
import { isTokenAuthorized } from "@/lib/auth";
import { withExclusiveLock } from "@/lib/lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = checkRateLimit(clientKey(request));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded — retry shortly" },
      { status: 429 },
    );
  }

  if (!isTokenAuthorized(request.headers.get("x-batch-token"))) {
    return NextResponse.json(
      { error: "Unauthorized — missing or invalid x-batch-token" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id : "";
  const decision = body.decision;

  if (!proposalId || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json(
      { error: "Body must include proposal_id and decision ('approved' | 'rejected')" },
      { status: 400 },
    );
  }

  const result = await withExclusiveLock(() =>
    decideCouncilProposalInDb(proposalId, decision),
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "Proposal not found" ? 404 : 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    proposal_id: proposalId,
    decision,
    note:
      decision === "approved"
        ? "Override active — takes effect on the next batch run."
        : "Proposal rejected — no config change.",
  });
}
