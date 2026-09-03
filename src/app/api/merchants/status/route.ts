import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMerchantsForUser } from "@/lib/db/merchants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const merchants = await getMerchantsForUser(session.user.id);

  return NextResponse.json({
    ok: true,
    connected: merchants.length > 0,
    merchants,
    user: {
      id: session.user.id,
      role: session.user.role,
      merchant_ids: session.user.merchantIds,
    },
  });
}