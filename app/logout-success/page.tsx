import Link from "next/link";
import { CheckCircle2, ArrowLeft, Clock } from "lucide-react";

type Summary = {
  totals: Record<string, number>; // module => minutes
  daily: { date: string; modules: Record<string, number> }[];
};

function decode(s?: string): Summary | null {
  if (!s) return null;
  try {
    const json = Buffer.from(decodeURIComponent(s), "base64").toString("utf-8");
    return JSON.parse(json) as Summary;
  } catch {
    return null;
  }
}

function fmt(min: number): string {
  if (!min) return "0 mnt";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} jam ${m} mnt` : `${m} mnt`;
}

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

function fmtDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

const modulesLine = (mods: Record<string, number>) =>
  Object.entries(mods)
    .map(([k, v]) => `${label(k)} ${fmt(v)}`)
    .join(" · ");

// Shown after logout. `s` carries the sys2-computed per-module access summary
// (data lives in sys2's DB).
export default async function LogoutSuccess({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const summary = decode(s);
  const totals = summary ? Object.entries(summary.totals) : [];
  const hasData = totals.length > 0 || (summary?.daily.length ?? 0) > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-grid bg-grid-fade px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2} />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink-900">Anda telah keluar</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Terima kasih sudah bekerja hari ini. Sesi Anda sudah ditutup dengan aman di seluruh sistem SiProper.
        </p>

        {hasData && (
          <div className="mt-6 rounded-xl border border-ink-100 bg-ink-50/50 p-4 text-left">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700">
              <Clock className="h-4 w-4 text-brand-500" strokeWidth={2} /> Durasi akses per modul
            </div>

            {totals.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {totals.map(([mod, min]) => (
                  <div key={mod} className="rounded-lg bg-white px-3 py-2 ring-1 ring-ink-100">
                    <div className="text-xs text-ink-400">{label(mod)}</div>
                    <div className="text-sm font-semibold text-ink-900">{fmt(min)}</div>
                  </div>
                ))}
              </div>
            )}

            {(summary?.daily.length ?? 0) > 0 && (
              <div className="mt-3 space-y-2">
                {summary!.daily.map((d) => (
                  <div key={d.date} className="border-t border-ink-100 pt-2 text-sm">
                    <div className="font-medium text-ink-700">{fmtDate(d.date)}</div>
                    <div className="text-ink-500">{modulesLine(d.modules) || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Link
          href="/"
          className="mt-7 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Kembali ke Portal
        </Link>
      </div>
    </main>
  );
}
