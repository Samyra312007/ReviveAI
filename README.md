# ReviveAI

> Autonomous revenue recovery agent for Indian merchants. Detect → Diagnose → Intervene → Recover.

ReviveAI is an AI-powered platform that recovers lost revenue from payment failures, checkout abandonment, failed subscriptions, and overdue invoices. Built for Indian merchants losing 8–15% of revenue annually, it runs a fully auditable pipeline bounded by 19 guardrails.

## Features

- **Detection** — 4 detectors classify failures by root cause with confidence scoring
- **Diagnosis** — Deterministic decision tree picks the right intervention per lifecycle stage
- **Guardrails** — 19 rules across retry, time, compliance, financial, voice, and promise categories
- **Recovery** — Razorpay Test API integration in live or simulated mode
- **Governance** — Human-in-the-loop Tuning Council for guardrail adjustments
- **What-If Console** — 5 sliders, instant re-simulation, baseline vs scenario
- **Two-Way Recovery** — Hinglish intent classification, dispute escalation, chat-parsed promises
- **Churn Prevention** — Risk scoring on healthy customers before failures occur
- **Fleet View** — Per-merchant economics + fairness check at scale

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Neon Postgres (via Drizzle ORM) |
| Auth | Auth.js v5 (Google OAuth + Credentials) |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Testing | Vitest |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 18+
- A Neon Postgres database (or local Postgres)
- Google OAuth credentials (optional)

### Installation

```bash
git clone https://github.com/your-org/reviveai.git
cd reviveai
npm install
```

### Environment Setup

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Required variables:

```env
DATABASE_URL=postgresql://user:pass@host/dbname
AUTH_SECRET=your-random-secret-here
AUTH_URL=http://localhost:3000

# Google OAuth (optional — leave empty to disable Google sign-in)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Database Setup

```bash
# Generate migration
npm run db:generate

# Run migration
npm run db:migrate

