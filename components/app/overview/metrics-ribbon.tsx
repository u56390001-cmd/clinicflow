import { BarChart3, Bot, Globe, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";
import { Reveal } from "./motion";

type MiniMetric = {
  icon: LucideIcon;
  label: string;
  value: number | null;
  suffix?: string;
};

/**
 * The supporting metrics ribbon. Values come from `getClinicAnalytics`; a
 * `null` rate (no appointments in the window yet) renders as an em dash rather
 * than a misleading 0%. Deliberately quieter than the KPI cards above — one
 * card, hairline dividers, a single accent — so it never competes with the
 * day's flow numbers (Design System V2 §21).
 */
export function MetricsRibbon({
  newPatientsThisWeek,
  aiBookingRate,
  websiteBookingRate,
  cancellationRate,
}: {
  newPatientsThisWeek: number;
  aiBookingRate: number | null;
  websiteBookingRate: number | null;
  cancellationRate: number | null;
}) {
  const items: MiniMetric[] = [
    {
      icon: Users,
      label: "New patients this week",
      value: newPatientsThisWeek,
    },
    {
      icon: Bot,
      label: "AI-assisted bookings",
      value: aiBookingRate,
      suffix: "%",
    },
    {
      icon: Globe,
      label: "Website bookings",
      value: websiteBookingRate,
      suffix: "%",
    },
    {
      icon: BarChart3,
      label: "Cancellation rate · 30d",
      value: cancellationRate,
      suffix: "%",
    },
  ];

  return (
    <Reveal
      delay={0.4}
      aria-label="Supporting clinic performance metrics"
      className="mb-8 grid grid-cols-2 overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-[var(--paper)] py-2 shadow-[var(--overview-shadow)] xl:grid-cols-4"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "group flex items-center gap-3.5 border-[color:var(--line)] px-5 py-2.5",
              "border-b [&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:[&:last-child]:border-r-0",
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[var(--pale)] text-[var(--accent)] transition-transform duration-200 group-hover:scale-105">
              <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <small className="block text-[13px] leading-[1.4] text-[var(--muted)]">
                {item.label}
              </small>
              <strong className="whitespace-nowrap text-[20px] font-semibold tracking-[-0.02em] text-[var(--forest)]">
                <AnimatedNumber value={item.value} suffix={item.suffix} />
              </strong>
            </div>
          </div>
        );
      })}
    </Reveal>
  );
}
