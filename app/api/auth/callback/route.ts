import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, getSession } from "@/lib/sso";
import { isAllowedNext } from "@/lib/targets";

// OAuth2 callback: validate state, exchange code+verifier for tokens, persist
// the session. State is validated against the server-side record (the session),
// not a value echoed by the browser — anti-CSRF per CONTRACT §1.1.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const session = await getSession();
  const expectedState = session.state;
  const codeVerifier = session.codeVerifier;
  const next = session.next;

  // one-shot: clear transient values regardless of outcome
  session.state = undefined;
  session.codeVerifier = undefined;
  session.next = undefined;

  if (error) {
    await session.save();
    return fail(url, `idp_error:${error}`);
  }
  if (!code || !state || !expectedState || !codeVerifier || state !== expectedState) {
    await session.save();
    return fail(url, "invalid_state");
  }

  try {
    const token = await exchangeCode(code, codeVerifier);
    session.accessToken = token.access_token;
    session.refreshToken = token.refresh_token;
    session.expiresAt = Date.now() + token.expires_in * 1000;
    session.grantClient = "sso";
    await session.save();
  } catch {
    await session.save();
    return fail(url, "token_exchange_failed");
  }

  // Continue to where the user was headed (validated at /login), else home.
  // Relative paths (e.g. /api/go?to=…) resolve against the Portal origin.
  if (next && isAllowedNext(next)) {
    return NextResponse.redirect(next.startsWith("/") ? new URL(next, url.origin) : next);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}

function fail(url: URL, reason: string) {
  return NextResponse.redirect(new URL(`/?login_error=${reason}`, url.origin));
}
