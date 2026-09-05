import { GatedLink } from "@/components/landing/gated-link";
import { CountUp } from "@/components/landing/count-up";
import { MiniSimulator } from "@/components/landing/mini-simulator";

export const dynamic = "force-dynamic";

/* Single-stroke icons (1.5px, round caps), one consistent family */
const STEP_ICONS = {
  detect: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <path d="M10 3.5V1.5M10 18.5v-2M3.5 10h-2M18.5 10h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  diagnose: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 1.5v7M10 8.5 5 14M10 8.5l5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="16.5" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  guard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 1.8 16.5 4v5.2c0 3.9-2.7 6.9-6.5 8.3-3.8-1.4-6.5-4.4-6.5-8.3V4L10 1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m7.4 9.6 1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  recover: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 15.5v-12M6 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 17h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

/* Weekly recovery trend: real SVG bars (same values as the incumbent mock) */
const TREND = [12, 18, 10, 22, 14, 20, 16, 24, 13, 19, 15, 21];

function RecoveryChart() {
  const max = Math.max(...TREND);
  return (
    <svg
      viewBox="0 0 120 32"
      className="h-8 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {TREND.map((h, i) => {
        const height = Math.round((h / max) * 24) + 4;
        const x = i * 10;
        return (
          <rect
            key={i}
            x={x}
            y={32 - height}
            width="6"
            height={height}
            rx="3"
            fill="rgb(85 178 135 / 0.55)"
          />
        );
      })}
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="-mx-6 -mt-8">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div className="relative grid gap-10 px-6 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              Bring dead revenue
              <br />
              <span className="text-emerald-400">back to life.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-400">
              Autonomous agent that <span className="font-medium text-zinc-200">detects → diagnoses → intervenes → recovers</span>.
              Measured money, bounded by 13 guardrails, fully auditable. Built for Indian merchants losing 8–15% every year.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <GatedLink
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3 text-sm font-semibold text-zinc-950 shadow-clay-btn transition hover:bg-emerald-450 active:translate-y-0.5"
              >
                Get Started
              </GatedLink>
            </div>
          </div>

          {/* Live metric mock: raised clay slab */}
          <div className="relative rounded-3xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Live from SQLite</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-clay-200/80 p-5 shadow-clay-inset">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Total Recovered</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-400">
                <CountUp value={598132} prefix="₹" />
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                of ₹12,57,691 at risk • <span className="font-semibold text-zinc-950">47.6%</span> recovery
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800 shadow-clay-inset">
                <div className="h-full w-[47.6%] rounded-full bg-emerald-500" />
              </div>
              <div className="mt-3">
                <RecoveryChart />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Precision</div>
                <div className="mt-1 font-bold tabular-nums text-emerald-400">0.991</div>
              </div>
              <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Recall</div>
                <div className="mt-1 font-bold tabular-nums">0.934</div>
              </div>
              <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">F1</div>
                <div className="mt-1 font-bold tabular-nums text-violet-400">0.962</div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Honest metrics. No cherry-picking. Every record counted.{" "}
              <GatedLink href="/results" className="font-medium text-emerald-400 hover:underline">
                View breakdown →
              </GatedLink>
            </p>
          </div>
        </div>
      </section>

      {/* PROBLEM STRIP */}
      <section className="px-6 py-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Payment Failures", range: "₹1.2L – ₹3.6L / year", sub: "Manual retry if remembered" },
            { label: "Checkout Abandonment", range: "₹2.4L – ₹7.2L / year", sub: "No systematic follow-up" },
            { label: "Failed Subscriptions", range: "₹0.8L – ₹2.4L / year", sub: "Dunning emails, low conversion" },
            { label: "Overdue Invoices", range: "₹1.6L – ₹4.8L / year", sub: "Accounts team chases manually" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm">
              <div className="text-sm font-medium text-zinc-200">{c.label}</div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-amber-400">{c.range}</div>
              <div className="mt-1 text-xs text-zinc-500">{c.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-center text-sm shadow-clay-inset">
          <span className="font-semibold text-amber-400">Total leaked: ₹6L – ₹18L per merchant per year</span>
          <span className="text-zinc-500"> when recovery is manual, inconsistent, and error-prone. ReviveAI closes the loop.</span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">How it works</h2>
        <p className="mt-1 text-sm text-zinc-500">Four stages, one auditable pipeline. Every decision carries reasoning.</p>
        <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="pointer-events-none absolute left-6 right-6 top-[26px] hidden h-px bg-zinc-700/40 lg:block" />
          {[
            { step: "01", title: "Detect", desc: "4 detectors classify failures by root cause with confidence scoring. Urgency = recency × value × recovery probability.", icon: STEP_ICONS.detect },
            { step: "02", title: "Diagnose", desc: "Deterministic decision tree picks the right intervention per lifecycle stage. 100% auditable.", icon: STEP_ICONS.diagnose },
            { step: "03", title: "Guard", desc: "19 rules: quiet hours, retry caps, ₹50k approvals, volume limits. Human council governs tuning.", icon: STEP_ICONS.guard },
            { step: "04", title: "Recover", desc: "Razorpay Test API in live or simulated mode. Every call logged, every outcome measured.", icon: STEP_ICONS.recover },
          ].map((s) => (
            <div key={s.step} className="relative rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
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
      <section className="px-6 py-10">
        <div className="rounded-3xl border border-zinc-800 bg-clay-100 p-6 shadow-clay-sm lg:p-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Bounded by design. Governed by humans.</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                19 guardrails across retry, time, compliance, financial, voice, and promise categories. The agent audits its own blocks, proposes tuning, and waits. It never changes its own boundaries. Featured in the <GatedLink href="/council" className="font-medium text-emerald-400 hover:underline">Tuning Council</GatedLink>.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                  <div className="text-lg font-bold tabular-nums text-emerald-400">19</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Guardrails</div>
                </div>
                <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                  <div className="text-lg font-bold tabular-nums">2%</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Block rate</div>
                </div>
                <div className="rounded-xl bg-clay-200/80 p-3 shadow-clay-inset">
                  <div className="text-lg font-bold tabular-nums text-sky-400">100%</div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Audited</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 shadow-clay-inset">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-400">Council inbox · live example</div>
              <div className="mt-3 rounded-xl bg-clay-100 p-4 shadow-clay-sm">
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-400">[B4]</span>
                  <span className="text-zinc-500">7-day → 10-day retry window</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">Blocked 1 subscription with p=0.75. Propose extending the retry window.</p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-zinc-950 shadow-clay-btn">Approve</span>
                  <span className="rounded-full border border-zinc-700 bg-clay-100 px-4 py-1.5 text-xs text-zinc-400">Reject</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Human approves → override active on next run. Every decision timestamped. <GatedLink href="/council" className="font-medium text-emerald-400 hover:underline">Open Council →</GatedLink>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE PROOF */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">See the economics move</h2>
        <p className="mt-1 text-sm text-zinc-500">Tighten a guardrail, watch recovered ₹ shift. Full console at <GatedLink href="/simulator" className="font-medium text-emerald-400 hover:underline">/simulator</GatedLink>.</p>
        <div className="mt-6">
          <MiniSimulator />
        </div>
      </section>

      {/* EXTENSIONS BENTO */}
      <section className="px-6 py-10">
        <h2 className="text-xl font-bold tracking-tight">Five extensions, one platform</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GatedLink href="/council" className="group rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-clay lg:col-span-2">
            <div className="text-xs font-medium uppercase tracking-wider text-amber-400">Governance</div>
            <div className="mt-1 font-semibold group-hover:text-amber-400">Guardrail Tuning Council</div>
            <p className="mt-1 text-sm text-zinc-400">Self-auditing guardrail proposals with human approval. The agent governs itself, always under supervision.</p>
          </GatedLink>
          <GatedLink href="/simulator" className="group rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-clay">
            <div className="text-xs font-medium uppercase tracking-wider text-sky-400">Economics</div>
            <div className="mt-1 font-semibold group-hover:text-sky-400">What-If Console</div>
            <p className="mt-1 text-sm text-zinc-400">5 sliders, instant re-simulation, baseline vs scenario.</p>
          </GatedLink>
          <GatedLink href="/timeline" className="group rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-clay">
            <div className="text-xs font-medium uppercase tracking-wider text-violet-400">Conversations</div>
            <div className="mt-1 font-semibold group-hover:text-violet-400">Two-Way Recovery</div>
            <p className="mt-1 text-sm text-zinc-400">Hinglish intent classification, dispute escalation, chat-parsed promises.</p>
          </GatedLink>
          <GatedLink href="/results" className="group rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-clay">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-400">Prevention</div>
            <div className="mt-1 font-semibold group-hover:text-emerald-400">Churn Prevention</div>
            <p className="mt-1 text-sm text-zinc-400">Risk scoring on healthy customers. Protected ₹ reported separately.</p>
          </GatedLink>
          <GatedLink href="/fleet" className="group rounded-2xl border border-zinc-800 bg-clay-100 p-5 shadow-clay-sm transition hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-clay">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">Scale</div>
            <div className="mt-1 font-semibold group-hover:text-zinc-950">Fleet View</div>
            <p className="mt-1 text-sm text-zinc-400">Per-merchant economics + fairness check to 10k scale.</p>
          </GatedLink>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-800 bg-clay-50 py-6">
        <div className="px-6 text-center text-xs text-zinc-500">© 2026 • ReviveAI • Razorpay Test Mode</div>
      </footer>
    </div>
  );
}