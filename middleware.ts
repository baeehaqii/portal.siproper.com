import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Disable bfcache / browser caching on the auth-bearing pages. Without this, the
// browser Back button resurrects a stale logged-in render after a sys2-side logout
// ("tiba-tiba login lagi"). no-store forces a fresh server render that re-checks the
// session, so logout is reflected on Back/forward navigation.
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  matcher: ["/", "/dashboard"],
};
