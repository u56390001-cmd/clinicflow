"use client";

import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Reusable detail-popup shell for read-only profiles (doctor / service).
 * Provides the backdrop, the scrollable body and the footer action bar,
 * matching the app's existing modal design (see `ServiceForm`). Content is
 * passed as `children`.
 *
 * By default a compact brand-gradient header (icon + title + subtitle + close)
 * is rendered. Pass `header` to replace it with a custom hero — the doctor and
 * service detail views ship richer headers while keeping this shared shell.
 */
export function DetailModalLayout({
  icon: Icon,
  title,
  subtitle,
  header,
  onClose,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Replaces the default compact header entirely (must include a close button). */
  header?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-secondary/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative my-8 flex w-full max-h-[calc(100vh-4rem)] max-w-5xl flex-col rounded-2xl border border-primary/10 bg-white shadow-2xl">
        {header ?? (
          <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-primary px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <Icon className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                {subtitle && <p className="text-sm text-white/80">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="group flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary shadow-sm transition-colors hover:bg-white/90"
              aria-label="Close"
            >
              <X
                className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90"
                aria-hidden="true"
              />
            </button>
          </div>
        )}

        {/* Scrollable body — takes only the remaining height inside the card. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {/* Footer action bar */}
        {footer && (
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-b-2xl border-t border-text-muted/15 bg-app/50 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}