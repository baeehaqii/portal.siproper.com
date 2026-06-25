import { NextRequest, NextResponse } from "next/server";
import { fetchAuthorization, sso } from "@/lib/sso";
import { mintHandoffCode } from "@/lib/handoff";

// Deep-link into sys2 with a seamless session handoff. Requires a Portal session;
// mints a one-time code and bounces the browser to sys2/sso/enter, which redeems
// it (back-channel) and logs the user into sys2's web session.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const to = params.get("to") || "/admin";
  const moduleKey = params.get("module") || "";

  const authz = await fetchAuthorization();
  if (!authz) {
    // not logged in → start login, come back to this same handoff URL
    const origin = new URL(req.url).origin;
    const self = `/api/go?to=${encodeURIComponent(to)}${moduleKey ? `&module=${moduleKey}` : ""}`;
    return NextResponse.redirect(`${origin}/api/auth/login?next=${encodeURIComponent(self)}`);
  }

  const code = await mintHandoffCode(authz.user_id);
  let url = `${sso.issuer}/sso/enter?code=${encodeURIComponent(code)}&to=${encodeURIComponent(to)}`;
  if (moduleKey) url += `&module=${encodeURIComponent(moduleKey)}`;
  return NextResponse.redirect(url);
}
