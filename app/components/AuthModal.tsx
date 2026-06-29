"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ShieldCheck, LogIn, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";
import { TARGETS } from "@/lib/targets";

// Cloudflare Turnstile global (script loaded on demand).
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export default function AuthModal({
  moduleTitle,
  next,
  onClose,
}: {
  moduleTitle: string;
  next: string;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [captchaToken, setCaptchaToken] = useState("");
  const [loading, setLoading] = useState<"form" | "sso" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // createPortal targets document.body, which only exists on the client. When the
  // modal is opened on the initial render (initialSignin, after a logged-out deep-link),
  // rendering the portal during SSR would throw. Defer to after mount.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Render the Turnstile widget (same one sys2 uses).
  useEffect(() => {
    if (!SITE_KEY) return;
    let widgetId: string | undefined;

    function render() {
      if (!captchaRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(captchaRef.current, {
        sitekey: SITE_KEY,
        theme: "light",
        language: "id",
        callback: (t: string) => setCaptchaToken(t),
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => setCaptchaToken(""),
      });
    }

    if (window.turnstile) {
      render();
    } else if (!document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) {
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.defer = true;
      s.onload = render;
      document.head.appendChild(s);
    } else {
      const iv = setInterval(() => {
        if (window.turnstile) {
          clearInterval(iv);
          render();
        }
      }, 200);
      return () => clearInterval(iv);
    }

    return () => {
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("form");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, captchaToken, remember }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal masuk. Coba lagi.");
        setLoading(null);
        setCaptchaToken("");
        return;
      }
      window.location.href = next;
    } catch {
      setError("Tidak dapat terhubung. Coba lagi.");
      setLoading(null);
    }
  }

  function ssoLogin() {
    setLoading("sso");
    window.location.href = `/api/auth/login?next=${encodeURIComponent(next)}&remember=${remember ? "1" : "0"}`;
  }

  const busy = loading !== null;
  const captchaRequired = !!SITE_KEY;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal aria-label="Masuk">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(12px) saturate(140%)", WebkitBackdropFilter: "blur(12px) saturate(140%)" }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl ring-1 ring-white/20"
        style={{ background: "rgba(255,255,255,0.94)", backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Tutup"
        >
          <X className="h-5 w-5" strokeWidth={2} />
        </button>

        <div className="px-7 pb-7 pt-9">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <ShieldCheck className="h-6 w-6" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink-900">Masuk untuk lanjut</h2>
              <p className="mt-1 text-sm text-ink-500">
                Akses modul <span className="font-medium text-ink-700">{moduleTitle}</span> memerlukan akun SiProper.
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-ink-700">
                Email atau Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                placeholder="nama@siproper.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-ink-400 transition-colors hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-ink-600 select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-ink-300 text-brand-500 focus:ring-brand-500"
                />
                Ingat saya
              </label>
              <a
                href={`${TARGETS.help}/submit`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                Lupa password?
              </a>
            </div>

            {captchaRequired && <div ref={captchaRef} className="flex min-h-[65px] justify-center" />}

            <button
              type="submit"
              disabled={busy || (captchaRequired && !captchaToken)}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "form" ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <LogIn className="h-4 w-4" strokeWidth={2} />}
              Masuk
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-ink-400">
            Punya 2FA atau ingin langsung ke modul?{" "}
            <button
              onClick={ssoLogin}
              disabled={busy}
              className="cursor-pointer font-medium text-brand-600 underline-offset-2 hover:underline disabled:opacity-70"
            >
              Masuk via SSO
            </button>
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
