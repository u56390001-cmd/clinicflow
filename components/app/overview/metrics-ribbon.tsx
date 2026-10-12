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
 * than a misleading 0%.
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
      className="mb-[30px] grid grid-cols-2 overflow-hidden rounded-[12px] border border-[color:var(--line)] bg-[var(--paper)] py-[15px] shadow-[var(--overview-shadow)] xl:grid-cols-4"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={cn(
              "group flex items-center gap-[13px] border-[color:var(--line)] px-[19px] py-[6px]",
              "border-b [&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:[&:last-child]:border-r-0",
            )}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--pale)] text-[var(--accent)] transition-transform duration-200 group-hover:scale-110">
              <Icon aria-hidden="true" className="h-[17px] w-[17px]" />
            </span>
            <div className="min-w-0">
              <small className="block text-[10.5px] leading-[1.4] text-[var(--muted)]">
                {item.label}
              </small>
              <strong className="whitespace-nowrap text-[17px] font-extrabold text-[var(--forest)]">
                <AnimatedNumber value={item.value} suffix={item.suffix} />
              </strong>
            </div>
          </div>
        );
      })}
    </Reveal>
  );
}
