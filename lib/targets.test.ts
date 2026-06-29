import assert from "node:assert";
import { isAllowedNext, signinPath } from "./targets.ts";

// Regression: logged-out deep-link recovery must route to the Portal home modal
// (/?signin=1&next=…), NOT to sys2's /oauth/authorize (which dead-ends at sys2's
// login page after a sys2-side logout). Run: node --experimental-strip-types lib/targets.test.ts
function main() {
  // happy path: relative deep-link + module are carried through
  {
    const p = signinPath("/api/go?to=%2Fadmin&module=teknik", "teknik");
    const u = new URL(p, "https://portal.siproper.com");
    assert.equal(u.pathname, "/");
    assert.equal(u.searchParams.get("signin"), "1");
    assert.equal(u.searchParams.get("next"), "/api/go?to=%2Fadmin&module=teknik");
    assert.equal(u.searchParams.get("m"), "teknik");
  }

  // anti open-redirect: a hostile `next` is dropped, but we still open the modal
  {
    const p = signinPath("//evil.example.com/phish");
    const u = new URL(p, "https://portal.siproper.com");
    assert.equal(u.searchParams.get("signin"), "1");
    assert.equal(u.searchParams.get("next"), null, "off-origin next must be dropped");
    assert.equal(u.searchParams.get("m"), null);
  }

  // sanity on the guard itself
  assert.equal(isAllowedNext("/api/go?to=/admin"), true);
  assert.equal(isAllowedNext("//evil.example.com"), false);
  assert.equal(isAllowedNext("https://sys2.siproper.com/admin"), true);

  console.log("targets.test.ts OK");
}

main();
