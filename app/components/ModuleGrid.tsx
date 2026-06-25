"use client";

import { useState } from "react";
import {
  TrendingUp,
  Wallet,
  Scale,
  Wrench,
  Landmark,
  Users,
  LifeBuoy,
  ArrowUpRight,
  Lock,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import Reveal from "./Reveal";
import AuthModal from "./AuthModal";
import ManualBookCard from "./ManualBookCard";
import { TARGETS } from "@/lib/targets";

type Base = keyof typeof TARGETS;
type Menu = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  base: Base;
  path: string;
  module: string | null; // gating key in modules{}; null = no portal-side gate
};

const MENUS: Menu[] = [
  { title: "Sales", desc: "Manajemen penjualan & pipeline.", icon: TrendingUp, base: "sys1", path: "/", module: "marketing" },
  { title: "Likuiditas", desc: "Arus kas & posisi likuiditas.", icon: Wallet, base: "sys1", path: "/", module: null },
  { title: "Keuangan", desc: "Akuntansi & pelaporan keuangan.", icon: Landmark, base: "sys1", path: "/", module: "keuangan" },
  { title: "Legal", desc: "Kontrak, perizinan & kepatuhan.", icon: Scale, base: "sys2", path: "/admin", module: "legal" },
  { title: "Teknik", desc: "Operasional & proyek teknik.", icon: Wrench, base: "sys2", path: "/admin", module: "teknik" },
  { title: "HR", desc: "Karyawan, absensi & payroll.", icon: Users, base: "sys2", path: "/admin", module: "hr" },
  { title: "Helpdesk", desc: "Bantuan & pelaporan kendala.", icon: LifeBuoy, base: "help", path: "", module: null },
];

export type AuthState = {
  authenticated: boolean;
  modules: Record<string, boolean>;
  roles: string[];
};

export default function ModuleGrid({ auth }: { auth: AuthState }) {
  const [modal, setModal] = useState<{ title: string; next: string } | null>(null);
  const isSuper = auth.roles.includes("super_admin");

  // sys2 deep-links go through the Portal handoff (/api/go) so the form-login
  // session is carried into sys2's web session. sys1/help link out directly.
  const hrefOf = (m: Menu) =>
    m.base === "sys2"
      ? `/api/go?to=${encodeURIComponent(m.path)}${m.module ? `&module=${m.module}` : ""}`
      : TARGETS[m.base] + m.path;
  const allowed = (m: Menu) => isSuper || !m.module || auth.modules[m.module] === true;

  function onCardClick(m: Menu, e: React.MouseEvent) {
    e.preventDefault();
    const href = hrefOf(m);
    if (!auth.authenticated) {
      setModal({ title: m.title, next: href });
      return;
    }
    if (!allowed(m)) return; // gated — card already shows the locked state
    window.location.href = href;
  }

  return (
    <>
      {/* auth bar */}
      <div className="mb-6 flex items-center justify-between rounded-xl border border-ink-100 bg-white px-4 py-2.5 text-sm">
        {auth.authenticated ? (
          <>
            <span className="flex items-center gap-2 text-ink-700">
              <UserRound className="h-4 w-4 text-brand-500" strokeWidth={2} />
              Masuk sebagai <b className="font-semibold">{auth.roles.join(", ") || "pengguna"}</b>
              {isSuper && <span className="text-ink-400">· akses semua</span>}
            </span>
            <a href="/api/auth/logout" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-ink-600 transition-colors hover:text-brand-600">
              <LogOut className="h-4 w-4" strokeWidth={2} /> Logout
            </a>
          </>
        ) : (
          <>
            <span className="text-ink-500">Belum masuk — pilih modul untuk login.</span>
            <button
              onClick={() => setModal({ title: "Portal SiProper", next: "/" })}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <LogIn className="h-4 w-4" strokeWidth={2} /> Masuk
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MENUS.map((m, i) => {
          const Icon = m.icon;
          const locked = auth.authenticated && !allowed(m);
          return (
            <Reveal key={m.title} delay={i * 60}>
              <a
                href={hrefOf(m)}
                onClick={(e) => onCardClick(m, e)}
                aria-disabled={locked}
                className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
                  locked ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-brand-200 hover:bg-brand-50/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 ${locked ? "" : "group-hover:bg-brand-500 group-hover:text-white"}`}>
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  {locked && <Lock className="h-4 w-4 text-ink-300" strokeWidth={2} />}
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-ink-900">{m.title}</h3>
                    {!locked && <ArrowUpRight className="h-4 w-4 text-ink-300 transition-colors duration-200 group-hover:text-brand-500" strokeWidth={2.25} />}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
                    {locked ? "Tidak ada akses untuk peran Anda." : m.desc}
                  </p>
                </div>
              </a>
            </Reveal>
          );
        })}
        <Reveal delay={MENUS.length * 60}>
          <ManualBookCard />
        </Reveal>
      </div>

      {modal && <AuthModal moduleTitle={modal.title} next={modal.next} onClose={() => setModal(null)} />}
    </>
  );
}
