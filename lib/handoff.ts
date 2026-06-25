import { randomBytes } from "crypto";
import { kvSet, kvGetDel } from "./store";

/**
 * One-time session-handoff codes. After a Portal login (form or SSO), the Portal
 * mints a short-lived code so sys2 can establish its OWN web session for the same
 * user without a second login. sys2 redeems the code over a back-channel (shared
 * secret) — the code never carries the identity itself.
 *
 * Backed by the shared store so codes survive across instances (Redis in prod,
 * in-memory in dev). TTL + one-time semantics come from the store.
 */
const TTL_SEC = 60;
const KEY = (code: string) => `handoff:${code}`;

export async function mintHandoffCode(sub: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await kvSet(KEY(code), sub, TTL_SEC);
  return code;
}

// One-time: returns the sub and deletes the code. null if missing/expired.
export async function redeemHandoffCode(code: string): Promise<string | null> {
  return kvGetDel(KEY(code));
}

export const handoffSecret = process.env.SSO_HANDOFF_SECRET || "";
