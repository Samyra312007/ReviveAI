interface Bucket {
  tokens: number;
  lastRefill: number;
}

const CAPACITY = 20;
const REFILL_INTERVAL_MS = 60_000;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function checkRateLimit(
  key: string,
  capacity: number = CAPACITY,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed > REFILL_INTERVAL_MS) {
    const refillCycles = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket.tokens = Math.min(capacity, bucket.tokens + refillCycles * capacity);
    bucket.lastRefill += refillCycles * REFILL_INTERVAL_MS;
  }

  if (bucket.tokens <= 0) {
    return { allowed: false, remaining: 0 };
  }
  bucket.tokens--;
  return { allowed: true, remaining: bucket.tokens };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "local";
}
