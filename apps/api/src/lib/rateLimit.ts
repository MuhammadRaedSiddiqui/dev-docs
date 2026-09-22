// apps/api/src/lib/rateLimit.ts
// Per-user/provider rate limiting for AI generation, backed by Upstash Redis.
//
// Uses a fixed-window counter: the first request in a window sets the key with
// a TTL, and subsequent requests INCR it. When Redis is not configured the
// limiter fails open (allows the request) so local/test runs are unaffected.
import { getRedis } from "./redis";

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  /** Seconds until the current window resets (best-effort). */
  resetIn:   number;
}

/**
 * Increment and check a fixed-window rate limit counter.
 *
 * @param key       Unique bucket key (e.g. `ai:stream:{userId}:{provider}`).
 * @param limit     Max requests allowed per window.
 * @param windowSec Window length in seconds.
 */
export async function checkRateLimit(
  key:       string,
  limit:     number,
  windowSec: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  // Fail open when Redis is unavailable — never block product traffic on a
  // missing cache dependency.
  if (!redis) return { allowed: true, remaining: limit, resetIn: windowSec };

  try {
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);

  // First hit in this window — set the expiry.
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }

    const ttl = await redis.ttl(redisKey);
    const resetIn = ttl > 0 ? ttl : windowSec;

    if (count > limit) {
      return { allowed: false, remaining: 0, resetIn };
    }

    return { allowed: true, remaining: Math.max(0, limit - count), resetIn };
  } catch {
    // A transient cache outage must not make AI generation unavailable.
    return { allowed: true, remaining: limit, resetIn: windowSec };
  }
}
