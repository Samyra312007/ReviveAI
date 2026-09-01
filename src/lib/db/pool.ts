import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_pool) {
    _pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    _pool.on("error", (err) => {
      console.error("[db/pool] unexpected idle client error", err);
    });
  }
  return _pool;
}

export function getDrizzle() {
  const pool = getPool();
  if (!pool) return null;
  if (!_db) {
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export function isPostgresEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function checkPostgresHealth(): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
