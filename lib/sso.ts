import { createHash, randomBytes } from "crypto";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { kvGet, kvSet } from "./store";

/**
 * Portal BFF — OAuth2 Authorization Code + PKCE client against sys2 (IdP).
 * See docs/CONTRACT.md. Tokens stay server-side, sealed in an encrypted
 * httpOnly cookie (iron-session).
 *
 * ponytail: cookie-sealed session + PKCE/state in the same cookie is the
 * zero-infra path for local end-to-end testing. CONTRACT P0#6 wants PKCE/state
 * and the session in Redis with a __Host- pre-session cookie for production —
 * swap the store when this graduates past the login smoke test.
 */

export const sso = {
  issuer: required("SSO_ISSUER"), // sys2 base URL, e.g. http://127.0.0.1:8000
  clientId: required("SSO_CLIENT_ID"),
  clientSecret: required("SSO_CLIENT_SECRET"),
  redirectUri: required("SSO_REDIRECT_URI"),
  scope: "profile authz",
};

// Two clients: `sso` (authorization_code + PKCE, seamless deep-links + 2FA) and
// `pwd` (password grant, the in-modal form). A token must be refreshed with the
// SAME client that issued it, so we record which one on the session.
type GrantClient = "sso" | "pwd";
const CLIENTS: Record<GrantClient, { id: string; secret: string }> = {
  sso: { id: sso.clientId, secret: sso.clientSecret },
  pwd: { id: required("SSO_PWD_CLIENT_ID"), secret: required("SSO_PWD_CLIENT_SECRET") },
};

export type Session = {
  // transient (during the auth flow)
  state?: string;
  codeVerifier?: string;
  next?: string; // deep-link to continue to after login
  // established session
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  grantClient?: GrantClient; // which client issued the tokens (for refresh)
  sub?: string;
};

const sessionOptions: SessionOptions = {
  password: required("SESSION_SECRET"), // >= 32 chars
  cookieName: "portal_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax", // survives the top-level GET callback redirect from sys2
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

// "Ingat saya": a plain `portal_remember` cookie drives the session ttl (=cookie
// maxAge), so every save() keeps the chosen longevity. 30 days vs 1 day.
export const REMEMBER_TTL = 60 * 60 * 24 * 30;
const DEFAULT_TTL = 60 * 60 * 24;
export const REMEMBER_COOKIE = "portal_remember";

export async function getSession() {
  const c = await cookies();
  const remember = c.get(REMEMBER_COOKIE)?.value === "1";
  return getIronSession<Session>(c, { ...sessionOptions, ttl: remember ? REMEMBER_TTL : DEFAULT_TTL });
}

// --- PKCE / state helpers (RFC 7636, S256) ---

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkce() {
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export const randomState = () => b64url(randomBytes(16));

export function authorizeUrl(state: string, codeChallenge: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: sso.clientId,
    redirect_uri: sso.redirectUri,
    scope: sso.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${sso.issuer}/oauth/authorize?${q}`;
}

export async function exchangeCode(code: string, codeVerifier: string) {
  return tokenRequest("sso", {
    grant_type: "authorization_code",
    code,
    redirect_uri: sso.redirectUri,
    code_verifier: codeVerifier,
  });
}

// Password grant (in-modal form). Portal sees the credentials; bypasses 2FA, so
// the modal also offers SSO for 2FA accounts. Issued by the `pwd` client.
export async function exchangePassword(username: string, password: string) {
  return tokenRequest("pwd", {
    grant_type: "password",
    username,
    password,
    scope: sso.scope,
  });
}

export async function refresh(refreshToken: string, client: GrantClient) {
  return tokenRequest(client, { grant_type: "refresh_token", refresh_token: refreshToken });
}

// Single-flight refresh (CONTRACT D5): concurrent calls with the same refresh
// token share one request, so we don't fire N rotations and trip reuse-detection.
// ponytail: in-process only — cross-instance dup-refresh is rare and tolerated
// (refresh reuse-detection is Fase 4, out of v1 scope).
const inflightRefresh = new Map<string, Promise<TokenResponse>>();
function refreshSingleFlight(refreshToken: string, client: GrantClient) {
  const existing = inflightRefresh.get(refreshToken);
  if (existing) return existing;
  const p = refresh(refreshToken, client).finally(() => inflightRefresh.delete(refreshToken));
  inflightRefresh.set(refreshToken, p);
  return p;
}

// Store issued tokens on the session, remembering which client issued them.
export async function persistToken(token: TokenResponse, client: GrantClient) {
  const session = await getSession();
  session.accessToken = token.access_token;
  session.refreshToken = token.refresh_token;
  session.expiresAt = Date.now() + token.expires_in * 1000;
  session.grantClient = client;
  await session.save();
}

type TokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
};

async function tokenRequest(client: GrantClient, params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${sso.issuer}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: CLIENTS[client].id,
      client_secret: CLIENTS[client].secret,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export type Authorization = {
  user_id: string;
  roles: string[];
  modules: Record<string, boolean>;
  permissions: string[];
  tenants: { proyek_ids: number[]; area_ids: number[] };
  fetched_at: string;
};

// CONTRACT §3.3: short-TTL cache so revocation propagates within ≤120s.
const AUTHZ_TTL_SEC = 60;
// Keyed by access-token hash — a refresh rotates the token and so naturally
// invalidates the cache. Hash, not the raw token, to keep tokens out of keys.
const authzKey = (token: string) => "authz:" + createHash("sha256").update(token).digest("hex");

/**
 * Fetch the user's identity & authorization from sys2. Caches the payload for a
 * short TTL (§3.3), refreshes the access token via single-flight when it has
 * expired or sys2 answers 401 (§5/D5). Returns null when there is no usable
 * session (caller should send the user to /api/auth/login).
 *
 * ponytail: no §4 grace/fail-closed — that's normative for resource servers
 * doing destructive writes; Portal only reads (UI gating), so it's moot here.
 */
export async function fetchAuthorization(): Promise<Authorization | null> {
  const session = await getSession();
  if (!session.accessToken) return null;

  const applyRefresh = async (): Promise<boolean> => {
    if (!session.refreshToken) return false;
    try {
      const t = await refreshSingleFlight(session.refreshToken, session.grantClient ?? "sso");
      session.accessToken = t.access_token;
      session.refreshToken = t.refresh_token ?? session.refreshToken;
      session.expiresAt = Date.now() + t.expires_in * 1000;
      await session.save();
      return true;
    } catch {
      return false;
    }
  };

  // Proactive refresh if (nearly) expired.
  if (session.expiresAt && session.expiresAt < Date.now() + 5000) {
    if (!(await applyRefresh())) return null;
  }

  const cached = await kvGet(authzKey(session.accessToken));
  if (cached) return JSON.parse(cached) as Authorization;

  const get = (token: string) =>
    fetch(`${sso.issuer}/api/me/authorization`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

  let res = await get(session.accessToken);
  if (res.status === 401) {
    if (!(await applyRefresh())) return null;
    res = await get(session.accessToken);
  }
  if (!res.ok) return null;

  const authz = (await res.json()) as Authorization;
  await kvSet(authzKey(session.accessToken), JSON.stringify(authz), AUTHZ_TTL_SEC);
  return authz;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
