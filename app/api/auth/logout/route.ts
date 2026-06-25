import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, sso, REMEMBER_COOKIE } from "@/lib/sso";

// Single logout: clear the Portal session, then hand off to sys2's /sso/logout
// which ends the sys2 web session, revokes this user's Passport tokens, and
// redirects back to the Portal "thank you" page. See CONTRACT §7.
export async function GET(req: NextRequest) {
  const session = await getSession();
  session.destroy();
  (await cookies()).delete(REMEMBER_COOKIE);

  const origin = new URL(req.url).origin;
  const thankYou = `${origin}/logout-success`;
  return NextResponse.redirect(`${sso.issuer}/sso/logout?redirect=${encodeURIComponent(thankYou)}`);
}
