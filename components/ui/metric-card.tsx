"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  primary: "bg-primary",
  success: "bg-emerald-600",
  info: "bg-sky-600",
  warning: "bg-amber-500",
} as const;

/**
 * Compact colored stat card used inside the detail modals. Icon top-left,
 * value bottom-left, label below — solid background with white text and a
 * soft decorative circle in the corner.
 */
export function MetricCard({
  icon: Icon,
  value,
  label,
  tone = "primary",
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 text-white shadow-sm",
        TONES[tone],
      )}
    >
      <div className="relative z-10">
        <Icon className="h-6 w-6 opacity-90" aria-hidden="true" />
        <span className="mt-3 block text-2xl font-bold leading-none">
          {value}
        </span>
        <span className="mt-1.5 block text-xs text-white/85">{label}</span>
      </div>
      <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/10" />
      <div className="absolute -right-1 -top-1 h-10 w-10 rounded-full bg-white/5" />
    </div>
  );
}