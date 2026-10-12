import { CalendarDays, Sparkles } from "lucide-react";

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
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-[22px]">
      <Reveal className="min-w-0" delay={0.04}>
        <h1 className="text-[clamp(23px,2.4vw,29px)] font-extrabold leading-[1.25] tracking-[-0.035em] text-[var(--forest)]">
          {greeting}, {clinicName}{" "}
          <Sparkles
            aria-hidden="true"
            className="inline h-[18px] w-[18px] align-[-2px] text-[var(--sage)]"
          />
        </h1>
        <p className="mt-[7px] text-[12.5px] text-[var(--muted)]">
          Your clinic at a glance — know what needs attention today.
        </p>
      </Reveal>

      <Reveal
        className="flex items-center gap-[10px] max-sm:w-full max-sm:flex-wrap"
        delay={0.09}
      >
        <span className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-[9px] border border-[color:var(--line)] bg-[var(--paper)] px-3 py-[10px] text-[11px] font-bold text-[var(--muted)] transition-colors duration-200 hover:border-[color:var(--sage)] hover:text-[var(--deep)]">
          <CalendarDays aria-hidden="true" className="h-[15px] w-[15px]" />
          {dateLabel}
        </span>
      </Reveal>
    </div>
  );
}
