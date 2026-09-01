import { NextResponse } from "next/server";
import { getAuditRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let rows = await getAuditRows();

  const outcome = searchParams.get("outcome");
  if (outcome) rows = rows.filter((r) => r.outcome === outcome);

  const category = searchParams.get("category");
  if (category)
    rows = rows.filter((r) => r.detected_category === category);

  const recordId = searchParams.get("record_id");
  if (recordId) rows = rows.filter((r) => r.record_id === recordId);

  const q = searchParams.get("q")?.toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [
        r.record_id,
        r.customer_id,
        r.detected_subcategory,
        r.selected_strategy,
        r.decision_reasoning,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }

  return NextResponse.json(rows);
}
