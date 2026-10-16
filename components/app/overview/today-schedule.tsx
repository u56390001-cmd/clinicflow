"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";

import { OverviewPanel, PanelHeader, StatusPill } from "@/components/app/overview/overview-ui";
import { APP_ROUTES } from "@/lib/constants";
import type { TodayScheduleRow } from "@/lib/dashboard-overview";
import { cn } from "@/lib/utils";

type Filter = "all" | "waiting" | "upcoming";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "upcoming", label: "Upcoming" },
];

const INITIAL_ROWS = 4;

/**
 * Today's schedule. Server-provided rows, client-side filtering so switching
 * "All / Waiting / Upcoming" never refetches. Row actions navigate to the
 * existing Appointment workspace (the only place an appointment can be opened
 * or actioned) for authorized members.
 */
export function TodaySchedule({ rows }: { rows: TodayScheduleRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = rows.filter((row) => {
    if (filter === "waiting") {
      return row.status === "waiting" || row.status === "progress";
    }
    if (filter === "upcoming") return row.status === "upcoming";
    return true;
  });
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_ROWS);

  return (
    <OverviewPanel id="schedulePanel">
      <PanelHeader
        icon={CalendarDays}
        title="Today's schedule"
        subtitle="Upcoming appointments and patient status"
        action={
          <div
            role="group"
            aria-label="Schedule filter"
            className="flex rounded-[10px] border border-[color:var(--line)] bg-[var(--wash)] p-1"
          >
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={cn(
                  "rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors",
                  filter === option.id
                    ? "bg-[var(--paper)] text-[var(--forest)] shadow-[0_1px_3px_rgba(23,45,26,0.12)]"
                    : "text-[var(--muted)] hover:text-[var(--forest)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="text-left text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--muted)]">
              <th className="w-[76px] pb-3 pr-3 font-medium">Time</th>
              <th className="w-[31%] pb-3 pr-3 font-medium">Patient</th>
              <th className="w-[24%] pb-3 pr-3 font-medium max-md:hidden">
                Doctor
              </th>
              <th className="w-[21%] pb-3 pr-3 font-medium">Status</th>
              <th className="w-[44px] pb-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pale)] text-[var(--accent)]">
                      <CalendarDays aria-hidden="true" className="h-6 w-6" />
                    </span>
                    <p className="mt-1 text-[15px] font-semibold text-[var(--forest)]">
                      {rows.length === 0
                        ? "No appointments today"
                        : "No matching appointments"}
                    </p>
                    <p className="max-w-sm text-[13px] text-[var(--muted)]">
                      {rows.length === 0
                        ? "New bookings will appear here as they come in."
                        : "Try a different filter to see more."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={row.id}
                  className="group border-t border-[color:var(--line)] text-[14px] text-[var(--muted)] transition-colors duration-200 hover:bg-[var(--surface)]"
                >
                  <td className="py-3.5 pr-3 font-semibold text-[var(--forest)]">
                    {row.timeLabel}
                  </td>
                  <td className="py-3.5 pr-3">
                    <div className="truncate text-[14px] font-semibold text-[var(--forest)]">
                      {row.patientName}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                      {row.serviceName}
                    </div>
                  </td>
                  <td className="py-3.5 pr-3 max-md:hidden">
                    <span className="block truncate">
                      {row.doctorName ?? "—"}
                    </span>
                  </td>
                  <td className="py-3.5 pr-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="py-3.5">
                    <Link
                      href={APP_ROUTES.app.appointments}
                      aria-label={`View appointment for ${row.patientName}`}
                      className="inline-grid h-9 w-9 place-items-center rounded-[8px] text-[var(--accent)] opacity-60 transition-all duration-200 hover:bg-[var(--pale)] group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4 text-[13px] text-[var(--muted)]">
        <span>
          Showing {visible.length} of {filtered.length} matching appointments
        </span>
        {filtered.length > INITIAL_ROWS ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            {showAll ? "Show fewer ↑" : "View all appointments →"}
          </button>
        ) : (
          <Link
            href={APP_ROUTES.app.appointments}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            View all appointments →
          </Link>
        )}
      </div>
    </OverviewPanel>
  );
}
