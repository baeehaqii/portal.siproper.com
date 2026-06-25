import Link from "next/link";
import Image from "next/image";
import {
  LifeBuoy,
  ShieldCheck,
  Activity,
  HelpCircle,
  Download,
} from "lucide-react";
import Reveal from "./components/Reveal";
import BrandMark from "./components/BrandMark";
import ModuleGrid from "./components/ModuleGrid";
import { fetchAuthorization } from "@/lib/sso";

export default async function Home() {
  const authz = await fetchAuthorization();
  const auth = {
    authenticated: !!authz,
    modules: authz?.modules ?? {},
    roles: authz?.roles ?? [],
  };

  return (
    <main className="relative">
      {/* NAVBAR */}
      <header className="sticky top-0 z-30 border-b border-ink-100/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo_siproepr.png"
              alt="SiProper Digital System"
              width={350}
              height={100}
              className="h-10 w-auto"
              priority
            />
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="https://help.siproper.com"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-brand-600 lg:inline-flex"
            >
              <LifeBuoy className="h-4 w-4" strokeWidth={2} />
              Helpdesk
            </Link>
            <Link
              href="https://status.siproper.com"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-brand-600 lg:inline-flex"
            >
              <Activity className="h-4 w-4" strokeWidth={2} />
              Status Server
            </Link>
            <Link
              href="/faq"
              className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-brand-600 lg:inline-flex"
            >
              <HelpCircle className="h-4 w-4" strokeWidth={2} />
              FAQ
            </Link>
            <Link
              href="https://play.google.com/store/apps/details?id=com.siproper.attendencesg_kmp.android"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" strokeWidth={2.25} />
              <span className="hidden sm:inline">Download Employee Sapphire Grup</span>
              <span className="sm:hidden">Download App</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Grid overlay yang fade ke bawah */}
        <div className="bg-grid bg-grid-fade absolute inset-0" aria-hidden />
        <div
          className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-24 sm:pb-12 lg:px-8">
          <Reveal className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
              Portal Terpadu — akses internal
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              Satu pintu untuk seluruh
              <span className="block text-brand-500">sistem digital SiProper.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ink-500 sm:text-lg">
              Akses cepat ke modul Sales, Keuangan, Legal, Teknik, HR, dan layanan pendukung
              dalam satu portal yang ringan dan aman.
            </p>
          </Reveal>
        </div>
      </section>

      {/* MENU GRID */}
      <section className="relative pt-4 pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
              Menu Siproper <span className="text-ink-500 font-light">by Sapphire Grup</span>
            </h2>
            <p className="mt-1 text-sm text-ink-500">Pilih modul untuk mulai bekerja.</p>
          </Reveal>

          {/* Launcher: cards gate by role; click → login modal (SSO) → deep-link. */}
          <ModuleGrid auth={auth} />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-ink-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <BrandMark className="h-5 w-5" />
            <span>© {new Date().getFullYear()} SiProper Digital System</span>
          </div>
          <span className="text-xs text-ink-300">Internal use only · Akses terbatas</span>
        </div>
      </footer>
    </main>
  );
}
