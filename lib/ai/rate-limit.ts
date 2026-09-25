/**
 * Sliding-window rate limiter for the AI chat endpoint.
 *
 * In-memory per-process buckets keyed by a caller identifier (user id / IP).
 * This is the minimum viable mechanism required by PRD §56 and is correct for
 * a single-instance deployment. For multi-instance or high-scale deployments
 * (the public widget in the next phase), swap this for a shared store (e.g.
 * Upstash Redis) — the call signature is the only surface the route uses.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/** Keep the Map from growing unboundedly once entries age out. */
const MAX_BUCKETS = 10_000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  const windowStart = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
  bucket.timestamps.push(now);

  if (buckets.size > MAX_BUCKETS) {
    for (const [candidate, value] of buckets) {
      if (value.timestamps.every((t) => t <= windowStart)) {
        buckets.delete(candidate);
      }
    }
  }

  if (bucket.timestamps.length > limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - now) / 1000),
    );
    return { ok: false, retryAfterSeconds };
  }

  return { ok: true };
}

/** Parse a positive integer from the environment with a fallback default. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
