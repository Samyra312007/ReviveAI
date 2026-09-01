import { NextResponse } from "next/server";
import { getRecordsWithOutcomes } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getRecordsWithOutcomes());
}
