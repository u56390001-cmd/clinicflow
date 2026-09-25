"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant?: "warning" | "destructive" | "info";
  reason?: string;
  onReasonChange?: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  title,
  description,
  confirmText,
  cancelText,
  variant = "info",
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const variantStyles = {
    warning: {
      icon: AlertCircle,
      button: "bg-yellow-600 hover:bg-yellow-700",
      bg: "bg-yellow-50 border-yellow-200",
    },
    destructive: {
      icon: AlertCircle,
      button: "bg-red-600 hover:bg-red-700",
      bg: "bg-red-50 border-red-200",
    },
    info: {
      icon: CheckCircle2,
      button: "bg-blue-600 hover:bg-blue-700",
      bg: "bg-blue-50 border-blue-200",
    },
  };

  const style = variantStyles[variant];
  const IconComponent = style.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={cn("w-full max-w-sm rounded-lg border shadow-lg bg-surface", style.bg)}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <IconComponent className="h-6 w-6 shrink-0 text-yellow-600" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
              <p className="mt-2 text-sm text-text-secondary">{description}</p>

              {reason !== undefined && onReasonChange && (
                <div className="mt-4">
                  <label className="text-sm font-medium text-text-primary">
                    Reason (optional)
                  </label>
                  <Textarea
                    placeholder="Why are you taking this action?"
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    className="mt-2 resize-none"
                    rows={3}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelText}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={loading}
              className={style.button}
            >
              {loading ? "Processing..." : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
