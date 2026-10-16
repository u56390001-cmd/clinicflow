import { CalendarDays } from "lucide-react";

import { utcIsoToClinicLocalInput } from "@/lib/time";
import { Reveal } from "./motion";

/**
 * Overview header: a timezone-correct greeting and the clinic-local date chip.
 * The "New appointment" action lives in the app header (see AppHeaderShell) so
 * the dashboard's own header carries only the date. The given name is read
 * straight from the clinic record — no sample data.
 */
export function OverviewHeader({
  clinicName,
  timezone,
}: {
  clinicName: string;
  timezone: string;
}) {
  const nowIso = new Date().toISOString();
  const localHour = Number(utcIsoToClinicLocalInput(nowIso, timezone).slice(11, 13));
  const greeting =
    localHour < 12
      ? "Good morning"
      : localHour < 17
        ? "Good afternoon"
        : "Good evening";

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(nowIso));

  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <Reveal className="min-w-0" delay={0.04}>
        <h1 className="text-[clamp(24px,2.2vw,28px)] font-bold leading-[1.25] tracking-[-0.02em] text-[var(--forest)]">
          {greeting}, {clinicName}
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
          Your clinic at a glance — see what needs attention today.
        </p>
      </Reveal>

      <Reveal
        className="flex items-center gap-2.5 max-sm:w-full max-sm:flex-wrap"
        delay={0.09}
      >
        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-[color:var(--line)] bg-[var(--paper)] px-3.5 py-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors duration-200 hover:border-[color:var(--sage)] hover:text-[var(--ink)]">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          {dateLabel}
        </span>
      </Reveal>
    </div>
  );
}
