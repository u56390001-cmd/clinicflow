"use client";

import { motion } from "framer-motion";
import { Activity, CalendarDays, Check, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./animated-number";
import { MEDBOOK_EASE } from "./motion";

type Tone = "green" | "orange" | "blue";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-[var(--pale)] text-[var(--accent)]",
  orange: "bg-[var(--orange-wash)] text-[var(--orange)]",
  blue: "bg-[var(--blue-wash)] text-[var(--blue)]",
};

type KpiCard = {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
  foot: React.ReactNode;
};

/** A small semantic dot used in a KPI footer (colour is never the only cue —
 * the caption text carries the meaning too). */
function Dot({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-1.5 w-1.5 rounded-full", className)}
    />
  );
}

/** "Today's clinic flow" — the four numbers that describe the day's work. */
export function TodayFlowKpis({
  appointmentsToday,
  patientsWaiting,
  inConsultation,
  completedVisits,
}: {
  appointmentsToday: number;
  patientsWaiting: number;
  inConsultation: number;
  completedVisits: number;
}) {
  const cards: KpiCard[] = [
    {
      label: "Appointments today",
      value: appointmentsToday,
      icon: CalendarDays,
      tone: "green",
      foot: (
        <>
          <Dot className="bg-[var(--accent)]" />
          Today&apos;s schedule
        </>
      ),
    },
    {
      label: "Patients waiting",
      value: patientsWaiting,
      icon: Users,
      tone: "orange",
      foot: (
        <>
          <Dot className="bg-[var(--orange)]" />
          Needs attention
        </>
      ),
    },
    {
      label: "In consultation",
      value: inConsultation,
      icon: Activity,
      tone: "blue",
      foot: <>Currently with a doctor</>,
    },
    {
      label: "Completed visits",
      value: completedVisits,
      icon: Check,
      tone: "green",
      foot: (
        <>
          <Dot className="bg-[var(--accent)]" />
          Checked out today
        </>
      ),
    },
  ];

  return (
    <section aria-labelledby="todayTitle">
      <h2 id="todayTitle" className="sr-only">
        Today&apos;s clinic flow
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.article
              key={card.label}
              className="medbook-motion group relative flex min-h-[156px] flex-col overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-[var(--paper)] p-6 shadow-[var(--overview-shadow)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{
                y: -4,
                boxShadow: "0 14px 30px -16px rgba(19, 47, 34, 0.28)",
                borderColor: "#679986",
                transition: { duration: 0.22, ease: MEDBOOK_EASE },
              }}
              transition={{
                duration: 0.5,
                ease: MEDBOOK_EASE,
                delay: 0.2 + index * 0.045,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="max-w-[150px] text-[14px] font-medium leading-[1.4] text-[var(--muted)]">
                  {card.label}
                </p>
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] transition-transform duration-200 group-hover:scale-105",
                    TONE_CLASS[card.tone],
                  )}
                >
                  <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                </span>
              </div>

              <div className="mt-5 text-[30px] font-bold leading-none tracking-[-0.03em] text-[var(--forest)]">
                <AnimatedNumber value={card.value} />
              </div>

              <div className="mt-auto flex items-center gap-1.5 pt-3 text-[13px] text-[var(--muted)]">
                {card.foot}
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
