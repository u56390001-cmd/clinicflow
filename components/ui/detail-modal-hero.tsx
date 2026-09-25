"use client";

import { X } from "lucide-react";

/**
 * Popup header used at the top of the doctor / service detail and edit
 * popups. Solid primary background with white text and a high-contrast close
 * chip so the control stays clearly visible against the brand color.
 */
export function DetailModalHero({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="relative flex items-start justify-between gap-4 rounded-t-2xl bg-primary px-6 py-6 text-white sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">{children}</div>
      <button
        type="button"
        onClick={onClose}
        className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm transition-colors hover:bg-white/90"
        aria-label="Close"
      >
        <X
          className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}