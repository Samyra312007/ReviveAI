import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllMerchants, updateMerchantPrefs } from "@/lib/db/merchants";
import type { NotificationPrefs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const merchantId = String(body.merchant_id ?? "");

  const all = await getAllMerchants();
  const owned = all.some((m) => m.merchant_id === merchantId && m.user_id === session.user?.id);
  if (!owned) {
    return NextResponse.json({ error: "Merchant not found for this user" }, { status: 404 });
  }

  const prefs: NotificationPrefs = {
    whatsappEnabled: typeof body.whatsapp_enabled === "boolean" ? body.whatsapp_enabled : true,
    emailEnabled: typeof body.email_enabled === "boolean" ? body.email_enabled : true,
    smsEnabled: typeof body.sms_enabled === "boolean" ? body.sms_enabled : false,
    quietHoursStart: typeof body.quiet_hours_start === "string" ? body.quiet_hours_start : "21:00",
    quietHoursEnd: typeof body.quiet_hours_end === "string" ? body.quiet_hours_end : "09:00",
    dailyLimit:
      typeof body.daily_limit === "number"
        ? Math.max(1, Math.min(500, Math.floor(body.daily_limit)))
        : 50,
  };

  await updateMerchantPrefs(merchantId, prefs);
  return NextResponse.json({ ok: true, merchant_id: merchantId, notification_prefs: prefs });
}