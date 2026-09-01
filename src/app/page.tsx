import Link from "next/link";
import { CountUp } from "@/components/landing/count-up";
import { MiniSimulator } from "@/components/landing/mini-simulator";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="-mx-6 -mt-8">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        {/* grid + orbs */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.15]" />
        <div className="pointer-events-none absolute -top-24 -right-24 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-[80px] motion-safe:animate-pulse" style={{ animationDuration: "6s" }} />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-[560px] w-[560px] rounded-full bg-violet-500/10 blur-[80px] motion-safe:animate-pulse" style={{ animationDuration: "7s" }} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-950" />

        <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              Bring dead revenue
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
                back to life.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
              Autonomous agent that <span className="text-zinc-200">detects → diagnoses → intervenes → recovers</span>.
              Measured money, bounded by 13 guardrails, fully auditable. Built for Indian merchants losing 8–15% every year.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                Get Started
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">150 records</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">13 guardrails</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">5 extensions</span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">11 pages</span>
            </div>
          </div>

          {/* Live metric mock */}
          <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Live from SQLite</span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-5">
              <div className="text-xs uppercase tracking-wider text-zinc-400">Total Recovered</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">
                <CountUp value={598132} prefix="₹" />
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                of ₹12,57,691 at risk • <span className="font-semibold text-white">47.6%</span> recovery
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full w-[47.6%] rounded-full bg-emerald-500" />
              </div>
              <div className="mt-2 flex gap-1">
                {[12, 18, 10, 22, 14, 20, 16, 24, 13, 19, 15, 21].map((h, i) => (
                  <span key={i} className="flex-1 rounded-full bg-emerald-500/30" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Precision</div>
                <div className="mt-1 font-bold tabular-nums text-emerald-400">0.991</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Recall</div>
                <div className="mt-1 font-bold tabular-nums">0.934</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">F1</div>
                <div className="mt-1 font-bold tabular-nums text-violet-400">0.962</div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Honest metrics — no cherry-picking. Every record counted.{" "}
              <Link href="/results" className="text-emerald-400 hover:underline">
                View breakdown →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* PROBLEM STRIP */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Payment Failures", range: "₹1.2L – ₹3.6L / year", sub: "Manual retry if remembered" },
            { label: "Checkout Abandonment", range: "₹2.4L – ₹7.2L / year", sub: "No systematic follow-up" },
            { label: "Failed Subscriptions", range: "₹0.8L – ₹2.4L / year", sub: "Dunning emails, low conversion" },
            { label: "Overdue Invoices", range: "₹1.6L – ₹4.8L / year", sub: "Accounts team chases manually" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="text-sm font-medium text-zinc-200">{c.label}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-amber-400">{c.range}</div>
              <div className="mt-1 text-xs text-zinc-500">{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-center text-sm">
          <span className="font-semibold text-amber-400">Total leaked: ₹6L – ₹18L per merchant per year</span>
          <span className="text-zinc-500"> — inconsistent, manual, error-prone. ReviveAI closes the loop.</span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">How it works</h2>
        <p className="mt-1 text-sm text-zinc-500">Four stages, one auditable pipeline. Every decision carries reasoning.</p>
        <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-6 right-6 top-[22px] hidden h-px bg-gradient-to-r from-zinc-800 via-emerald-500/30 to-zinc-800 lg:block" />
          {[
            { step: "01", title: "Detect", desc: "4 detectors classify failures by root cause with confidence scoring. Urgency = recency × value × recovery probability.", icon: "◉" },
            { step: "02", title: "Diagnose", desc: "Deterministic decision tree picks the right intervention per lifecycle stage. 100% auditable.", icon: "◆" },
            { step: "03", title: "Guard", desc: "19 rules — quiet hours, retry caps, ₹50k approvals, volume limits. Human council governs tuning.", icon: "⬢" },
            { step: "04", title: "Recover", desc: "Razorpay Test API in live or simulated mode. Every call logged, every outcome measured.", icon: "⬣" },
          ].map((s) => (
            <div key={s.step} className="relative rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-sm font-bold text-emerald-400">
                {s.icon}
              </div>
              <div className="mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Step {s.step}</div>
              <div className="text-base font-semibold">{s.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GUARDRAILS TRUST */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 lg:p-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Bounded by design. Governed by humans.</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                19 guardrails across retry, time, compliance, financial, voice, and promise categories. The agent audits its own blocks, proposes tuning, and waits — it never changes its own boundaries. Featured in the <Link href="/council" className="text-emerald-400 hover:underline">Tuning Council</Link>.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-lg font-bold tabular-nums text-emerald-400">19</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Guardrails</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-lg font-bold tabular-nums">2%</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Block rate</div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="text-lg font-bold tabular-nums text-sky-400">100%</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Audited</div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-400">Council inbox — live example</div>
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono font-semibold text-amber-400">[B4]</span>
                  <span className="text-zinc-500">7-day → 10-day retry window</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">Blocked 1 subscription with p=0.75. Propose extending the retry window.</p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-zinc-950">Approve</span>
                  <span className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400">Reject</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Human approves → override active on next run. Every decision timestamped. <Link href="/council" className="text-emerald-400 hover:underline">Open Council →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE PROOF */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">See the economics move</h2>
        <p className="mt-1 text-sm text-zinc-500">Tighten a guardrail, watch recovered ₹ shift. Full console at <Link href="/simulator" className="text-emerald-400 hover:underline">/simulator</Link>.</p>
        <div className="mt-6">
          <MiniSimulator />
        </div>
      </section>

      {/* EXTENSIONS BENTO */}
      <section className="mx-auto max-w-7xl px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">Five extensions, one platform</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Link href="/council" className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-amber-500/30 hover:bg-zinc-900 lg:col-span-2">
            <div className="text-xs font-medium uppercase tracking-wider text-amber-400">Governance</div>
            <div className="mt-1 font-semibold group-hover:text-amber-400">Guardrail Tuning Council</div>
            <p className="mt-1 text-sm text-zinc-400">Self-auditing guardrail proposals with human approval. The agent governs itself — under supervision.</p>
          </Link>
          <Link href="/simulator" className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-sky-500/30 hover:bg-zinc-900">
            <div className="text-xs font-medium uppercase tracking-wider text-sky-400">Economics</div>
            <div className="mt-1 font-semibold group-hover:text-sky-400">What-If Console</div>
            <p className="mt-1 text-sm text-zinc-400">5 sliders, instant re-simulation, baseline vs scenario.</p>
          </Link>
          <Link href="/timeline" className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-violet-500/30 hover:bg-zinc-900">
            <div className="text-xs font-medium uppercase tracking-wider text-violet-400">Conversations</div>
            <div className="mt-1 font-semibold">Two-Way Recovery</div>
            <p className="mt-1 text-sm text-zinc-400">Hinglish intent classification, dispute escalation, chat-parsed promises.</p>
          </Link>
          <Link href="/results" className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-emerald-500/30 hover:bg-zinc-900">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-400">Prevention</div>
            <div className="mt-1 font-semibold">Churn Prevention</div>
            <p className="mt-1 text-sm text-zinc-400">Risk scoring on healthy customers. Protected ₹ reported separately.</p>
          </Link>
          <Link href="/fleet" className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 transition hover:border-zinc-700 hover:bg-zinc-900">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">Scale</div>
            <div className="mt-1 font-semibold">Fleet View</div>
            <p className="mt-1 text-sm text-zinc-400">Per-merchant economics + fairness check to 10k scale.</p>
          </Link>
        </div>
      </section>



      {/* FOOTER */}
      <footer className="border-t border-zinc-800 py-6">
        <div className="mx-auto max-w-7xl px-6 text-center text-xs text-zinc-600">© 2026 • ReviveAI • Razorpay Test Mode</div>
      </footer>
    </div>
  );
}
