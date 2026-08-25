import { NextResponse } from "next/server";
import { getReportJson } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = getReportJson();
  if (!report) {
    return NextResponse.json(
      { error: "No report found. Run the batch first." },
      { status: 404 },
    );
  }
  return NextResponse.json(report);
}
