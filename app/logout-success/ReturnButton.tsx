"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

// ponytail: 5s gives SSO teardown time to settle before returning to Portal.
// Bump if a fast return ever loops back into a live session.
const WAIT_SECONDS = 5;

export default function ReturnButton() {
  const [left, setLeft] = useState(WAIT_SECONDS);

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [left]);

  const ready = left <= 0;

  return (
    <a
      href={ready ? "/" : undefined}
      aria-disabled={!ready}
      className={`mt-7 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        ready
          ? "cursor-pointer bg-brand-500 hover:bg-brand-600"
          : "pointer-events-none cursor-not-allowed bg-ink-300"
      }`}
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      {ready ? "Kembali ke Portal" : `Kembali ke Portal (${left})`}
    </a>
  );
}
