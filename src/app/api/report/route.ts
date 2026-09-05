import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReportJson } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const report = await getReportJson(undefined, merchantIds);
  if (!report) {
    return NextResponse.json(
      { error: "No report found. Run the batch first." },
      { status: 404 },
    );
  }
  return NextResponse.json(report);
}
