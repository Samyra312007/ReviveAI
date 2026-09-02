# Retention Policy — ReviveAI Audit Trail (RBI Immutability)

## Principle
**Audit log is append-only.** Every batch run generates a `run_id` (`run_<timestamp>_<seed>`) and inserts 150 rows tagged with that id. No `DELETE FROM audit_log` is executed in production. Dashboard queries filter to `latest run_id` via `getLatestRunId()` (`src/lib/db/query.ts`), preserving full history for compliance audits.

## Retention
- **Duration:** 7 years (RBI guideline for financial transaction records).
- **Storage:** Neon Postgres `audit_log` table with `run_id` + `timestamp` indexes (`idx_audit_run_id`). Daily `pg_dump` to S3 (Neon branch snapshots), 7-day rolling local backup, monthly cold archive.
- **Access:** `getAllAuditRows()` exists for auditors; dashboard uses `getAuditRows()` (latest run only) to avoid double-counting.

## Snapshot Reports
Each run also inserts into `reports` table (Postgres) and `data/report.json` (local fallback). Reports are immutable snapshots — never updated, only inserted.

## Token Rotation
- `BATCH_TOKEN` / `NEXT_PUBLIC_BATCH_TOKEN` must match and be rotated quarterly.
- Generate: `openssl rand -base64 32`
- Update Vercel env, redeploy, revoke old token immediately. Demo fallback `reviveai-demo-token` is for `NODE_ENV=test` only.

## Verification
- `npm test` includes `tests/e2e.test.ts` check that 150 rows are appended per run, not overwritten.
- Health endpoint `GET /api/health` reports `report.age_hours` to detect stale snapshots.
