"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, X } from "lucide-react";

export function BookingModal({
  open,
  onClose,
  children,
  title = "Book Consultation",
  subtitle = "Schedule a doctor consultation",
  icon: HeaderIcon = CalendarPlus,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/40 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-10"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[900px] flex-col overflow-hidden rounded-card border border-brand-line bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:max-h-[calc(100dvh-5rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — calm sage surface; brand accent carried by the icon chip. */}
        <div className="flex items-center justify-between gap-3 border-b border-brand-line bg-brand-wash px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-pale">
              <HeaderIcon className="h-5 w-5 text-brand-cta" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-brand-ink sm:text-lg">
                {title}
              </h2>
              <p className="truncate text-sm text-brand-muted">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-sage"
            aria-label="Close booking modal"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
