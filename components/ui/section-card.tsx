"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Soft tinted section container used inside the detail popups. Each tone pairs
 * a very light gradient background with a matching icon chip, keeping the
 * sections visually separated without borders (per the detail-popup design
 * system). `primary`/`teal` anchor to the app's design-system primary.
 */
const TONES = {
  primary: {
    card: "border-primary/15 bg-gradient-to-br from-primary/5 to-app/40",
    icon: "bg-primary/10 text-primary",
  },
  success: {
    card: "border-status-success/15 bg-gradient-to-br from-status-success/5 to-app/40",
    icon: "bg-status-success/10 text-status-success",
  },
  violet: {
    card: "border-violet-200 bg-gradient-to-br from-violet-50 to-app/40",
    icon: "bg-violet-500/10 text-violet-600",
  },
  amber: {
    card: "border-status-warning/15 bg-gradient-to-br from-status-warning/5 to-app/40",
    icon: "bg-status-warning/10 text-status-warning",
  },
  teal: {
    card: "border-primary/15 bg-gradient-to-br from-primary/5 to-app/40",
    icon: "bg-primary/10 text-primary",
  },
  indigo: {
    card: "border-indigo-200 bg-gradient-to-br from-indigo-50 to-app/40",
    icon: "bg-indigo-500/10 text-indigo-600",
  },
  slate: {
    card: "border-neutral-borderLight bg-gradient-to-br from-slate-50 to-app/40",
    icon: "bg-slate-500/10 text-slate-600",
  },
} as const;

export type SectionCardTone = keyof typeof TONES;

export function SectionCard({
  title,
  icon: Icon,
  tone = "primary",
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone?: SectionCardTone;
  className?: string;
  children: React.ReactNode;
}) {
  const styles = TONES[tone];
  return (
    <div className={cn("rounded-2xl border p-6", styles.card, className)}>
      <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold text-secondary">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}