/**
 * Single-flight (request coalescing) via Upstash Redis.
 *
 * When many users request the SAME uncached scenario at once, only the first
 * should call Gemini (slow + costs tokens). The rest wait and read the result
 * the winner writes to the cache. Without this, N concurrent users = N
 * redundant ~10s Gemini calls and N× the token spend.
 *
 * Fails open: if Redis isn't configured or errors, every caller just proceeds
 * (degrades to "each generates its own" — same as before, never blocks).
 */
import { isRedisConfigured, env } from '@/config/env.config';

async function getRedis() {
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: env.upstashRedisRestUrl!, token: env.upstashRedisRestToken! });
}

/** Try to acquire a lock. Returns true if WE own it (or Redis is absent). */
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (!isRedisConfigured()) return true;
  try {
    const redis = await getRedis();
    const res = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
    return res === 'OK';
  } catch (e) {
    console.warn('[singleFlight] acquire failed, proceeding without lock:', e instanceof Error ? e.message : e);
    return true; // fail open
  }
}

export async function releaseLock(key: string): Promise<void> {
  if (!isRedisConfigured()) return;
  try {
    const redis = await getRedis();
    await redis.del(key);
  } catch { /* non-critical */ }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `produce` under a single-flight lock keyed by `lockKey`.
 * - Winner: runs produce(), then releases the lock.
 * - Loser: polls `readResult` until the winner populates the cache, then returns it.
 *          Falls back to running produce() itself if the wait times out.
 */
export async function runSingleFlight<T>(opts: {
  lockKey: string;
  lockTtlSeconds?: number;
  waitMs?: number;
  pollMs?: number;
  readResult: () => Promise<T | null>;
  produce: () => Promise<T>;
}): Promise<{ result: T; coalesced: boolean }> {
  const { lockKey, lockTtlSeconds = 70, waitMs = 50_000, pollMs = 1_500, readResult, produce } = opts;

  const iAmOwner = await acquireLock(lockKey, lockTtlSeconds);
  if (iAmOwner) {
    try {
      const result = await produce();
      return { result, coalesced: false };
    } finally {
      await releaseLock(lockKey);
    }
  }

  // Someone else is generating — wait for their cached result.
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const cached = await readResult();
    if (cached != null) return { result: cached, coalesced: true };
  }

  // Waited too long — generate ourselves rather than fail.
  const result = await produce();
  return { result, coalesced: false };
}
