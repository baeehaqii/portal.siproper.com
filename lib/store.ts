import Redis from "ioredis";

/**
 * Tiny shared KV store. Uses Redis when REDIS_URL is set (production,
 * multi-instance), else an in-memory Map so local dev needs zero infra.
 * Used by handoff codes, the authz cache, and the password rate-limiter.
 *
 * ponytail: the in-memory fallback is single-process only — fine for dev.
 * Set REDIS_URL in prod so these work across instances (CONTRACT P0#6).
 */

let redis: Redis | null | undefined;
function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  redis = url ? new Redis(url, { maxRetriesPerRequest: 2 }) : null;
  return redis;
}

type Item = { v: string; exp: number };
const mem = new Map<string, Item>();
function memGet(key: string): string | null {
  const it = mem.get(key);
  if (!it) return null;
  if (it.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return it.v;
}

export async function kvGet(key: string): Promise<string | null> {
  const r = client();
  return r ? r.get(key) : memGet(key);
}

export async function kvSet(key: string, val: string, ttlSec: number): Promise<void> {
  const r = client();
  if (r) {
    await r.set(key, val, "EX", ttlSec);
    return;
  }
  mem.set(key, { v: val, exp: Date.now() + ttlSec * 1000 });
}

// Atomic read-and-delete — one-time codes can't be redeemed twice (even racing).
export async function kvGetDel(key: string): Promise<string | null> {
  const r = client();
  if (r) return r.getdel(key);
  const v = memGet(key);
  mem.delete(key);
  return v;
}

// Atomic increment, sets the TTL on the first hit. Returns the new count.
export async function kvIncr(key: string, ttlSec: number): Promise<number> {
  const r = client();
  if (r) {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, ttlSec);
    return n;
  }
  const cur = memGet(key);
  const exp = cur ? mem.get(key)!.exp : Date.now() + ttlSec * 1000;
  const n = (cur ? parseInt(cur, 10) : 0) + 1;
  mem.set(key, { v: String(n), exp });
  return n;
}
