import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getConversationRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  return NextResponse.json(await getConversationRows(session?.user?.merchantIds));
}
