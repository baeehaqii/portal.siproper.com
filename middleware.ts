import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie names mirror lib/sso.ts. Not imported here: middleware runs on the edge
// runtime and lib/sso pulls in node crypto + env required(). Keep in sync.
const SESSION_COOKIE = "portal_session";
const REMEMBER_COOKIE = "portal_remember";

// Two jobs on the auth-bearing pages:
//
// 1. no-store — stop bfcache resurrecting a stale logged-in render after a
//    sys2-side logout ("tiba-tiba login lagi"). Forces a fresh server render
//    that re-checks the session on Back/forward navigation.
//
// 2. /logout-success is the canonical "you are logged out" landing for BOTH
//    Portal- and sys2-initiated logout. sys2's /sso/logout redirects the browser
//    here but cannot touch the Portal iron-session cookie, so a sys2-initiated
//    logout left the Portal session alive — the user returned to "/" still
//    logged in. The thank-you page is a Server Component and can't clear cookies
//    during render, so we clear them here. Makes single-logout symmetric
//    regardless of who initiated it; harmless/idempotent for the Portal-initiated
//    path (which already destroyed the session in /api/auth/logout).
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, must-revalidate");

  if (req.nextUrl.pathname === "/logout-success") {
    res.cookies.delete(SESSION_COOKIE);
    res.cookies.delete(REMEMBER_COOKIE);
  }

  return res;
}

export const config = {
  matcher: ["/", "/dashboard", "/logout-success"],
};
