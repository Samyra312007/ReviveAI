/**
 * Validate required environment variables at startup.
 * Call this once in the server entrypoint or a top-level module.
 */
export function validateEnv() {
  const warnings: string[] = [];

  if (!process.env.AUTH_SECRET) {
    warnings.push("AUTH_SECRET is not set, auth will not work in production");
  }

  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL is not set, using SQLite fallback (local dev only)");
  }

  if (warnings.length > 0 && process.env.NODE_ENV === "production") {
    console.warn("[env] Production warnings:");
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  return { warnings };
}

/**
 * Get a required env var or throw in production.
 */
export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val ?? "";
}
