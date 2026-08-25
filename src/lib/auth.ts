import crypto from "node:crypto";

export const DEMO_BATCH_TOKEN = "reviveai-demo-token";

export function isTokenAuthorized(provided: string | null): boolean {
  const expected = process.env.BATCH_TOKEN || DEMO_BATCH_TOKEN;
  const a = Buffer.from(provided ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
