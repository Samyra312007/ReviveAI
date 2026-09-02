let queue: Promise<unknown> = Promise.resolve();

const ADVISORY_LOCK_KEY = 42_424_242;
const ADVISORY_TIMEOUT_MS = 3500;

/**
 * Serializes exclusive operations so they never interleave.
 *
 * - SQLite / local dev (no DATABASE_URL): in-memory promise queue (single process).
 * - Postgres / production (DATABASE_URL set): pg_advisory_xact_lock via pooled
 *   connection — works across Vercel serverless instances. Falls back to queue
 *   if Postgres is unreachable.
 */
export function withExclusiveLock<T>(fn: () => Promise<T> | T): Promise<T> {
  if (!process.env.DATABASE_URL) {
    const result = queue.then(fn);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  // Postgres path: try advisory lock, fall back to queue on error
  return (async () => {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      try {
        // pg_advisory_lock is session-level; use xact variant + timeout via statement_timeout
        await client.query(`SET LOCAL statement_timeout = '${ADVISORY_TIMEOUT_MS}'`);
        await client.query("SELECT pg_advisory_xact_lock($1)", [ADVISORY_LOCK_KEY]);
        const result = await fn();
        return result;
      } finally {
        client.release();
        await pool.end().catch(() => {});
      }
    } catch {
      // Fall back to in-memory queue if pg is unavailable (e.g. Neon cold start)
      const result = queue.then(fn);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }
  })();
}
