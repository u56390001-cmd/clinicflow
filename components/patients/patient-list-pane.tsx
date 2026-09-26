"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHoverTip } from "@/components/ui/hover-tip";
import { VISIT_STATUS_META, visitStatusTone } from "@/lib/constants";
import {
  PATIENT_PAGE_SIZE,
  PATIENT_SCOPE_LABELS,
  PATIENT_SCOPES,
  PATIENT_SEGMENT_LABELS,
  PATIENT_SEGMENTS,
  PATIENT_TODAY_SEGMENTS,
  patientDirectoryHref,
  patientKey,
  type PatientDirectoryParams,
  type PatientTodayQueue,
} from "@/lib/patient-directory";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { avatarColorFor, initialsOf } from "@/lib/utils/avatar";
import { cn } from "@/lib/utils";
import { formatNaiveDate } from "@/lib/utils/datetime";
import type { PatientDirectoryRow, VisitStatus } from "@/types/database";

/** KPI strip above the tabs. Which cards render depends on the active scope. */
export type PatientDirectoryStats = {
  total: number;
  newThisMonth: number;
  today: number;
  waiting: number;
  completed: number;
};

const SEARCH_DEBOUNCE_MS = 350;

/**
 * Master pane of the patients workspace: search, KPI stats, scope tabs, segment
 * pills and the patient card list.
 *
 * Every control navigates — the server page owns filtering and pagination — so
 * this component holds no list state. The one exception is the search box,
 * which keeps the keystrokes locally and pushes a debounced URL update so
 * typing does not fire a query per character.
 */
