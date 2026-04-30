"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  TrendingUp,
  Wallet,
  Scale,
  Wrench,
  Landmark,
  Users,
  FileText,
  ClipboardList,
  Loader2,
  BookOpen,
} from "lucide-react";

type SubType = {
  label: string;
  desc: string;
  url: string; // kosong = coming soon
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

type Dept = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  subTypes?: SubType[];
};

const DEPTS: Dept[] = [
  { id: "sales",      label: "Sales",      icon: TrendingUp },
  { id: "likuiditas", label: "Likuiditas", icon: Wallet     },
  {
    id: "legal",
    label: "Legal",
    icon: Scale,
    subTypes: [
      {
        label: "Manual Book Legal Sistem",
        desc:  "Panduan penggunaan aplikasi sistem",
        url:   "https://drive.google.com/file/d/1RxFrwZf57kguq-1heyrJBJaJeT2tLhcP/preview",
        icon:  FileText,
      },
      {
        label: "Manual Book Legal SOP",
        desc:  "Prosedur operasional standar",
        url:   "https://drive.google.com/file/d/1UwRaSSHQQb2bIa79ajbz8f5KCTyjcr8W/preview",
        icon:  ClipboardList,
      },
    ],
  },
  {
    id: "teknik",
    label: "Teknik",
    icon: Wrench,
    subTypes: [
      {
        label: "Manual Book Teknik Sistem",
        desc:  "Panduan penggunaan aplikasi sistem",
        url:   "", // belum tersedia
        icon:  FileText,
      },
      {
        label: "Manual Book Teknik SOP",
        desc:  "Prosedur operasional standar",
        url:   "https://docs.google.com/document/d/16D4G2sTxQBc4cBeM09dGOekcVYTr5xLa/preview",
        icon:  ClipboardList,
      },
    ],
  },
  { id: "keuangan", label: "Keuangan", icon: Landmark },
  { id: "hr",       label: "HR",       icon: Users    },
];

type Step =
  | { name: "dept" }
  | { name: "sub-type"; dept: Dept }
  | { name: "pdf";         title: string; url: string; parentDept: Dept }
  | { name: "coming-soon"; label: string; parentDept: Dept | null };

export default function ManualBookModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ name: "dept" });
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); },
    [onClose]
  );
  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [handleKey]);

  function handleDept(dept: Dept) {
    if (dept.subTypes?.length) {
      setStep({ name: "sub-type", dept });
    } else {
      setStep({ name: "coming-soon", label: dept.label, parentDept: null });
    }
  }

  function handleSubType(sub: SubType, parentDept: Dept) {
    if (!sub.url) {
      setStep({ name: "coming-soon", label: sub.label, parentDept });
      return;
    }
    setPdfLoaded(false);
    setStep({ name: "pdf", title: sub.label, url: sub.url, parentDept });
  }

  function goBack() {
    if (step.name === "sub-type" || (step.name === "coming-soon" && !step.parentDept)) {
      setStep({ name: "dept" });
    } else if (step.name === "pdf" || (step.name === "coming-soon" && step.parentDept)) {
      const parent = step.name === "pdf" ? step.parentDept : step.parentDept!;
      setStep({ name: "sub-type", dept: parent });
    }
  }

  const isPdf  = step.name === "pdf";
  const isBack = step.name !== "dept";

  const headerTitle =
    step.name === "dept"        ? "Manual Book — Pilih Departemen" :
    step.name === "sub-type"    ? `Manual Book ${step.dept.label}` :
    step.name === "pdf"         ? step.title :
    /* coming-soon */             "Manual Book";

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal
      aria-label="Manual Book"
    >
      {/* Backdrop glassmorphism */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(15, 23, 42, 0.35)",
          backdropFilter: "blur(12px) saturate(140%)",
          WebkitBackdropFilter: "blur(12px) saturate(140%)",
        }}
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className={`relative flex w-full flex-col rounded-2xl shadow-2xl ring-1 ring-white/20 transition-all duration-300 ${
          isPdf ? "max-w-4xl" : "max-w-xl"
        }`}
        style={{
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div className="flex items-center gap-3">
            {isBack && (
              <button
                onClick={goBack}
                className="cursor-pointer rounded-full p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Kembali"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-500" strokeWidth={2} />
              <h2 className="text-base font-semibold text-ink-900">{headerTitle}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto">

          {/* STEP 1: Pilih departemen */}
          {step.name === "dept" && (
            <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3">
              {DEPTS.map((dept) => {
                const Icon = dept.icon;
                const hasDoc = !!dept.subTypes?.some((s) => s.url);
                return (
                  <button
                    key={dept.id}
                    onClick={() => handleDept(dept)}
                    className="group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-ink-100 bg-white p-5 text-center transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-white">
                      <Icon className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="text-sm font-semibold text-ink-900">{dept.label}</span>
                    {hasDoc && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                        tersedia
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 2: Sub-tipe */}
          {step.name === "sub-type" && (
            <div className="flex flex-col gap-3 p-6 sm:flex-row">
              {step.dept.subTypes!.map((sub) => {
                const Icon = sub.icon;
                return (
                  <button
                    key={sub.label}
                    onClick={() => handleSubType(sub, step.dept)}
                    className="group flex flex-1 cursor-pointer flex-col items-center gap-4 rounded-2xl border border-ink-100 bg-white px-6 py-8 text-center transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 relative"
                  >
                    {!sub.url && (
                      <span className="absolute top-3 right-3 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                        segera
                      </span>
                    )}
                    <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-white">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{sub.label}</p>
                      <p className="mt-1 text-xs text-ink-500">{sub.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 3: PDF / Docs embed */}
          {step.name === "pdf" && (
            <div className="relative" style={{ height: "70vh" }}>
              {!pdfLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-400">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" strokeWidth={2} />
                  <span className="text-sm">Memuat dokumen…</span>
                </div>
              )}
              <iframe
                src={step.url}
                title={step.title}
                className="h-full w-full rounded-b-2xl"
                onLoad={() => setPdfLoaded(true)}
                allow="autoplay"
                style={{ border: "none" }}
              />
            </div>
          )}

          {/* Coming soon */}
          {step.name === "coming-soon" && (
            <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
              <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
                <BookOpen className="h-7 w-7" strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-base font-semibold text-ink-900">Manual Book belum tersedia</p>
                <p className="mt-1 text-sm text-ink-500">
                  Dokumen untuk{" "}
                  <span className="font-medium text-ink-700">{step.label}</span>{" "}
                  sedang dalam penyusunan.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
