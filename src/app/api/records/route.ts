import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRecordsWithOutcomes } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  return NextResponse.json(await getRecordsWithOutcomes(merchantIds));
}
