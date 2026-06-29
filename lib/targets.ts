// Deep-link targets (the ecosystem apps). Overridable per-env so dev can point
// to local sys2 (e.g. http://127.0.0.1:8000). NEXT_PUBLIC_* = available on both
// server and client.
export const TARGETS = {
  sys1: process.env.NEXT_PUBLIC_SYS1_URL || "https://sys1.siproper.com",
  sys2: process.env.NEXT_PUBLIC_SYS2_URL || "https://sys2.siproper.com",
  help: process.env.NEXT_PUBLIC_HELP_URL || "https://help.siproper.com",
};

// Anti open-redirect: a post-login `next` is honored only if it is a same-origin
// relative path (e.g. /api/go?to=…) or points at a known ecosystem origin.
export function isAllowedNext(next: string): boolean {
  // same-origin relative path: starts with a single "/" (not "//" or "/\")
  if (/^\/(?![/\\])/.test(next)) return true;
  try {
    const u = new URL(next);
    return Object.values(TARGETS).some((base) => u.origin === new URL(base).origin);
  } catch {
    return false;
  }
}

// Logged-out deep-link recovery: when a not-authenticated user clicks a module,
// send them to the Portal home with the login MODAL open (not sys2's /oauth/authorize,
// which dead-ends at sys2's login page when the sys2 web session is gone — e.g. right
// after a sys2-side logout that revoked the Portal token). `next` resumes the deep-link
// after login; `m` lets the modal name the module the user wanted.
export function signinPath(next: string, moduleKey?: string): string {
  const q = new URLSearchParams({ signin: "1" });
  if (isAllowedNext(next)) q.set("next", next);
  if (moduleKey) q.set("m", moduleKey);
  return `/?${q}`;
}
