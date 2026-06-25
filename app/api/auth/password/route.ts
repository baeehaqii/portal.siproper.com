import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangePassword, persistToken, REMEMBER_TTL, REMEMBER_COOKIE } from "@/lib/sso";
import { verifyTurnstile } from "@/lib/turnstile";
import { kvIncr } from "@/lib/store";

// Brute-force throttle: per-username (the spoof-proof key — an attacker can rotate
// X-Forwarded-For but not the account being attacked) plus a looser best-effort IP cap.
// ponytail: two fixed-window counters; add a sliding window only if abuse shows up.
const RL_WINDOW_SEC = 15 * 60;
const RL_USER_MAX = 5;
const RL_IP_MAX = 20;

// In-modal login form posts here (password grant via the `pwd` client).
// Verifies the Cloudflare Turnstile token (same widget as sys2) and honors the
// "Ingat saya" choice.
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string; captchaToken?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Username dan password wajib diisi." }, { status: 400 });
  }

  // IP key is only meaningful behind a trusted proxy that overwrites the header;
  // the username key is what actually stops a single-account brute-force.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const overLimit =
    (await kvIncr(`rl:pwd:user:${username.toLowerCase()}`, RL_WINDOW_SEC)) > RL_USER_MAX ||
    (await kvIncr(`rl:pwd:ip:${ip}`, RL_WINDOW_SEC)) > RL_IP_MAX;
  if (overLimit) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan login. Coba lagi nanti." },
      { status: 429 },
    );
  }

  if (!(await verifyTurnstile(body.captchaToken, ip))) {
    return NextResponse.json({ ok: false, error: "Verifikasi keamanan gagal. Coba lagi." }, { status: 400 });
  }

  // Set the remember flag first so getSession picks the right cookie longevity.
  const store = await cookies();
  store.set(REMEMBER_COOKIE, body.remember ? "1" : "0", {
    maxAge: REMEMBER_TTL,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  try {
    const token = await exchangePassword(username, password);
    await persistToken(token, "pwd");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Username atau password salah." }, { status: 401 });
  }
}