export function PatientListPane({
  patients,
  total,
  stats,
  params,
  selectedPatientId,
  canManage,
  timezone,
  todayQueue,
  collapsed,
  onToggleCollapsed,
  onAddPatient,
}: {
  patients: PatientDirectoryRow[];
  total: number;
  stats: PatientDirectoryStats;
  params: PatientDirectoryParams;
  selectedPatientId: string | null;
  canManage: boolean;
  timezone: string;
  /** Today's token + status per patient id — absent means "not in today's queue". */
  todayQueue: PatientTodayQueue;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddPatient: () => void;
}) {
  const router = useRouter();
  const [term, setTerm] = useState(params.q);
  const { tipProps, tooltip } = useHoverTip();

  // The params object is rebuilt on every server render, so the debounce effect
  // reads it through a ref and depends only on primitives. Without this the
  // timer would restart on unrelated re-renders.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Re-sync when `q` changes behind our back (Back button, the Clear link)
  // without clobbering in-flight keystrokes.
  useEffect(() => {
    setTerm(params.q);
  }, [params.q]);

  useEffect(() => {
    if (term.trim() === params.q) return;
    const timer = setTimeout(() => {
      router.replace(
        patientDirectoryHref({ ...paramsRef.current, q: term, page: 1 }),
        { scroll: false },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, params.q, router]);

  const pageCount = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));

  // Collapsed, the pane gives its width back to the record and keeps only the
  // thing you still need: a way to see who is in the queue and pick one.
  if (collapsed) {
    return (
      <>
        <QueueSpine
          patients={patients}
          params={params}
          selectedPatientId={selectedPatientId}
          todayQueue={todayQueue}
          onExpand={onToggleCollapsed}
        />
        {tooltip}
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col rounded-card border border-text-muted/30 bg-surface">
      <div className="border-b border-text-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[15px] font-bold text-secondary">Patients</div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-expanded
              aria-label="Collapse patient queue"
              {...tipProps("Collapse queue")}
              className="flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ChevronsLeft aria-hidden="true" className="size-4" />
            </button>
            {canManage && (
              <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={onAddPatient}>
                <Plus aria-hidden="true" className="size-3.5" />
                Add Patient
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-[8px] border border-text-muted/20 bg-app px-3 py-1.5">
          <Search
            aria-hidden="true"
            className="size-3.5 shrink-0 text-text-muted"
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name or phone..."
            aria-label="Search patients by name or phone"
            autoComplete="off"
            className="w-full bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="shrink-0 p-0.5 text-text-muted transition-colors hover:text-text-primary"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-text-muted/30 bg-surface px-3 py-2.5">
        {params.scope === "today" ? (
          <dl className="grid grid-cols-3 gap-1.5">
            <StatCard label="Today" value={stats.today} tone="teal" />
            <StatCard label="Waiting" value={stats.waiting} tone="amber" />
            <StatCard label="Completed" value={stats.completed} tone="green" />
          </dl>
        ) : (
          <dl className="grid grid-cols-2 gap-1.5">
            <StatCard label="Total" value={stats.total} tone="blue" />
            <StatCard label="New This Month" value={stats.newThisMonth} tone="violet" />
          </dl>
        )}
      </div>

      <div role="tablist" aria-label="Patient scope" className="flex border-b border-text-muted/30">
        {PATIENT_SCOPES.map((scope) => {
          const active = params.scope === scope;
          return (
            <Link
              key={scope}
              role="tab"
              aria-selected={active}
              href={patientDirectoryHref({ ...params, scope, page: 1 })}
              scroll={false}
              className={cn(
                "flex-1 px-3 py-2.5 text-center text-[12.5px] transition-colors",
                active
                  ? "border-b-2 border-primary font-bold text-primary"
                  : "border-b-2 border-transparent font-medium text-text-muted hover:text-text-primary",
              )}
            >
              {PATIENT_SCOPE_LABELS[scope]}
              {scope === "today" && stats.today > 0 && (
                <span className="ml-1.5 text-xs text-text-muted">
                  {stats.today}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-text-muted/30 px-4 py-2.5">
        {(params.scope === "today" ? PATIENT_TODAY_SEGMENTS : PATIENT_SEGMENTS).map(
          (segment) => {
            const active = params.segment === segment;
            return (
              <button
                key={segment}
                type="button"
                onClick={() =>
                  router.replace(
                    patientDirectoryHref({ ...params, segment, page: 1 }),
                    { scroll: false },
                  )
                }
                aria-pressed={active}
                className={cn(
                  "whitespace-nowrap rounded-pill border px-3 py-1 text-[11.5px] font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-surface"
                    : "border-text-muted/20 bg-surface text-text-secondary hover:border-text-muted/50 hover:text-text-primary",
                )}
              >
                {PATIENT_SEGMENT_LABELS[segment]}
              </button>
            );
          },
        )}
      </div>

      {patients.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-10 text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-pill bg-primary/10">
            <UserPlus aria-hidden="true" className="size-5 text-primary" />
          </div>
          <p className="text-sm font-medium text-text-primary">
            {stats.total === 0 ? "Add your first patient" : "No patients match"}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {stats.total === 0
              ? "Patients are the people your clinic sees."
              : params.scope === "today"
                ? "Nobody is booked in today. Switch to All Patients to see the full directory."
                : "Try a different name or phone, or clear the filters."}
          </p>
          {stats.total === 0 && canManage && (
            <Button size="sm" className="mt-4" onClick={onAddPatient}>
              <Plus aria-hidden="true" />
              Add Patient
            </Button>
          )}
          {stats.total > 0 && (
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link
                href={patientDirectoryHref({
                  selectedId: params.selectedId,
                  tab: params.tab,
                })}
                scroll={false}
              >
                Clear filters
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="min-w-0 divide-y divide-text-muted/25">
          {patients.map((patient) => (
            <li key={patient.id}>
              <PatientCard
                patient={patient}
                params={params}
                selected={patient.id === selectedPatientId}
                timezone={timezone}
                queue={todayQueue[patient.id]}
              />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Patient pages"
          className="flex items-center justify-between gap-2 border-t border-text-muted/30 p-3 text-xs"
        >
          <PageLink
            params={params}
            page={params.page - 1}
            disabled={params.page <= 1}
            label="Previous"
            icon="left"
          />
          <p className="text-text-secondary">
            {params.page} / {pageCount}
          </p>
          <PageLink
            params={params}
            page={params.page + 1}
            disabled={params.page >= pageCount}
            label="Next"
            icon="right"
          />
        </nav>
      )}

      {tooltip}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "teal" | "amber" | "green" | "blue" | "violet";
}) {
  const numberColor: Record<typeof tone, string> = {
    teal: "text-primary",
    amber: "text-status-warning",
    green: "text-status-success",
    blue: "text-status-info",
    violet: "text-[#8B5CF6]",
  };
  return (
    <div className="rounded-[10px] border border-text-muted/20 bg-skeleton px-2.5 py-2.5">
      <dt className="truncate text-[11.5px] font-medium text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[22px] font-bold leading-none tabular-nums ${numberColor[tone]}`}
      >
        {value}
      </dd>
    </div>
  );
}

function QueueStatusPill({ status }: { status: VisitStatus }) {
  const meta = VISIT_STATUS_META[status];
  const tone = visitStatusTone(status);
  if (!meta) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-1.5 py-px text-[10px] font-semibold",
        tone.pill,
      )}
    >
      <span aria-hidden="true" className={cn("size-1 rounded-pill", tone.dot)} />
      {meta.label}
    </span>
  );
}

const PatientCard = memo(function PatientCard({
  patient,
  params,
  selected,
  timezone,
  queue,
}: {
  patient: PatientDirectoryRow;
  params: PatientDirectoryParams;
  selected: boolean;
  timezone: string;
  /** Today's visit for this patient, if they are in today's queue. */
  queue?: { status: VisitStatus; token: number | null };
}) {
  // `last_visit_at` is the clinically meaningful date (patient actually came
  // in); fall back to the booking so brand-new clinics still show something.
  const lastSeenIso = patient.last_visit_at ?? patient.last_appointment_at;
  const lastSeen = lastSeenIso
    ? formatNaiveDate(utcIsoToClinicLocalInput(lastSeenIso, timezone).slice(0, 10))
    : "";
  const isFirstVisit = (patient.visit_count ?? 0) <= 1;

  return (
    <Link
      // `tab: "overview"` on purpose: a newly opened record starts at its front
      // page rather than inheriting whichever tab the previous patient was on.
      href={patientDirectoryHref({
        ...params,
        selectedId: patientKey(patient),
        tab: "overview",
      })}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-w-0 items-center gap-3 px-4 py-3 transition-colors",
        selected
          ? "bg-primary/5"
          : "hover:bg-app",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[34px] shrink-0 items-center justify-center rounded-pill text-xs font-semibold",
          avatarColorFor(patient.id),
        )}
      >
        {initialsOf(patient.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-text-primary">
            {patient.name}
          </span>
          {patient.upcoming_count > 0 && (
            <span className="shrink-0 rounded-pill bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {patient.upcoming_count} upcoming
            </span>
          )}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
          {queue && <QueueStatusPill status={queue.status} />}
          {queue?.token != null && (
            <span className="font-semibold tabular-nums text-text-secondary">
              #{queue.token}
            </span>
          )}
          {queue && (
            <span aria-hidden="true" className="h-3 w-px bg-text-muted/30" />
          )}
          {patient.patient_code && (
            <span className="font-mono">{patient.patient_code}</span>
          )}
          {patient.phone && <span className="truncate">{patient.phone}</span>}
          <span>
            {isFirstVisit
              ? patient.visit_count === 1
                ? "First visit"
                : "Not seen yet"
              : `${patient.visit_count} visits`}
          </span>
          {lastSeen && <span>{lastSeen}</span>}
        </span>
      </span>

      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-text-muted"
      />
    </Link>
  );
});

/**
 * The collapsed queue: today's list as a board of tokens rather than a list of
 * rows. Each slot is the patient's initials under a ring coloured by where they
 * are in the queue, with their token beneath — the same information the expanded
 * rows carry, at a fifth of the width.
 *
 * It lays out as a row below `lg` (the pane is full width there, so a vertical
 * rail would waste the screen) and as a rail from `lg` up.
 */
function QueueSpine({
  patients,
  params,
  selectedPatientId,
  todayQueue,
  onExpand,
}: {
  patients: PatientDirectoryRow[];
  params: PatientDirectoryParams;
  selectedPatientId: string | null;
  todayQueue: PatientTodayQueue;
  onExpand: () => void;
}) {
  const { tipProps, tooltip } = useHoverTip();
  const waiting = patients.filter((patient) => {
    const status = todayQueue[patient.id]?.status;
    return status === "waiting" || status === "checked_in";
  }).length;

  return (
    <div className="flex min-w-0 flex-col rounded-card border border-text-muted/30 bg-surface">
      <div className="flex items-center justify-center gap-2 border-b border-text-muted/30 px-2 py-2">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-label="Expand patient queue"
          {...tipProps("Expand queue")}
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ChevronsRight aria-hidden="true" className="size-4" />
        </button>
        {waiting > 0 && (
          <span className="rounded-pill bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-status-warning">
            {waiting}
          </span>
        )}
      </div>

      {patients.length === 0 ? (
        <p className="px-2 py-5 text-center text-[10px] leading-tight text-text-muted">
          No patients
        </p>
      ) : (
        <ul className="scrollbar-none flex gap-1.5 overflow-x-auto p-2 lg:flex-col lg:items-center lg:overflow-x-hidden lg:overflow-y-auto">
          {patients.map((patient) => {
            const queue = todayQueue[patient.id];
            const selected = patient.id === selectedPatientId;
            const label = queue?.token != null
              ? `${patient.name} · #${queue.token}`
              : patient.name;
            return (
              <li key={patient.id}>
                <Link
                  href={patientDirectoryHref({
                    ...params,
                    selectedId: patientKey(patient),
                    tab: "overview",
                  })}
                  scroll={false}
                  aria-label={label}
                  aria-current={selected ? "true" : undefined}
                  {...tipProps(label)}
                  className={cn(
                    "flex w-[52px] shrink-0 flex-col items-center gap-1 rounded-control py-1.5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected ? "bg-primary/10" : "hover:bg-app",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-pill text-[11px] font-semibold ring-2 ring-offset-2 ring-offset-surface",
                      avatarColorFor(patient.id),
                      visitStatusTone(queue?.status).ring,
                    )}
                  >
                    {initialsOf(patient.name)}
                  </span>
                  <span className="h-3 text-[10px] font-semibold leading-3 tabular-nums text-text-muted">
                    {queue?.token != null ? `#${queue.token}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tooltip}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
  icon,
}: {
  params: PatientDirectoryParams;
  page: number;
  disabled: boolean;
  label: string;
  icon: "left" | "right";
}) {
  const Icon = icon === "left" ? ChevronLeft : ChevronRight;
  if (disabled) {
    return (
      <Button variant="outline" size="sm" className="h-8 px-2" disabled>
        {icon === "left" && <Icon aria-hidden="true" />}
        {label}
        {icon === "right" && <Icon aria-hidden="true" />}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className="h-8 px-2">
      <Link href={patientDirectoryHref({ ...params, page })} scroll={false}>
        {icon === "left" && <Icon aria-hidden="true" />}
        {label}
        {icon === "right" && <Icon aria-hidden="true" />}
      </Link>
    </Button>
  );
}
