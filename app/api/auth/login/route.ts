import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorizeUrl, getSession, pkce, randomState, REMEMBER_TTL, REMEMBER_COOKIE } from "@/lib/sso";
import { isAllowedNext } from "@/lib/targets";

// Start the OAuth2 Authorization Code + PKCE flow. Stash verifier+state (+the
// deep-link to continue to) in the encrypted session, then bounce to sys2.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  // remember choice carried from the modal (defaults to remembered for SSO)
  const store = await cookies();
  store.set(REMEMBER_COOKIE, params.get("remember") === "0" ? "0" : "1", {
    maxAge: REMEMBER_TTL,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const session = await getSession();
  const { codeVerifier, codeChallenge } = pkce();
  const state = randomState();

  const next = params.get("next");
  session.next = next && isAllowedNext(next) ? next : undefined;
  session.state = state;
  session.codeVerifier = codeVerifier;
  await session.save();

  return NextResponse.redirect(authorizeUrl(state, codeChallenge));
}