# (Optional) Seed with synthetic data
npm run generate-data
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm test` | Run test suite |
| `npm run generate-data` | Generate synthetic dataset |
| `npm run run-batch` | Execute a recovery batch |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Project Structure

```
reviveai/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Login & register pages
│   │   ├── api/                # API routes
│   │   │   ├── auth/           # Auth.js endpoints
│   │   │   ├── batch/          # Batch processing
│   │   │   ├── council/        # Tuning council
│   │   │   ├── simulate/       # What-if simulation
│   │   │   ├── records/        # Record queries
│   │   │   ├── audit/          # Audit log
│   │   │   ├── report/         # Report data
│   │   │   ├── promises/       # Promise tracking
│   │   │   ├── voice/          # Voice notifications
│   │   │   └── conversations/  # Two-way recovery
│   │   ├── dashboard/          # Main control center
│   │   ├── results/            # Recovery results
│   │   ├── timeline/           # Decision timeline
│   │   ├── council/            # Guardrail tuning
│   │   ├── simulator/          # What-if console
│   │   ├── guardrails/         # Guardrail report
│   │   ├── exceptions/         # Exception report
│   │   ├── audit/              # Full audit log
│   │   ├── voice/              # Voice notifications
│   │   ├── promises/           # Promise tracking
│   │   └── fleet/              # Multi-merchant view
│   ├── auth.ts                 # Auth.js configuration
│   ├── middleware.ts            # Route protection
│   ├── components/             # UI components
│   │   ├── landing/            # Landing page widgets
│   │   ├── nav.tsx             # Navigation bar
│   │   ├── ui.tsx              # Shared UI primitives
│   │   ├── session-provider.tsx
│   │   ├── timeline.tsx
│   │   ├── audit-log.tsx
│   │   ├── council-inbox.tsx
│   │   ├── live-processing.tsx
│   │   ├── what-if-console.tsx
│   │   ├── voice-preview.tsx
│   │   └── ...
│   └── lib/                    # Business logic
│       ├── db/                 # Database layer (Drizzle)
│       │   ├── schema.ts       # Table definitions
│       │   ├── pool.ts         # Connection pool
│       │   ├── query.ts        # Tenant-filtered queries
│       │   └── json.ts         # JSON helpers
│       ├── agent/              # AI agent logic
│       ├── detection/          # Failure detectors
│       ├── guardrails/         # Guardrail rules
│       ├── council/            # Tuning council
│       ├── batch/              # Batch processing
│       ├── simulator/          # Simulation engine
│       ├── voice/              # Voice notifications
│       ├── promise/            # Promise tracking
│       ├── conversation/       # Two-way recovery
│       ├── prevention/         # Churn prevention
│       ├── fleet/              # Fleet aggregation
│       ├── razorpay/           # Razorpay API client
│       ├── measurement/        # Metrics & accuracy
│       ├── audit/              # Audit logging
│       ├── auth.ts             # Legacy token auth (deprecated)
│       ├── lock.ts             # Advisory locking
│       └── ratelimit.ts        # Rate limiting
├── tests/                      # Test suite (17 files)
├── scripts/                    # Data generation & batch scripts
├── drizzle/                    # Generated migrations
└── drizzle.config.ts           # Drizzle Kit config
```

## Dashboard Pages

| Page | Route | Description |
|------|-------|-------------|
| Control Center | `/dashboard` | Hero metrics, live processing, category breakdown |
| Results | `/results` | Recovery results with accuracy metrics |
| Timeline | `/timeline` | Every decision in processing order |
| Council | `/council` | Guardrail tuning proposals & approvals |
| Simulator | `/simulator` | What-if console with 5 parameter sliders |
| Guardrails | `/guardrails` | Block report by rule |
| Exceptions | `/exceptions` | What the agent couldn't handle |
| Audit Log | `/audit` | Searchable, filterable, exportable |
| Voice | `/voice` | Voice notification analytics |
| Promises | `/promises` | Customer promise tracking |
| Fleet | `/fleet` | Multi-merchant economics & fairness |

## API Routes

All API routes require authentication (session-based via Auth.js).

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | GET/POST | Auth.js handlers |
| `/api/auth/register` | POST | Register new user |
| `/api/batch/run` | POST | Execute recovery batch |
| `/api/simulate` | POST | Run what-if simulation |
| `/api/council/proposals` | GET | List tuning proposals |
| `/api/council/decide` | POST | Approve/reject proposal (owner/approver only) |
| `/api/records` | GET | Query records |
| `/api/audit` | GET | Query audit log |
| `/api/report` | GET | Get latest report |
| `/api/promises` | GET | Query promises |
| `/api/voice` | GET | Query voice notifications |
| `/api/conversations` | GET | Query conversations |

## Authentication & Authorization

- **Auth.js v5** with JWT sessions
- **Providers:** Google OAuth + Email/Password credentials
- **Roles:** `owner`, `approver`, `viewer` (viewer = read-only)
- **Tenant isolation:** Each user sees only their assigned merchants' data via `merchant_ids` in the JWT
- **Middleware:** Edge middleware protects all dashboard pages and API routes

## Database Schema

9 tables in Neon Postgres:

| Table | Purpose |
|-------|---------|
| `records` | 150 synthetic recovery records |
| `promises` | Customer payment promises |
| `audit_log` | Append-only decision audit trail |
| `voice_notifications` | Voice channel analytics |
| `tuning_proposals` | Council governance proposals |
| `council_overrides` | Active guardrail overrides |
| `conversations` | Two-way recovery conversations |
| `reports` | Batch report snapshots (JSONB) |
| `credentials_users` | User accounts with roles & merchant access |

## Testing

```bash
npm test
```

179+ tests covering:
- Detection accuracy & confidence scoring
- Guardrail enforcement & edge cases
- Agent decision logic
- Simulator re-simulation
- Promise parsing & tracking
- Conversation intent classification
- Fleet aggregation
- Security regression checks
- Tenant isolation (merchant A ≠ merchant B)

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel dashboard
3. Set environment variables (see `.env.local.example`)
4. Deploy — Vercel handles build & serverless functions automatically

### Environment Variables for Production

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | Random secret for JWT signing |
| `AUTH_URL` | Production URL (e.g., `https://reviveai.vercel.app`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## License

MIT © 2026 ReviveAI Contributors

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
