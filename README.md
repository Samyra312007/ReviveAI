# ReviveAI

<p align="center">
  <strong>Autonomous revenue recovery agent for Indian merchants</strong><br/>
  Detect → Diagnose → Intervene → Recover
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js%2016-App%20Router-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Postgres-Neon%20%2B%20Drizzle-0EA5E9" alt="Neon Postgres" />
  <img src="https://img.shields.io/badge/Auth.js-v5-3423A6" alt="Auth.js v5" />
  <img src="https://img.shields.io/badge/tests-204%20passing-brightgreen" alt="Tests" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
  <img src="https://img.shields.io/badge/guardrails-19%20rules-orange" alt="19 Guardrails" />
</p>

---

## Table of Contents

1. [What is ReviveAI?](#what-is-reviveai)
2. [The Problem](#the-problem)
3. [Architecture](#architecture)
4. [The Recovery Pipeline](#the-recovery-pipeline)
5. [Detection Engine](#detection-engine)
6. [Strategy Selection](#strategy-selection)
7. [Guardrails](#guardrails)
8. [Interventions](#interventions)
9. [Two-Way Recovery](#two-way-recovery)
10. [Voice Outreach](#voice-outreach)
11. [Promise Tracking & Escalation](#promise-tracking--escalation)
12. [Churn Prevention](#churn-prevention)
13. [Tuning Council](#tuning-council)
14. [What-If Simulator](#what-if-simulator)
15. [Fleet View](#fleet-view)
16. [Measurement & Reporting](#measurement--reporting)
17. [Tech Stack](#tech-stack)
18. [Getting Started](#getting-started)
19. [Environment Variables](#environment-variables)
20. [Scripts](#scripts)
21. [Project Structure](#project-structure)
22. [Dashboard Pages](#dashboard-pages)
23. [API Reference](#api-reference)
24. [Database Schema](#database-schema)
25. [Authentication & Tenancy](#authentication--tenancy)
26. [Data Flow Diagrams](#data-flow-diagrams)
27. [Testing](#testing)
28. [Observability](#observability)
29. [Security](#security)
30. [Contributing](#contributing)
31. [License](#license)

---

## What is ReviveAI?

ReviveAI is an **AI-powered revenue recovery platform** for Indian merchants. It automatically detects revenue leaks (failed payments, abandoned checkouts, failed subscriptions, and overdue invoices), diagnoses the root cause, chooses the right intervention, and executes recovery through Razorpay. Every decision the agent makes is **auditable, guardrail-bounded, and human-reviewable**.

### Core Capabilities

| # | Capability | What it does |
|---|-----------|--------------|
| 1 | **Detection** | 4 deterministic detectors classify failures by root cause with confidence scoring |
| 2 | **Diagnosis** | Confidence-based routing picks intervene / escalate / skip / no-action |
| 3 | **Guardrails** | 19 rules across retry, time, compliance, financial, voice, and promise categories |
| 4 | **Recovery** | Razorpay integration in live or simulated mode |
| 5 | **Governance** | Human-in-the-loop Tuning Council for guardrail adjustments |
| 6 | **What-If Console** | 5 sliders, instant re-simulation, baseline vs scenario |
| 7 | **Two-Way Recovery** | Hinglish intent classification, dispute escalation, chat-parsed promises |
| 8 | **Churn Prevention** | Risk scoring on healthy customers *before* failures occur |
| 9 | **Fleet View** | Per-merchant economics + fairness check at scale |
| 10 | **Multi-Channel Outreach** | Voice, WhatsApp, SMS, and email notifications |

---

## The Problem

Indian merchants lose **8-15% of annual revenue** to recoverable failures:

```mermaid
pie title Revenue Leak Sources (illustrative distribution)
    "Failed payments (insufficient funds, network timeouts)" : 38
    "Checkout abandonment" : 27
    "Failed subscriptions (mandate issues)" : 20
    "Overdue invoices" : 15
```

Each leak has a short recovery window. A customer who hit "insufficient funds" this morning is far more likely to pay tonight than next week, but the typical merchant has no automated way to act inside that window, and manual follow-up doesn't scale across thousands of customers.

ReviveAI closes that gap: it continuously watches for failures and intervenes **while the window is open**, inside hard limits that keep outreach compliant and customer-friendly.

---

## Architecture

ReviveAI is a Next.js 16 App Router application. Pages are React Server Components backed by direct database access; API routes handle mutations, batch execution, and webhooks.

```mermaid
flowchart TB
    subgraph Clients["Client Layer"]
        B["Browser<br/>Dashboard · Landing · Onboarding"]
        MP["Merchant Apps<br/>Razorpay"]
        WA["WhatsApp Cloud API"]
    end

    subgraph Edge["Edge Layer (Vercel)"]
        MW["middleware.ts<br/>JWT session guard<br/>redirects to /login"]
        R["next-auth route<br/>/api/auth catch-all handler"]
    end

    subgraph App["Application Layer (Node runtime)"]
        direction TB
        subgraph Pages["Server Components (RSC)"]
            P1["/dashboard"]
            P2["/records · /results"]
            P3["/council · /simulator"]
            P4["/voice · /promises · /fleet"]
        end
        subgraph APIRoutes["API Routes"]
            A1["/api/batch/run"]
            A2["/api/simulate"]
            A3["/api/council/*"]
            A4["/api/records · /api/audit"]
            A5["/api/webhooks/*"]
            A6["/api/cron/process"]
            A7["/api/merchants/*"]
        end
        subgraph CoreLib["Core Libraries (src/lib)"]
            direction LR
            AG["agent/<br/>core · strategy · context"]
            DET["detection/<br/>4 detectors + engine"]
            GR["guardrails/<br/>19 rules + engine"]
            RZ["razorpay/<br/>client · webhook"]
            VO["voice/ · conversation/<br/>promise/ · prevention/"]
            SIM["simulator/"]
            COU["council/analyzer"]
            MEA["measurement/<br/>accuracy · recovery · metrics"]
            AUD["audit/logger"]
        end
    end

    subgraph Data["Data Layer"]
        PG[("Neon Postgres<br/>13 tables via Drizzle ORM")]
        SQ[("SQLite fixture<br/>data/synthetic.db<br/>dev & test fallback")]
        RJ[("data/report.json<br/>generated snapshot")]
    end

    subgraph External["External Services"]
        RP["Razorpay API<br/>payments + webhooks"]
        RS["Resend<br/>email"]
        SL["Slack<br/>alerts"]
        WH["WhatsApp Cloud API<br/>voice/SMS delivery"]
        SN["Sentry<br/>error tracking"]
    end

    B -->|"HTTPS"| MW
    MW -->|"session OK"| Pages
    MW -->|"no session"| R
    B -->|"mutations"| APIRoutes
    MP -->|"payment.failed etc."| A5
    WA -->|"inbound customer replies"| A5

    Pages --> Q["db/query.ts<br/>tenant-filtered reads"]
    APIRoutes --> CoreLib
    CoreLib --> Q
    Q --> PG
    Q -.->|"no DATABASE_URL"| SQ
    CoreLib --> AUD
    AUD --> PG

    A1 --> RP
    A5 --> RP
    VO --> WH
    MEA --> RS
    MEA --> SL
    App -.-> SN
```

### Repository Layout at a Glance

```mermaid
flowchart LR
    subgraph src
        direction TB
        APP["app/<br/>routes: pages + API"]
        COMP["components/<br/>RSC + client widgets"]
        LIB["lib/<br/>all business logic"]
    end
    APP --> COMP
    APP --> LIB
    COMP --> LIB
    TESTS["tests/<br/>18 files · 204 tests"]
    SCRIPTS["scripts/<br/>generate-data · run-batch · import-razorpay-data"]
    DRIZZLE["drizzle/<br/>SQL migrations"]
    TESTS -.-> LIB
    SCRIPTS --> LIB
    DRIZZLE -.-> LIB
```

---

## The Recovery Pipeline

Every record flows through the same deterministic pipeline. The agent never acts without passing detection, strategy, and guardrails first.

```mermaid
flowchart TB
    START(["Records loaded<br/>150 synthetic / live imports"]) --> GEN["Data Generator<br/>seeded RNG · reproducible"]
    GEN --> DET1["1 · DETECT<br/>4 detectors classify root cause<br/>confidence + urgency scoring"]
    DET1 --> ROUTE{"Route by<br/>confidence"}
    ROUTE -->|"> 0.7"| INT
    ROUTE -->|"0.4 to 0.7"| ESC
    ROUTE -->|"< 0.4 or infeasible"| SKIP

    INT["2 · DIAGNOSE<br/>Deterministic decision tree<br/>picks intervention by<br/>failure type + lifecycle stage"] --> GR1["3 · GUARDRAIL<br/>19 rules evaluated in order<br/>first failure blocks the action"]
    GR1 -->|"all pass"| EXEC
    GR1 -->|"blocked"| BLOCK

    EXEC["4 · INTERVENE<br/>Razorpay payment link / retry<br/>or simulated executor"] --> OUT{"Outcome"}
    OUT -->|"paid"| RECOV["recovered<br/>amount + time logged"]
    OUT -->|"no response"| FAILED["failed<br/>retry budget respected"]
    OUT -->|"API error"| ERRESC["escalated<br/>error captured in audit"]

    ESC["escalate<br/>→ manual · churn-prevention · legal"] --> AUD
    SKIP["skip<br/>window closed · too small<br/>low confidence"] --> AUD
    BLOCK["blocked<br/>rule_id + reason logged"] --> AUD
    RECOV --> AUD
    FAILED --> AUD
    ERRESC --> AUD

    AUD["5 · AUDIT<br/>append-only audit_log<br/>every decision with<br/>reasoning + guardrail checks"] --> REP["6 · REPORT<br/>accuracy · recovery · guardrail<br/>cost-benefit · prevention"]
    REP --> DONE(["Persisted to reports table<br/>rendered on every dashboard page"])
```

### End-to-End Sequence

```mermaid
sequenceDiagram
    autonumber
    participant C as Cron / User
    participant API as /api/batch/run
    participant S as batch/service
    participant A as agent/core
    participant D as detection
    participant G as guardrails
    participant R as Razorpay
    participant DB as Postgres

    C->>API: POST (session or Bearer CRON_SECRET)
    API->>S: executeBatchRun()
    S->>DB: load pending records (tenant-filtered)
    S->>A: runBatch(records, options)
    loop per record
        A->>D: detectRecord(record, now)
        D-->>A: category · subcategory · confidence · route
        alt route = intervene
            A->>A: selectStrategy(lifecycle, urgency)
            A->>G: evaluateGuardrails(action, ctx)
            alt all 19 rules pass
                A->>R: execute action (retry / link / mandate)
                R-->>A: payment result (or simulated)
            else rule blocked
                G-->>A: block(rule_id, reason)
            end
        else route = escalate / skip
            Note over A: no API call, logged only
        end
        A->>DB: append audit entry
    end
    A->>S: decisions + audit + report
    S->>DB: persist report JSONB
    S-->>API: processed · recovery_rate · accuracy
    API-->>C: 200 OK with report summary
```

---

## Detection Engine

Four detectors classify each record by root cause. Detection is **deterministic and explainable** (no black boxes), with an urgency score and confidence-based routing on top.

| Detector | Input record type | Key signals |
|----------|------------------|-------------|
| `detectPaymentFailure` | `payment_failure` | failure reason → subcategory (insufficient funds, network timeout, fraud hold, expired card…), recency, customer history |
| `detectSubscriptionFailure` | `subscription_failure` | mandate lifecycle stage, retry window, amount |
| `detectCheckoutAbandonment` | `checkout_abandonment` | time since cart creation, urgency window (minutes-hours) |
| `detectOverdueInvoice` | `overdue_invoice` | aging bucket (7/14/30 day late), invoice amount, B2B segment |

```mermaid
flowchart LR
    REC["SyntheticRecord"] --> E["detectRecord()"]
    E --> P["PaymentFailure"]
    E --> S["SubscriptionFailure"]
    E --> C["CheckoutAbandonment"]
    E --> I["OverdueInvoice"]
    P & S & C & I --> SIG["DetectionSignal<br/>subcategory · confidence"]
    SIG --> UR["computeUrgency()<br/>0…1 from recency + value"]
    SIG --> FB{"feasible?"}
    FB -->|"window closed<br/>or amount too small"| SK["route = skip"]
    FB -->|"yes"| CF{"confidence"}
    CF -->|">= 0.7"| IV["route = intervene"]
    CF -->|"0.4 to 0.7"| ES["route = escalate"]
    CF -->|"< 0.4"| NA["route = no_action"]
```

**Routing thresholds** (from `src/lib/detection/types.ts`):

| Route | Condition | Meaning |
|-------|-----------|---------|
| `intervene` | confidence ≥ 0.7 | act autonomously |
| `escalate` | 0.4 ≤ confidence < 0.7 | human review |
| `skip` | infeasible (window closed, amount too small) or unclassifiable | do nothing |
| `no_action` | control-group / healthy customers | track only |

---

## Strategy Selection

Once routed to intervene, a deterministic decision tree maps failure type + lifecycle stage to one of **18 strategy actions**:

```mermaid
flowchart TB
    S["selectStrategy()"] --> PF{"failure type?"}

    PF -->|payment_failure| PF1{"subcategory?"}
    PF1 -->|insufficient_funds| RETRY["RETRY_IN_24H / RETRY_IN_48H /<br/>RETRY_IMMEDIATELY"]
    PF1 -->|expired_card| RCU["REQUEST_CARD_UPDATE"]
    PF1 -->|fraud_hold| SKIPA["SKIP → audit only"]

    PF -->|checkout_abandonment| CBT{"window left?"}
    CBT -->|"> 15 min"| CRW["CART_REMINDER_WHATSAPP<br/>SMS_PAYMENT_LINK"]
    CBT -->|"expired"| ECR["EMAIL_CART_RECOVERY"]

    PF -->|subscription_failure| SUB{"lifecycle stage?"}
    SUB -->|mandate_retry| MR["MANDATE_RETRY"]
    SUB -->|card_update| CUR["CARD_UPDATE_REQUEST"]
    SUB -->|terminal| ECP["ESCALATE_TO_CHURN_PREVENTION"]

    PF -->|overdue_invoice| INV{"aging bucket?"}
    INV -->|7 day late| GR2["GENTLE_REMINDER"]
    INV -->|14 day late| FN["FIRM_NOTICE"]
    INV -->|30+ day late| PPO["PAYMENT_PLAN_OFFER"]
    INV -->|90+ day late| EL["ESCALATE_LEGAL"]
```

All 18 actions (`StrategyAction` in `src/lib/agent/strategy.ts`):

`RETRY_IN_24H` · `RETRY_IN_48H` · `RETRY_IMMEDIATELY` · `REQUEST_CARD_UPDATE` · `ESCALATE_TO_MANUAL` · `SKIP` · `CART_REMINDER_WHATSAPP` · `SMS_PAYMENT_LINK` · `EMAIL_CART_RECOVERY` · `MANDATE_RETRY` · `CARD_UPDATE_REQUEST` · `ESCALATE_TO_CHURN_PREVENTION` · `GENTLE_REMINDER` · `FIRM_NOTICE` · `PAYMENT_PLAN_OFFER` · `ESCALATE_LEGAL` · `PREVENT_CARD_UPDATE` · `NO_ACTION`

---

## Guardrails

19 rules bound every intervention. They are evaluated in a fixed order and the **first failure blocks the action** with a machine-readable reason. All agent behavior is subject to them, including the simulator.

```mermaid
flowchart TB
    ACT["Proposed action<br/>(strategy)"] --> ENG["evaluateGuardrails()"]
    ENG --> RP{"A · Retry limits"}
    RP --> A1["A1 max retries per record"]
    RP --> A2["A2 max retries per customer per day"]
    RP --> A3["A3 max interventions per batch %"]
    RP -->|"ok"| TP{"B · Time windows"}
    RP -->|"any fail"| BLK["BLOCKED<br/>rule_id + reason<br/>logged to audit"]
    TP --> B1["B1 no interventions during<br/>IST quiet hours"]
    TP --> B2["B2 min hours between retries"]
    TP --> B3["B3 checkout nudge window"]
    TP --> B4["B4 subscription retry window"]
    TP -->|"any fail"| BLK
    TP -->|"ok"| CP{"C · Compliance"}
    CP --> C1["C1 max SMS per customer per day"]
    CP --> C2["C2 respect DND preferences"]
    CP --> C3["C3 skip fraud-flagged accounts"]
    CP --> C4["C4 above approval threshold →<br/>manual approval required"]
    CP -->|"any fail"| BLK
    CP -->|"ok"| FP{"D · Financial"}
    FP --> D1["D1 max single intervention amount"]
    FP --> D2["D2 max daily recovery volume"]
    FP --> D3["D3 auto-skip if cost > % of amount"]
    FP -->|"any fail"| BLK
    FP -->|"ok"| VP{"F · Voice"}
    VP --> F1["F1 max voice calls per week"]
    VP --> F2["F2 no voice before 09:00 / after 20:00 IST"]
    VP --> F3["F3 max voice attempts → text fallback"]
    VP --> F4["F4 never force voice (opt-in only)"]
    VP -->|"any fail"| BLK
    VP -->|"ok"| GP{"G · Promises"}
    GP --> G1["G1 max promise renewals per record"]
    GP -->|"any fail"| BLK
    GP -->|"ok"| PASS["PASS → execute intervention"]
```

| Category | Rules | Purpose |
|----------|-------|---------|
| **A · Retry** | A1, A2, A3 | Cap retries per record / customer / batch |
| **B · Time** | B1-B4 | Quiet hours, cooldowns, intervention windows |
| **C · Compliance** | C1-C4 | SMS limits, DND, fraud flags, approval thresholds |
| **D · Financial** | D1-D3 | Amount caps, daily volume, cost-efficiency |
| **F · Voice** | F1-F4 | Weekly call caps, calling hours, opt-in respect |
| **G · Promise** | G1 | Promise renewal limits |

Every guardrail parameter lives in `GuardrailConfig` (e.g. `maxRetriesPerRecord`, `cooldownHours`, `checkoutNudgeWindowHours`, `approvalThresholdPaise`). Values can be tuned via the Council (see below) and are **hard-capped** so no approval can set unbounded values.

---

## Interventions

Actions are executed through a `RazorpayExecutor` abstraction, so the same code path runs live or simulated:

```mermaid
flowchart LR
    ACTION["StrategyAction"] --> EX{"Executor mode"}
    EX -->|"live<br/>(RAZORPAY keys set)"| LIVE["Razorpay API<br/>payment links · retries<br/>mandates"]
    EX -->|"simulated<br/>(no keys / tests / simulator)"| SIMX["Deterministic RNG<br/>5s timeout + retry<br/>same interface"]
    LIVE --> RES{"result"}
    SIMX --> RES
    RES -->|success| OK["recovered"]
    RES -->|declined| NO["failed"]
    RES -->|exception| ESCA["escalated<br/>error in audit"]
```

- **Live mode:** real API calls with 5-second timeouts and per-call retry.
- **Simulated mode:** used by tests, the What-If console, and any environment without Razorpay keys. Outputs are statistically realistic (RNG-driven) but never touch the network.
- **Webhook ingestion:** `payment.failed`, `subscription.failed`, `invoice.expired`, `payment.captured`, `refund.*` events are mapped into the records table (see [Webhooks](#api-reference)).

---

## Two-Way Recovery

Recovery isn't just outbound. Customers reply, and the conversation engine classifies intent and resolves accordingly.

```mermaid
flowchart TB
    IN["Inbound customer message<br/>(WhatsApp webhook)"] --> CLS{"classifyIntent()<br/>Hinglish patterns"}
    CLS --> PROMISE["promise<br/>'Friday tak kar dunga'"]
    CLS --> HARDSHIP["hardship<br/>'Is month paisa nahi hai'"]
    CLS --> REFUSAL["refusal"]
    CLS --> DISPUTE["dispute"]
    CLS --> RTP["ready_to_pay"]
    PROMISE --> PP["parsePromiseText()<br/>amount + due date extracted<br/>PromiseRecord created"]
    HARDSHIP --> PPO["payment_plan_offered"]
    REFUSAL --> REF["refused"]
    DISPUTE --> ESC["escalated_dispute"]
    RTP --> RTR["retry_recovered / retry_failed"]
    PP --> RES["resolution recorded<br/>outcome override applied"]
    PPO --> RES
    REF --> RES
    ESC --> RES
    RTR --> RES
```

**Intents:** `promise` · `hardship` · `refusal` · `dispute` · `ready_to_pay`
**Resolutions:** `promise_created` · `promise_noted_existing` · `payment_plan_offered` · `refused` · `escalated_dispute` · `retry_recovered` · `retry_failed` · `unresolved_manual`

A `promise` intent feeds `parsePromiseText`, which extracts amount and due date from free-form Hinglish ("₹25000 Monday se pehle") and creates a tracked promise with its own escalation ladder.

---

## Voice Outreach

Voice is the highest-touch channel, so it has its own strategy layer plus four dedicated guardrails (F1-F4):

```mermaid
flowchart TB
    DEC["Record decision"] --> VS["selectVoiceStrategy()"]
    VS -->|"control group"| NOV["NO_VOICE"]
    VS -->|"voice_opt_in = false"| SKV["SKIP_VOICE<br/>(rule F4)"]
    VS -->|"action → template"| TMP{"template mapping"}
    TMP -->|"retry actions"| V01["VT-01/02/03<br/>payment nudge (Hinglish)"]
    TMP -->|"invoice reminders"| V06["VT-06 gentle · VT-07 firm"]
    V01 & V06 --> WIN{"within 09:00-20:00 IST?<br/>(rule F2)"}
    WIN -->|"no"| HOLD["hold until window opens"]
    WIN -->|"yes"| DLV{"deliverVoice()"}
    DLV -->|"92%"| WAP["delivered via WhatsApp"]
    DLV -->|"8%"| SMSF["SMS fallback → 85%"]
    WAP & SMSF --> RESP{"customer_responded?"}
    RESP -->|"~18% of delivered"| RESPT["clicked_link · called_back · replied"]
    RESP -->|no| NOP["no response"]
```

- 7 Hinglish templates (`VT-01`…`VT-07`) covering payment nudges, cart reminders, and invoice escalations.
- The dashboard `/voice` page renders every template with a **Web Speech API preview** so reviewers can hear the script without a TTS provider.
- Delivery is simulated by default (`simulated-tts-v1`); metrics (delivery rate, response rate, recovery via voice) are computed in `lib/voice/tracker.ts`.

---

## Promise Tracking & Escalation

When a customer promises to pay, the promise gets its own lifecycle:

```mermaid
stateDiagram-v2
    [*] --> pending: promise parsed from chat
    pending --> fulfilled: payment received by due date
    pending --> overdue: due date passes
    pending --> renewed: customer asks for more time (≤ G1 limit)
    renewed --> overdue: new due date passes
    overdue --> escalated_t1: Tier 1 reminder
    escalated_t1 --> escalated_t2: no response
    escalated_t2 --> escalated_t3: no response
    escalated_t3 --> manual: handed to ops
    fulfilled --> [*]: recovered_amount logged
    manual --> [*]
```

`parsePromiseText` extracts `{amount, due_date}` from free text; `processPromises` advances state on each batch; `escalationTier` returns the current tier and next action. Renewals are capped by guardrail **G1**.

---

## Churn Prevention

Prevention runs *before* failures happen, scoring currently-healthy customers by risk:

```mermaid
flowchart LR
    H["Healthy customers<br/>(control records)"] --> SC["assessPreventionRisk()"]
    SC --> F1S["recency & frequency<br/>of past payments"]
    SC --> F2S["avg order value vs<br/>customer segment"]
    SC --> F3S["payment method health"]
    F1S & F2S & F3S --> SCORE{"risk score"}
    SCORE -->|"> 0.55"| PCU["PREVENT_CARD_UPDATE<br/>proactive outreach"]
    SCORE -->|"≤ 0.55"| MON["continue monitoring"]
```

Escalation to `ESCALATE_TO_CHURN_PREVENTION` (from terminal subscription failures) also lands in this flow. The threshold (`PREVENTION_SCORE_THRESHOLD = 0.55`) is a constant, documented, and tested.

---

## Tuning Council

The Council is ReviveAI's **human-in-the-loop governance layer**. The agent proposes, humans decide, and rejected proposals are remembered so the agent never re-proposes the same change.

```mermaid
flowchart TB
    BLK["Guardrail blocks from batch<br/>(rule_id · record · recovery probability)"] --> AN["council/analyzer<br/>generateTuningProposals()"]
    AN --> FILT{"filters"}
    FILT -->|"blocked ≥3 high-probability records"| PROP1["propose parameter change<br/>(e.g. double B3 window)"]
    FILT -->|"already pending / overridden /<br/>rejected / at hard cap"| SUPP["suppress proposal"]
    PROP1 --> DBP["tuning_proposals table<br/>status = pending"]
    DBP --> UI["/council inbox"]
    UI --> DEC2{"owner / approver"}
    DEC2 -->|"approve"| OVR["council_overrides updated<br/>next batch uses new value"]
    DEC2 -->|"reject"| REJ["status = rejected<br/>parameter suppressed forever"]
    DEC2 -->|"defer"| PEND["stays pending"]
```

Proposal rules enforced by tests:

- A rule that blocked **≥ 1 record with avg recovery probability > 0.5** generates a proposal (zero-probability blocks never do).
- Parameters with a pending proposal, an active override, a prior rejection, or at their hard cap are **never re-proposed**.
- Approved overrides are picked up by the next batch automatically via `resolveGuardrailConfig`.

---

## What-If Simulator

The simulator re-runs the exact production pipeline (same detectors, same guardrails, same strategy tree) against configurable overrides, so operators can measure the impact of a guardrail change **before** asking the Council for it.

```mermaid
flowchart LR
    BASE["Baseline batch<br/>(default config)"] --> ENG["runBatch()<br/>simulatedExecutor = true"]
    SC["5 slider values<br/>maxRetriesPerRecord · cooldownHours ·<br/>checkoutNudgeWindowHours ·<br/>approvalThresholdPaise · dailyRecoveryCap"] --> CFG["resolveGuardrailConfig(overrides)"]
    CFG --> ENG
    ENG --> DIFF["Scenario summary<br/>interventions · recovered · blocked ·<br/>escalated · skipped"]
    DIFF --> UI["Side-by-side<br/>baseline vs scenario"]
```

Because the executor is simulated and the RNG is seeded, results are **deterministic**: same inputs always produce the same comparison, and `clampOverrides` enforces the same hard caps the Council respects.

---

## Fleet View

The fleet page aggregates per-merchant economics and checks for fairness across the portfolio:

```mermaid
flowchart TB
    REC["records + audit_log<br/>across all merchants"] --> AGG["buildFleetSummary()"]
    AGG --> MER["Per-merchant rows<br/>recovered · at-risk · ROI"]
    AGG --> ARR["ARR projection"]
    AGG --> FAIR{"fairness check"}
    FAIR -->|"recovery rate gap<br/>between merchants"| FLAG["FairnessFlag raised"]
    FAIR -->|"within tolerance"| OKF["no flags"]
    MER --> UI["/fleet table"]
    ARR --> UI
    FLAG --> UI
```

---

## Measurement & Reporting

Every batch produces a full report persisted as JSONB and rendered across the dashboard:

```mermaid
flowchart TB
    DEC["decisions[]"] --> M1["accuracy.ts<br/>precision · recall · F1<br/>vs ground truth"]
    DEC --> M2["recovery.ts<br/>at-risk · recovered · rate<br/>avg time-to-recovery · by category"]
    DEC --> M3["metrics.ts<br/>operational counts<br/>cost-benefit · ROI<br/>prevention impact"]
    DEC --> M4["guardrail block stats<br/>total · rate · by rule"]
    M1 & M2 & M3 & M4 --> REP2["buildReport()<br/>typed BatchReport"]
    REP2 --> DB2[("reports table<br/>JSONB snapshot")]
    DB2 --> PAGES["/dashboard · /results · /guardrails ·<br/>/exceptions · /audit"]
    M2 --> AL["Slack / email alerts<br/>on batch failure"]
```

Metrics include: hero numbers (recovered ₹, at-risk ₹, recovery rate %, ROI), accuracy vs ground truth (the synthetic dataset ships with labeled ground truth), guardrail block rate and per-rule breakdown, exceptions (what the agent couldn't handle), and prevention impact.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router, Turbopack) | React 19, RSC-first |
| Language | TypeScript (strict) | `tsc --noEmit` in CI |
| Database | Neon Postgres | serverless Postgres |
| ORM | Drizzle ORM + drizzle-kit | typed schema, SQL migrations |
| Auth | Auth.js v5 | Google OAuth + credentials |
| Styling | Tailwind CSS v4 | PostCSS pipeline |
| State | Zustand | client-side stores |
| Testing | Vitest | 18 files, 204 tests |
| Logging | pino | structured JSON logs |
| Errors | Sentry | server + edge configs |
| Payments | Razorpay | live + simulated modes |
| Email | Resend | transactional + alerts |
| Chat | WhatsApp Cloud API | inbound replies, outbound voice/SMS |
| Alerts | Slack incoming webhooks | batch failure notifications |
| Deployment | Vercel | cron via `vercel.json` |

---

## Getting Started

### Prerequisites

- Node.js 18+ (CI runs Node 22)
- npm
- A Neon Postgres database (or any Postgres), *optional*: the app falls back to a local SQLite fixture without it
- Google OAuth credentials, *optional*

### Installation

```bash
git clone https://github.com/Samyra312007/ReviveAI.git
cd ReviveAI
npm install
```

### Environment Setup

```bash
cp .env.local.example .env.local
```

### Database Setup

```bash
# Generate migration (only if you changed the schema)
npm run db:generate

# Run migrations
npm run db:migrate

# Seed SQLite fixture with synthetic data (always works, no DB needed)
npm run generate-data
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **No Postgres?** The app runs in **file-only mode**: `src/lib/db/index.ts` provisions a local SQLite database (`data/synthetic.db`) with the same schema, and every query layer transparently falls back to it. This is how tests stay hermetic.

### First Batch Run

```bash
npm run run-batch
```

This loads records, runs the full pipeline (detect → diagnose → guardrail → intervene → audit), and prints the report: recovery rate, accuracy, guardrail blocks, and per-category breakdown.

---

## Environment Variables

All variables are optional except where noted; the app degrades gracefully (simulated delivery, file-only storage) when integrations are absent.

### Core

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | | Postgres connection string. Absent ⇒ SQLite fixture mode |
| `AUTH_SECRET` | Yes | Secret for JWT session signing |
| `AUTH_URL` | | Canonical app URL for Auth.js |
| `CRON_SECRET` | | Bearer token required by `/api/cron/process` |

### OAuth

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional provider) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

### Payments

| Variable | Description |
|----------|-------------|
| `RAZORPAY_KEY_ID` | Razorpay API key. Absent ⇒ simulated executor |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies webhook signatures (HMAC-SHA256) |

### Notifications & Alerts

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for transactional email |
| `RESEND_FROM_EMAIL` | Verified sender address |
| `ALERT_EMAIL` | Recipient for batch alerts |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook for batch alerts |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender phone number ID |

### Observability

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (server + edge). Absent ⇒ Sentry disabled |

> Tests blank these variables (see `vitest.config.ts`) so the suite never leaks credentials or fires real network calls.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint (must be error-free in CI) |
| `npm run typecheck` | TypeScript checking (`tsc --noEmit`) |
| `npm test` | Run test suite (auto-generates data first) |
| `npm run generate-data` | Generate synthetic dataset → SQLite + report |
| `npm run run-batch` | Execute a recovery batch end-to-end |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Drizzle Studio |

---

## Project Structure

```mermaid
flowchart TB
    ROOT["ReviveAI/"]

    subgraph SRC["src/"]
        direction TB
        AUTHF["auth.ts · Auth.js v5 config<br/>(Google + Credentials providers)"]
        MWF["middleware.ts · edge JWT guard"]

        subgraph APPDIR["app/ · Next.js App Router"]
            direction LR
            PAGES["Dashboard pages<br/>/ · /dashboard · /records/[id]<br/>/results · /timeline · /council<br/>/simulator · /guardrails · /exceptions<br/>/audit · /voice · /promises · /fleet<br/>/onboarding · /settings/notifications"]
            AUTHPAGES["(auth)/<br/>login · register"]
            API["api/<br/>auth · batch/run · simulate<br/>council · records · audit · report<br/>promises · voice · conversations<br/>merchants · webhooks · cron · health"]
        end

        subgraph COMPDIR["components/"]
            direction LR
            UI["ui.tsx primitives<br/>nav · timeline · audit-log<br/>council-inbox · live-processing<br/>what-if-console · voice-preview"]
            LANDING["landing/<br/>count-up · mini-simulator · gated-link"]
        end

        subgraph LIBDIR["lib/ · business logic"]
            direction LR
            PIPELINE["agent/ · detection/<br/>guardrails/ · batch/"]
            CHANNELS["voice/ · conversation/<br/>promise/ · prevention/<br/>notification/"]
            PLATFORM["db/ · razorpay/ · council/<br/>simulator/ · fleet/ · measurement/<br/>audit/ · data/ · crypto.ts<br/>logger.ts · lock.ts · ratelimit.ts"]
        end
    end

    subgraph SUPPORT["Tooling & data"]
        direction LR
        TESTS["tests/ · 18 Vitest files<br/>204 tests"]
        SCRIPTS["scripts/ · generate-data<br/>run-batch · import-razorpay-data"]
        MIGR["drizzle/ · SQL migrations"]
        DOCS["docs/retention-policy.md"]
        CONFIG["next.config.ts · drizzle.config.ts<br/>vitest.config.ts · vercel.json (cron)"]
    end

    ROOT --> SRC
    ROOT --> SUPPORT
    APPDIR --> LIBDIR
    COMPDIR --> LIBDIR
    TESTS -.-> LIBDIR
    SCRIPTS --> LIBDIR
    MIGR -.-> LIBDIR
```

Key entry points:

| Path | Role |
|------|------|
| `src/app/page.tsx` | Public landing page |
| `src/auth.ts` | Auth.js v5: Google OAuth + credentials, role & merchant claims in the JWT |
| `src/middleware.ts` | Edge-compatible session guard for all protected routes |
| `src/lib/agent/core.ts` | The recovery pipeline orchestrator (`runBatch`) |
| `src/lib/guardrails/rules.ts` | All 19 guardrail rules in one table |
| `src/lib/db/index.ts` | Postgres/SQLite dual-driver data layer |
| `src/lib/db/query.ts` | Tenant-filtered queries used by every page and route |

---

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Product overview with mini-simulator |
| Control Center | `/dashboard` | Hero metrics, live processing, category breakdown |
| Records | `/records` | All recovery records with outcomes; detail at `/records/[id]` |
| Results | `/results` | Recovery results with accuracy metrics |
| Timeline | `/timeline` | Every decision in processing order |
| Council | `/council` | Guardrail tuning proposals & approvals |
| Simulator | `/simulator` | What-if console with 5 parameter sliders |
| Guardrails | `/guardrails` | Block report by rule |
| Exceptions | `/exceptions` | What the agent couldn't handle |
| Audit Log | `/audit` | Searchable, filterable, exportable |
| Voice | `/voice` | Templates with browser TTS preview + analytics |
| Promises | `/promises` | Customer promise tracking |
| Fleet | `/fleet` | Multi-merchant economics & fairness |
| Onboarding | `/onboarding` | 3-step merchant setup wizard |
| Settings | `/settings/notifications` | Quiet hours, channels, daily limits |

---

## API Reference

All routes live under `/api` and require a session unless noted. Mutations additionally enforce roles.

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/health` | GET | public | Liveness: DB mode/status/latency, report freshness, env flags |
| `/api/auth/[...nextauth]` | GET/POST | public | Auth.js handlers |
| `/api/auth/register` | POST | public | Register (email + password, role, merchants) |
| `/api/batch/run` | POST | session | Execute recovery batch |
| `/api/simulate` | POST | session | Run what-if simulation |
| `/api/council/proposals` | GET | session | List tuning proposals |
| `/api/council/decide` | POST | owner/approver | Approve / reject / defer proposal |
| `/api/records` | GET | session | Query records (tenant-filtered) |
| `/api/audit` | GET | session | Query audit log |
| `/api/report` | GET | session | Latest batch report |
| `/api/promises` | GET | session | Query promises |
| `/api/voice` | GET | session | Query voice notifications |
| `/api/conversations` | GET | session | Query conversations |
| `/api/merchants/connect` | POST | session | Store Razorpay keys (encrypted at rest) |
| `/api/merchants/import` | POST | session | Import historical failed payments |
| `/api/merchants/prefs` | POST | session | Update notification preferences |
| `/api/merchants/status` | GET | session | Razorpay connection status |
| `/api/webhooks/razorpay` | POST | HMAC signature | Ingest Razorpay events → records |
| `/api/webhooks/whatsapp` | GET/POST | Meta verification | Inbound customer replies → conversations |
| `/api/cron/process` | GET | `Bearer CRON_SECRET` | Hourly batch trigger (Vercel Cron) |

---

## Database Schema

13 tables in Postgres (identical schema mirrored in the SQLite fixture):

```mermaid
erDiagram
    credentials_users ||--o{ merchants : owns
    merchants {
        text merchant_id PK
        text user_id FK
        text business_name
        text razorpay_key_id
        text razorpay_key_secret_enc
        text webhook_secret_enc
        jsonb notification_prefs
    }
    credentials_users {
        text id PK
        text email UK
        text password_hash
        text role
        jsonb merchant_ids
    }
    records ||--o{ promises : has
    records ||--o{ audit_log : produces
    records ||--o{ voice_notifications : generates
    records |o--o| conversations : may_have
    records {
        text record_id PK
        text merchant_id
        text customer_id UK
        text type
        text subcategory
        integer amount
        text currency
        timestamp failure_timestamp
        jsonb ground_truth
    }
    promises {
        text promise_id PK
        text record_id FK
        integer promised_amount
        timestamp due_date
        text status
        integer renewal_count
    }
    audit_log {
        serial id PK
        text run_id
        text record_id
        text selected_strategy
        jsonb guardrail_checks
        text outcome
        integer amount_recovered
    }
    voice_notifications {
        text notification_id PK
        text record_id
        text template_id
        text channel
        text delivery_status
        boolean customer_responded
    }
    conversations {
        text record_id PK
        jsonb turns
        text intent
        text resolution
    }
    tuning_proposals {
        text proposal_id PK
        text rule_id
        text parameter
        float proposed_value
        text status
    }
    council_overrides {
        text parameter PK
        float value
        text proposal_id
    }
    reports {
        serial id PK
        jsonb report
        jsonb merchant_ids
    }
```

Auth.js adapter tables (`users`, `accounts`, `sessions`, `verification_token`) support Google OAuth and are omitted above for brevity.

| Table | Purpose |
|-------|---------|
| `records` | Recovery records: 150 synthetic rows or live Razorpay imports |
| `promises` | Customer payment promises (from chat parsing) |
| `audit_log` | Append-only decision audit trail |
| `voice_notifications` | Voice channel analytics |
| `tuning_proposals` | Council governance proposals |
| `council_overrides` | Active guardrail overrides |
| `conversations` | Two-way recovery conversations |
| `reports` | Batch report snapshots (JSONB) |
| `credentials_users` | User accounts with roles & merchant access |
| `merchants` | Razorpay-connected businesses with encrypted keys |

---

## Authentication & Tenancy

```mermaid
flowchart TB
    U["User"] -->|"credentials or Google"| AUTH["Auth.js v5<br/>JWT sessions"]
    AUTH --> JWT["JWT payload:<br/>id · role · merchantIds"]
    JWT --> MW["middleware.ts<br/>(edge)"]
    MW -->|"no token"| LOGIN["redirect /login<br/>with callbackUrl"]
    MW -->|"token"| RB["dashboard / API"]
    RB --> Q["db/query.ts<br/>every read/write takes<br/>merchantIds filter"]
    Q --> PG2[("rows scoped by<br/>merchant_id")]
    ROLE{"role check"}
    ROLE -->|owner| FULL["full control incl.<br/>council decisions"]
    ROLE -->|approver| APPR["council decisions"]
    ROLE -->|viewer| READ["read-only"]
```

- **Providers:** Google OAuth + email/password (bcrypt-hashed via `credentials_users`).
- **Roles:** `owner`, `approver`, `viewer`. Viewers are read-only; council decisions require `owner` or `approver`.
- **Tenant isolation:** every query in `lib/db/query.ts` accepts the session's `merchantIds` and filters by `merchant_id`. Tests assert merchant A never sees merchant B's rows.
- **Middleware:** edge-compatible JWT check (no DB import) protects all dashboard pages; API routes self-guard with 401s.

---

## Data Flow Diagrams

### Webhook ingestion flow

```mermaid
flowchart TB
    subgraph Razorpay
        RZ["payment.failed · subscription.failed ·<br/>invoice.expired · payment.captured · refund.*"]
    end
    RZ -->|"POST + X-Razorpay-Signature"| VERIFY{"verifyRazorpaySignature<br/>HMAC-SHA256"}
    VERIFY -->|"invalid"| R403["403 rejected"]
    VERIFY -->|"valid"| MAP["mapRazorpayEvent()"]
    MAP -->|"failure events"| INS["upsert into records<br/>merchant-scoped"]
    MAP -->|"captured / refund"| NULLI["ignored (not a leak)"]
    INS --> NEXT["picked up by next batch"]
```

### WhatsApp reply flow

```mermaid
flowchart TB
    CUST["Customer replies<br/>(WhatsApp)"] --> WAH["POST /api/webhooks/whatsapp"]
    WAH --> VER2{"Meta verification"}
    VER2 -->|"invalid"| R403B["403"]
    VER2 -->|"valid"| TURNS["append ConversationTurn"]
    TURNS --> INTENT["classifyIntent() (Hinglish)"]
    INTENT --> RES2["resolution + optional<br/>PromiseRecord / retry"]
    RES2 --> DB3[("conversations table")]
```

### Cron → alert flow

```mermaid
flowchart LR
    VC["Vercel Cron<br/>hourly ('0 * * * *')"] -->|"Bearer CRON_SECRET"| CRON["GET /api/cron/process"]
    CRON --> EXEC["executeBatchRun()"]
    EXEC -->|"200"| OKR["persist report"]
    EXEC -->|"non-200 / throw"| ALERT["sendBatchAlert()"]
    ALERT --> SLA["Slack webhook<br/>and/or Resend email"]
```

---

## Testing

```bash
npm test
```

**18 files · 204 tests**, all hermetic (env vars blanked, SQLite fixture, simulated providers):

| Suite | Covers |
|-------|--------|
| `detection.test.ts` | 4 detectors, subcategories, routing thresholds, feasibility |
| `guardrails.test.ts` | 19 rules, block reasons, config clamping |
| `agent.test.ts` | Pipeline orchestration, outcomes, escalation |
| `council.test.ts` | Proposal generation, suppression rules, decisions |
| `simulator.test.ts` | Determinism, slider clamping, baseline diff |
| `voice.test.ts` | Template selection, IST window, delivery & fallback, metrics |
| `promise-parser.test.ts` | Hinglish promise text → amount + date |
| `promise-tracker.test.ts` | Lifecycle transitions, renewals |
| `promise-escalation.test.ts` | Tier ladder |
| `conversation.test.ts` | Intent classification, resolutions |
| `fleet.test.ts` | Aggregation, ARR projection, fairness flags |
| `generator.test.ts` | Synthetic data reproducibility (seeded RNG) |
| `webhook-notifications.test.ts` | HMAC verification, event mapping, encryption |
| `auth.test.ts` | Session/JWT behavior |
| `security-regression.test.ts` (+ r2) | Post-remediation guarantees, ReDoS, tenant isolation |
| `e2e.test.ts` | Full pipeline end-to-end |

CI runs on every push/PR to `main`: **lint → typecheck → tests → build**, plus a dependency-audit job.

---

## Observability

- **Structured logging:** pino with per-module child loggers (`lib/logger.ts`).
- **Error tracking:** Sentry via `sentry.server.config.ts` + `sentry.edge.config.ts` (only active with a DSN and in production).
- **Health endpoint:** `GET /api/health` reports DB mode (`postgres`/`sqlite`), status, latency, report age, and env flags, and returns 503 when unhealthy.
- **Batch alerts:** failures are pushed to Slack and/or email (`lib/notification/alerts.ts`).
- **Audit log:** every decision is persisted with reasoning, guardrail checks, API call details, outcome, amount, and time-to-recovery.

---

## Security

| Control | Implementation |
|---------|----------------|
| Secret encryption | Razorpay key secrets + webhook secrets encrypted at rest (`lib/crypto.ts`, `enc:v1:` format, random IV) |
| Webhook verification | HMAC-SHA256 signature checks for Razorpay; Meta verification for WhatsApp |
| Tenant isolation | `merchantIds` filter enforced in the query layer + regression tests |
| RBAC | owner / approver / viewer roles enforced on mutations |
| Rate limiting | `lib/ratelimit.ts` on sensitive routes |
| Advisory locking | `lib/lock.ts` prevents concurrent batch double-runs |
| Append-only audit | `audit_log` is written, never updated |
| Security tests | Dedicated regression suites assert all of the above |
| Data retention | Documented in `docs/retention-policy.md` |

A full remediation history is available in [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide: fork, branch, `npm test && npm run lint && npm run typecheck`, then open a PR. Please make sure CI-relevant checks pass locally before opening a PR.

---

## License

MIT © 2026 ReviveAI Contributors. See [LICENSE](LICENSE).
