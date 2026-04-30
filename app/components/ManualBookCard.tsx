"use client";

import { useState } from "react";
import { BookOpen, ArrowUpRight } from "lucide-react";
import ManualBookModal from "./ManualBookModal";

export default function ManualBookCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative flex h-full w-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-ink-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 text-left"
      >
        <div className="flex items-start justify-between">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors duration-200 group-hover:bg-brand-500 group-hover:text-white">
            <BookOpen className="h-5 w-5" strokeWidth={2} />
          </span>
        </div>
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink-900">Manual Book</h3>
            <ArrowUpRight
              className="h-4 w-4 text-ink-300 transition-colors duration-200 group-hover:text-brand-500"
              strokeWidth={2.25}
            />
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Panduan penggunaan sistem.
          </p>
        </div>
      </button>

      {open && <ManualBookModal onClose={() => setOpen(false)} />}
    </>
  );
}
