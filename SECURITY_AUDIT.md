# ReviveAI — Security Audit

Last reviewed: 2026-09-02

## Authentication & Authorization

| Control | Status | Notes |
|---------|--------|-------|
| Auth.js v5 with JWT sessions | ✅ Implemented | `src/auth.ts` |
| Google OAuth provider | ✅ Configured | Optional, env-gated |
| Email/password credentials | ✅ Implemented | bcrypt hash, 12 rounds |
| Edge middleware route protection | ✅ Implemented | `src/middleware.ts` |
| Role-based access (RBAC) | ✅ Implemented | owner > approver > viewer |
| Council decisions restricted to owner/approver | ✅ Implemented | 403 on POST /api/council/decide |
| Session JWT contains merchant_ids | ✅ Implemented | Tenant isolation |

## Tenant Isolation

| Control | Status | Notes |
|---------|--------|-------|
| All queries accept merchantIds filter | ✅ Implemented | `src/lib/db/query.ts` |
| Empty merchantIds = admin (all data) | ✅ Implemented | By design |
| API routes pass session merchantIds | ✅ Implemented | All 9 protected API routes |
| Pages are async server components | ✅ Implemented | 10 pages |
| Auth test proves isolation | ✅ Implemented | `tests/auth.test.ts` — 8 tests |

## Data Security

| Control | Status | Notes |
|---------|--------|-------|
| Audit log is append-only | ✅ Enforced | No DELETE FROM audit_log in production code |
| Reports stored in Postgres (JSONB) | ✅ Implemented | `reports` table replaces file |
| pg_advisory_xact_lock for concurrency | ✅ Implemented | `src/lib/lock.ts` |
| No hardcoded secrets in code | ✅ Verified | Only env vars |
| .env files gitignored | ✅ Verified | `.gitignore` includes `.env*.local` |

## Input Validation

| Control | Status | Notes |
|---------|--------|-------|
| Promise text parser (ReDoS-safe) | ✅ Verified | `tests/security-regression.test.ts` — VULN-009 |
| CSV formula injection prevention | ✅ Implemented | `src/lib/csv.ts` — prefix escaping |
| Malformed report.json returns null | ✅ Verified | RELB-001 |
| Poisoned dataset resilience | ✅ Verified | `tests/security-regression-r2.test.ts` |
| API input validation | ✅ Implemented | All POST routes validate body |

## Rate Limiting & Concurrency

| Control | Status | Notes |
|---------|--------|-------|
| Token bucket rate limiting | ✅ Implemented | `src/lib/ratelimit.ts` — 20 req/min |
| Concurrent batch run prevention | ✅ Implemented | 409 on in-flight run |
| Server-authoritative seed/time | ✅ Verified | VULN-002/003 |

## Error Handling

| Control | Status | Notes |
|---------|--------|-------|
| API routes return structured errors | ✅ Implemented | { error: string } shape |
| Sentry error tracking | ✅ Configured | `sentry.*.config.ts` |
| Structured logging (pino) | ✅ Implemented | `src/lib/logger.ts` |
| Error boundary component | ✅ Implemented | `src/components/error-boundary.tsx` |

## Infrastructure

| Control | Status | Notes |
|---------|--------|-------|
| CI pipeline (lint → typecheck → test → build) | ✅ Implemented | `.github/workflows/ci.yml` |
| Security audit job in CI | ✅ Implemented | `npm audit --audit-level=high` |
| Health endpoint | ✅ Implemented | `GET /api/health` |
| Environment validation | ✅ Implemented | `src/lib/env.ts` |
| Vercel deployment | ✅ Ready | Auto-deploy on push to main |

## Known Residuals

| Item | Risk | Mitigation |
|------|------|-----------|
| `better-sqlite3` still in dependencies | Low | Only used in local dev/tests; not bundled in Vercel serverless |
| File-based report.json fallback | Low | Writes locally; ephemeral on Vercel; PG is primary |
| No HTTPS enforcement in dev | Low | Vercel provides HTTPS in production |
| Demo token removed | ✅ | Old `reviveai-demo-token` no longer in codebase |

## Recommended Next Steps

1. **Rotate AUTH_SECRET** quarterly in production
2. **Enable Sentry alerts** for 5xx errors in production
3. **Set up daily pg_dump** to S3 for audit log retention (RBI 7-year requirement)
4. **Add CSP headers** via `next.config.ts` headers() for XSS prevention
5. **Enable Vercel Web Analytics** for production traffic monitoring
