"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "./ui";

export function PrintToolbar({ back, label }: { back: string; label: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <a href={back} className="text-sm text-slate-600 hover:text-slate-900">
        ← Back
      </a>
      <p className="hidden text-sm text-slate-500 sm:block">Choose &ldquo;Save as PDF&rdquo; in the print dialog to download.</p>
      <button onClick={() => window.print()} className={buttonClass("primary")}>
        <Printer /> {label}
      </button>
    </div>
  );
}
