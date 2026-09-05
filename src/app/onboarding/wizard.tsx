"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

interface MerchantInfo {
  merchant_id: string;
  business_name: string;
  razorpay_key_id_masked: string;
}

type Step = "connect" | "secret" | "import" | "run" | "done";

export function OnboardingWizard() {
  const { data: session, update } = useSession();
  const [step, setStep] = useState<Step>("connect");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    // If the user already has a merchant, skip to a sensible step.
    fetch("/api/merchants/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.connected && data.merchants?.length > 0) {
          const m = data.merchants[0] as MerchantInfo;
          setMerchantId(m.merchant_id);
          setStep("import");
        }
      })
      .catch(() => {});
  }, []);

  async function connectRazorpay(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: formData.get("business_name"),
          razorpay_key_id: formData.get("razorpay_key_id"),
          razorpay_key_secret: formData.get("razorpay_key_secret"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      setMerchantId(data.merchant_id);
      setWebhookSecret(data.webhook_secret);
      setWebhookUrl(data.webhook_url);
      // Refresh the session so tenant filters pick up the new merchant.
      await update({ merchantIds: data.merchants.map((m: MerchantInfo) => m.merchant_id) });
      setStep("secret");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importData() {
    if (!merchantId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: merchantId, days: 90 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImported(data.imported);
      setStep("run");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runBatch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/batch/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Batch run failed");
      setRunResult(`${data.processed} records processed · ₹ recovery engine armed`);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <ol className="mb-8 flex items-center gap-2 text-xs">
        {(["connect", "secret", "import", "run"] as Step[]).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                step === s || (["secret", "import", "run", "done"].includes(step) && i === 0)
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                  : "border-zinc-700 text-zinc-500"
              }`}
            >
              {i + 1}
            </span>
            <span className="hidden capitalize text-zinc-400 sm:inline">{s}</span>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {step === "connect" && (
        <form
          action={connectRazorpay}
          className="rounded-2xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-sm"
        >
          <h2 className="text-lg font-semibold">1 · Connect Razorpay</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Use your test or live API keys from{" "}
            <span className="text-zinc-300">Dashboard → Settings → API Keys</span>. Keys are
            encrypted at rest.
          </p>
          <div className="mt-4 space-y-3">
            <input
              name="business_name"
              required
              placeholder="Business name (e.g. Kirana Plus)"
              className="w-full rounded-lg border border-zinc-800 bg-white px-3 py-2 text-sm shadow-clay-inset outline-none focus:border-emerald-500/50"
            />
            <input
              name="razorpay_key_id"
              required
              placeholder="rzp_test_xxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-zinc-800 bg-white px-3 py-2 font-mono text-sm shadow-clay-inset outline-none focus:border-emerald-500/50"
            />
            <input
              name="razorpay_key_secret"
              required
              type="password"
              placeholder="Key Secret"
              className="w-full rounded-lg border border-zinc-800 bg-white px-3 py-2 font-mono text-sm shadow-clay-inset outline-none focus:border-emerald-500/50"
            />
          </div>
          <button
            disabled={busy}
            className="mt-5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      )}

      {step === "secret" && webhookSecret && (
        <div className="rounded-2xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-sm">
          <h2 className="text-lg font-semibold">2 · Enable the webhook</h2>
          <p className="mt-1 text-sm text-zinc-500">
            In Razorpay, go to{" "}
            <span className="text-zinc-300">Settings → Webhooks → Add Webhook</span> and paste:
          </p>
          <div className="mt-4 space-y-2">
            <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">URL</div>
              <code className="mt-1 block break-all font-mono text-xs text-emerald-400">
                {webhookUrl}
              </code>
            </div>
            <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Secret</div>
              <code className="mt-1 block break-all font-mono text-xs text-emerald-400">
                {webhookSecret}
              </code>
            </div>
            <p className="text-xs text-zinc-500">
              Enable events: <code className="text-zinc-300">payment.failed</code>,{" "}
              <code className="text-zinc-300">subscription.failed</code>,{" "}
              <code className="text-zinc-300">invoice.expired</code>. Save this secret; it won&apos;t
              be shown again.
            </p>
          </div>
          <button
            onClick={() => setStep("import")}
            className="mt-5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5"
          >
            Done, next step
          </button>
        </div>
      )}

      {step === "import" && (
        <div className="rounded-2xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-sm">
          <h2 className="text-lg font-semibold">
            {merchantId ? "3 · Import recent failures" : "3 · Connect first"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {merchantId
              ? "Pull the last 90 days of failed payments from Razorpay so the agent has real data to work with."
              : "Connect your Razorpay account above to continue."}
          </p>
          {imported !== null && (
            <p className="mt-3 text-sm text-emerald-400">✓ Imported {imported} failed payments</p>
          )}
          <button
            onClick={importData}
            disabled={busy || !merchantId}
            className="mt-5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "Importing…" : imported !== null ? "Re-import" : "Import data"}
          </button>
        </div>
      )}

      {step === "run" && (
        <div className="rounded-2xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-sm">
          <h2 className="text-lg font-semibold">4 · Run your first batch</h2>
          <p className="mt-1 text-sm text-zinc-500">
            The agent will detect, diagnose, guardrail and attempt recovery on every imported
            failure. Everything lands in the audit log.
          </p>
          <button
            onClick={runBatch}
            disabled={busy}
            className="mt-5 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "Running…" : "Run batch"}
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center shadow-clay-inset">
          <svg className="mx-auto h-10 w-10 text-emerald-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="m8.5 12.2 2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="mt-2 text-lg font-semibold text-emerald-400">You&apos;re live</h2>
          <p className="mt-1 text-sm text-zinc-400">{runResult}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5"
            >
              Go to dashboard
            </Link>
            <Link
              href="/settings/notifications"
              className="rounded-full border border-zinc-700 bg-white px-5 py-2 text-sm text-zinc-300 shadow-clay-btn transition hover:bg-clay-200 active:translate-y-0.5"
            >
              Configure notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}