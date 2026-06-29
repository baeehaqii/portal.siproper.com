import { NextRequest, NextResponse } from "next/server";
import { fetchAuthorization, getSession, sso } from "@/lib/sso";
import { mintHandoffCode } from "@/lib/handoff";
import { signinPath } from "@/lib/targets";

// Deep-link into sys2 with a seamless session handoff. Requires a Portal session;
// mints a one-time code and bounces the browser to sys2/sso/enter, which redeems
// it (back-channel) and logs the user into sys2's web session.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const to = params.get("to") || "/admin";
  const moduleKey = params.get("module") || "";

  // fresh: re-validate against sys2, ignoring the short authz cache. This is the
  // single-logout guard — if the user logged out on sys2 (token revoked), we must
  // NOT mint a handoff that would silently re-create their sys2 session.
  const authz = await fetchAuthorization({ fresh: true });
  if (!authz) {
    // Not logged in, or the Portal token was revoked by a sys2-side logout. End the
    // Portal session too (single-logout) and bounce to the home login modal, carrying
    // this handoff URL as `next` so a fresh login resumes the deep-link. We're in a
    // Route Handler, so mutating the session cookie here is allowed.
    await (await getSession()).destroy();
    const origin = new URL(req.url).origin;
    const self = `/api/go?to=${encodeURIComponent(to)}${moduleKey ? `&module=${moduleKey}` : ""}`;
    return NextResponse.redirect(`${origin}${signinPath(self, moduleKey || undefined)}`);
  }

  const code = await mintHandoffCode(authz.user_id);
  let url = `${sso.issuer}/sso/enter?code=${encodeURIComponent(code)}&to=${encodeURIComponent(to)}`;
  if (moduleKey) url += `&module=${encodeURIComponent(moduleKey)}`;
  return NextResponse.redirect(url);
}
