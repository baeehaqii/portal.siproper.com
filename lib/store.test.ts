import assert from "node:assert";
import { kvGet, kvSet, kvGetDel, kvIncr } from "./store.ts";

// In-memory fallback self-check (no REDIS_URL). Run: node --experimental-strip-types lib/store.test.ts
async function main() {
  // set/get
  await kvSet("a", "1", 60);
  assert.equal(await kvGet("a"), "1");

  // TTL expiry: a past ttl is read back as gone
  await kvSet("b", "x", -1);
  assert.equal(await kvGet("b"), null, "expired key should be gone");

  // getdel is one-time
  await kvSet("c", "once", 60);
  assert.equal(await kvGetDel("c"), "once");
  assert.equal(await kvGetDel("c"), null, "second redeem must be null");

  // incr increments and counts within the window
  assert.equal(await kvIncr("n", 60), 1);
  assert.equal(await kvIncr("n", 60), 2);
  assert.equal(await kvIncr("n", 60), 3);

  console.log("store self-check OK");
}

main();
