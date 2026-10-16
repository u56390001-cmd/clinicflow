"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Small centered confirmation popup for Today-queue actions (Confirm
 * Appointment, Mark No Show, Cancel Appointment, Complete Appointment). Teal
 * variant for positive/primary actions, destructive for cancelling/no-show.
 */
export function ActionConfirmModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const Icon = variant === "destructive" ? AlertTriangle : CheckCircle2;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm animate-scale-in rounded-card border border-brand-line bg-surface p-5 shadow-dropdown">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              variant === "destructive"
                ? "bg-brand-danger-soft text-brand-danger"
                : "bg-brand-pale text-brand-cta"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-brand-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-brand-muted">{message}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              variant === "destructive"
                ? "bg-status-destructive text-white hover:bg-status-destructive/90"
                : "bg-brand-cta text-white hover:bg-brand-cta-hover"
            }
          >
            {busy ? "Processing..." : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}