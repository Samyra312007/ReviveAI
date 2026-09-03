"use client";

import { useEffect, useState } from "react";

interface Prefs {
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  dailyLimit: number;
}

const DEFAULTS: Prefs = {
  whatsappEnabled: true,
  emailEnabled: true,
  smsEnabled: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "09:00",
  dailyLimit: 50,
};

export function NotificationSettings() {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/merchants/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.connected && data.merchants?.length > 0) {
          const m = data.merchants[0];
          setMerchantId(m.merchant_id);
          setPrefs({
            whatsappEnabled: m.notification_prefs?.whatsappEnabled ?? DEFAULTS.whatsappEnabled,
            emailEnabled: m.notification_prefs?.emailEnabled ?? DEFAULTS.emailEnabled,
            smsEnabled: m.notification_prefs?.smsEnabled ?? DEFAULTS.smsEnabled,
            quietHoursStart: m.notification_prefs?.quietHoursStart ?? DEFAULTS.quietHoursStart,
            quietHoursEnd: m.notification_prefs?.quietHoursEnd ?? DEFAULTS.quietHoursEnd,
            dailyLimit: m.notification_prefs?.dailyLimit ?? DEFAULTS.dailyLimit,
          });
          setStatus("ready");
        } else {
          setStatus("ready");
        }
      })
      .catch(() => setStatus("ready"));
  }, []);

  async function save() {
    if (!merchantId) return;
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/merchants/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantId,
          whatsapp_enabled: prefs.whatsappEnabled,
          email_enabled: prefs.emailEnabled,
          sms_enabled: prefs.smsEnabled,
          quiet_hours_start: prefs.quietHoursStart,
          quiet_hours_end: prefs.quietHoursEnd,
          daily_limit: prefs.dailyLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setStatus("saved");
      setTimeout(() => setStatus("ready"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  if (!merchantId) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
        Connect a Razorpay account first to configure notification channels.{" "}
        <a href="/onboarding" className="text-emerald-400 hover:underline">
          Start onboarding →
        </a>
      </div>
    );
  }

  const toggle = (key: keyof Prefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="max-w-xl space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-base font-semibold">Channels</h2>
        <p className="mt-1 text-xs text-zinc-500">
          When a recovery nudge is due, ReviveAI tries channels in order: WhatsApp → email → SMS.
        </p>
        <div className="mt-4 space-y-3">
          {(
            [
              ["whatsappEnabled", "WhatsApp", "Meta Cloud API — best delivery + replies"],
              ["emailEnabled", "Email", "Transactional email via Resend"],
              ["smsEnabled", "SMS", "Text-only fallback (requires provider keys)"],
            ] as const
          ).map(([key, label, desc]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <span>
                <span className="block text-sm text-zinc-200">{label}</span>
                <span className="block text-xs text-zinc-500">{desc}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                onClick={() => toggle(key)}
                className={`h-6 w-11 rounded-full transition ${prefs[key] ? "bg-emerald-500" : "bg-zinc-700"}`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="text-base font-semibold">Quiet hours & limits</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Quiet hours start
            <input
              type="time"
              value={prefs.quietHoursStart}
              onChange={(e) => setPrefs({ ...prefs, quietHoursStart: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Quiet hours end
            <input
              type="time"
              value={prefs.quietHoursEnd}
              onChange={(e) => setPrefs({ ...prefs, quietHoursEnd: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="col-span-2 text-xs text-zinc-400">
            Daily notification limit
            <input
              type="number"
              min={1}
              max={500}
              value={prefs.dailyLimit}
              onChange={(e) => setPrefs({ ...prefs, dailyLimit: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          Notifications outside quiet hours are queued for the next window. The daily limit caps
          total outbound nudges per day.
        </p>
      </section>

      <button
        onClick={save}
        disabled={status === "saving"}
        className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "✓ Saved" : "Save preferences"}
      </button>
    </div>
  );
}