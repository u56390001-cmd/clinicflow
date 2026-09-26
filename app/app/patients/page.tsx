import type { Metadata } from "next";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { PatientsWorkspace } from "@/components/patients/patients-workspace";
import { PatientRecordPane } from "@/components/patients/patient-record-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { isPatientSummaryEnabled } from "@/lib/ai/patient-summary";
import { buildAppointmentViews } from "@/lib/appointments-view";
import { canManageClinical, canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { fetchPrescriptionTemplates } from "@/lib/consultation-queries";
import {
  escapeLikeSearchTerm,
  isPatientUuid,
  parsePatientDirectoryParams,
  PATIENT_PAGE_SIZE,
  patientDirectoryHref,
  type PatientDirectoryParams,
  type PatientTodayQueue,
} from "@/lib/patient-directory";
import { fetchPatientRecord } from "@/lib/patient-record";
import { fetchPatientDocuments } from "@/lib/patient-documents-queries";
import { createClient } from "@/lib/supabase/server";
import { clinicDayRangeUtc, clinicMonthStart, clinicToday } from "@/lib/time";
import type { PrescriptionTabBundle } from "@/components/patients/record/prescription-tab";
import type { ActiveVisitInfo } from "@/components/patients/record/record-banner";
import type { Database, Doctor, PatientDirectoryRow, Prescription, Vitals } from "@/types/database";

export const metadata: Metadata = { title: "Patients" };

type TypedClient = SupabaseClient<Database>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ActiveVisitBundle = {
  activeVisit: ActiveVisitInfo | null;
  canStart: boolean;
  /**
   * Everything the Prescription tab needs for today's visit — the saved row,
   * templates, the visit's doctor, vitals. `null` when there is no active
   * visit today (the tab then shows its empty state), or when the extra reads
   * failed; the tab degrades to a blank-but-working form rather than throwing.
   */
  rxBundle: PrescriptionTabBundle | null;
};

const EMPTY_ACTIVE_VISIT: ActiveVisitBundle = {
  activeVisit: null,
  canStart: false,
  rxBundle: null,
};

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parsePatientDirectoryParams(await searchParams);
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <ClinicEmptyState />
      </div>
    );
  }

  const clinicId = access.clinic.id;
  const timezone = access.clinic.timezone;
  const todayLocal = clinicToday(timezone);
  const today = clinicDayRangeUtc(todayLocal, timezone);
  const monthStart = clinicDayRangeUtc(clinicMonthStart(todayLocal), timezone);

  // Patients booked in today, in the clinic's own timezone. The directory view
  // deliberately does not join `clinics`, so "today" is resolved here (see the
  // note at 0029 section 12). One query serves both the Today KPI and the
  // Today tab's filter.
  //
  // Today's bookings and today's visit statuses are independent reads over
  // different tables, so they run together — sequential cost was 2×250ms.
  const [todayRes, todayVisitRes, totalResult, newThisMonthResult] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("patient_id")
        .eq("clinic_id", clinicId)
        .neq("status", "cancelled")
        .gte("start_time", today.startIso)
        .lt("start_time", today.endIso),
      // Today's live queue state: which of today's patients are still being seen
      // (waiting / checked in / in consultation) and which ones are done. Drives
      // the Waiting / Completed KPI cards, the Today tab's segment filter, and the
      // token + status the list pane shows against each row.
      supabase
        .from("visits")
        .select("patient_id, status, token_number")
        .eq("clinic_id", clinicId)
        .gte("checked_in_at", today.startIso)
        .lt("checked_in_at", today.endIso)
        .order("checked_in_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId),
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .gte("created_at", monthStart.startIso),
    ]);
  const todayRows = todayRes.data;
  const todayVisitRows = todayVisitRes.data;

  const todayPatientIds = [
    ...new Set(
      (todayRows ?? [])
        .map((row) => row.patient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const waitingPatientIds = [
    ...new Set(
      (todayVisitRows ?? [])
        .filter((row) =>
          ["waiting", "checked_in", "in_consultation"].includes(row.status),
        )
        .map((row) => row.patient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const completedPatientIds = [
    ...new Set(
      (todayVisitRows ?? [])
        .filter((row) => row.status === "completed")
        .map((row) => row.patient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  // Token + status per patient for today. Rows are read oldest-first and later
  // rows overwrite earlier ones, so a patient checked in twice today reports
  // the visit that is actually running.
  const todayQueue: PatientTodayQueue = {};
  for (const row of todayVisitRows ?? []) {
    if (!row.patient_id) continue;
    todayQueue[row.patient_id] = {
      status: row.status,
      token: row.token_number,
    };
  }

  const stats = {
    total: totalResult.count ?? 0,
    newThisMonth: newThisMonthResult.count ?? 0,
    today: todayPatientIds.length,
    waiting: waitingPatientIds.length,
    completed: completedPatientIds.length,
  };

  // The Today tab's segment pills slice the queue: `waiting` / `completed`
  // narrow today's bookings to the matching visit state, `all` keeps everyone
  // booked today. `in.()` on an empty list is not worth sending, so short-
  // circuit to an empty page for both zero-bookings and zero-stat matches.
  const todaySegmentIds =
    params.scope === "today"
      ? params.segment === "waiting"
        ? waitingPatientIds
        : params.segment === "completed"
          ? completedPatientIds
          : todayPatientIds
      : todayPatientIds;
  const emptyToday =
    params.scope === "today" && todaySegmentIds.length === 0;

  const [listResult, selectedPatient] = await Promise.all([
    emptyToday
      ? Promise.resolve({ data: [] as PatientDirectoryRow[], count: 0, error: null })
      : runDirectoryQuery(supabase, clinicId, params, todaySegmentIds),
    fetchSelectedPatient(supabase, clinicId, params.selectedId),
  ]);

  if (listResult.error) {
    console.error("[patients page] patient_directory query failed", {
      clinicId,
      code: listResult.error.code,
      message: listResult.error.message,
    });
  }

  // The record's own queries run inside `PatientRecordStream` below, behind a
  // Suspense boundary, so the queue paints while they are still in flight.
  const recordPane = selectedPatient ? (
    <Suspense fallback={<RecordPaneSkeleton />}>
      <PatientRecordStream
        clinicId={clinicId}
        patient={selectedPatient}
        params={params}
        timezone={timezone}
        today={today}
        canManage={canManageClinical(access.role)}
        aiSummaryEnabled={isPatientSummaryEnabled()}
        backHref={patientDirectoryHref({ ...params, selectedId: "" })}
        clinic={{
          name: access.clinic.name,
          address: access.clinic.address,
          phone: access.clinic.phone,
        }}
      />
    </Suspense>
  ) : null;

  return (
    <div className="space-y-4">
      <PatientsWorkspace
        patients={listResult.data ?? []}
        total={listResult.count ?? listResult.data?.length ?? 0}
        stats={stats}
        todayQueue={todayQueue}
        params={params}
        selectedPatient={selectedPatient}
        recordPane={recordPane}
        canManage={canManageClinical(access.role)}
        canMerge={canWriteClinic(access.role)}
        timezone={timezone}
        clinic={{
          id: access.clinic.id,
          name: access.clinic.name,
          address: access.clinic.address,
          phone: access.clinic.phone,
        }}
      />
    </div>
  );
}

async function PatientRecordStream({
  clinicId,
  patient,
  params,
  timezone,
  today,
  canManage,
  aiSummaryEnabled,
  backHref,
  clinic,
}: {
  clinicId: string;
  patient: PatientDirectoryRow;
  params: PatientDirectoryParams;
  timezone: string;
  today: { startIso: string; endIso: string };
  canManage: boolean;
  aiSummaryEnabled: boolean;
  backHref: string;
  clinic: { name: string; address: string | null; phone: string | null };
}) {
  const supabase = await createClient();
  const [record, appointments, documents, activeVisitInfo] = await Promise.all([
    fetchPatientRecord(supabase, clinicId, patient.id),
    fetchPatientAppointments(supabase, clinicId, patient),
    fetchPatientDocuments(supabase, clinicId, patient.id),
    fetchActiveVisitInfo(supabase, clinicId, patient.id, today),
  ]);

  return (
    <PatientRecordPane
      patient={patient}
      record={record}
      documents={documents}
      params={params}
      upcoming={appointments.upcoming}
      past={appointments.past}
      timezone={timezone}
      canManage={canManage}
      aiSummaryEnabled={aiSummaryEnabled}
      activeVisitInfo={activeVisitInfo}
      backHref={backHref}
      clinic={clinic}
    />
  );
}

function RecordPaneSkeleton() {
  return (
    <div className="min-w-0 px-2 pt-2">
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="mt-3 space-y-3 px-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    </div>
  );
}

/**
 * The directory list query: search, scope, segment, legacy filter, sort and
 * pagination, all server-side against the RLS-scoped `patient_directory` view.
 * Every query also filters `clinic_id` explicitly (defense in depth).
 */
function runDirectoryQuery(
  supabase: TypedClient,
  clinicId: string,
  params: PatientDirectoryParams,
  todaySegmentIds: string[],
) {
  let query = supabase
    .from("patient_directory")
    .select("*", { count: "exact" })
    .eq("clinic_id", clinicId);

  if (params.q) {
    const term = escapeLikeSearchTerm(params.q);
    query = query.or(
      `name.ilike.*${term}*,email.ilike.*${term}*,phone.ilike.*${term}*,patient_code.ilike.*${term}*`,
    );
  }

  if (params.scope === "today") {
    query = query.in("id", todaySegmentIds);
  }

  // `visit_count` counts actual check-ins, so "First Visit" covers both the
  // never-seen (0) and the mid-first-visit (1) cases.
  if (params.segment === "returning") {
    query = query.gt("visit_count", 1);
  } else if (params.segment === "first_visit") {
    query = query.lte("visit_count", 1);
  }

  if (params.filter === "upcoming") {
    query = query.gt("upcoming_count", 0);
  } else if (params.filter === "none") {
    query = query.eq("appointment_count", 0);
  } else if (params.filter === "recent") {
    query = query.gte(
      "created_at",
      new Date(Date.now() - THIRTY_DAYS_MS).toISOString(),
    );
  }

  switch (params.sort) {
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "last_appointment":
      query = query.order("last_appointment_at", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "appointment_count":
      query = query.order("appointment_count", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    default:
      query = query.order("name", { ascending: true, nullsFirst: false });
  }

  const offset = (params.page - 1) * PATIENT_PAGE_SIZE;
  return query.range(offset, offset + PATIENT_PAGE_SIZE - 1);
}

/**
 * Resolve `?id=` to a record. Accepts a UHID (`CLI-2026-00001`, what the UI
 * links) or a raw UUID, so links written before the 0029 backfill still work.
 * Returns `null` rather than throwing when the id belongs to another clinic —
 * the pane renders a "not found" placeholder.
 */
async function fetchSelectedPatient(
  supabase: TypedClient,
  clinicId: string,
  selectedId: string,
): Promise<PatientDirectoryRow | null> {
  if (!selectedId) return null;

  const base = supabase
    .from("patient_directory")
    .select("*")
    .eq("clinic_id", clinicId);

  const { data, error } = await (
    isPatientUuid(selectedId)
      ? base.eq("id", selectedId)
      : base.eq("patient_code", selectedId)
  ).maybeSingle();

  if (error) {
    console.error("[patients page] selected patient lookup failed", {
      clinicId,
      code: error.code,
      message: error.message,
    });
    return null;
  }
  return (data as PatientDirectoryRow | null) ?? null;
}

/** Upcoming / past appointment views for the open record. */
async function fetchPatientAppointments(
  supabase: TypedClient,
  clinicId: string,
  patient: PatientDirectoryRow,
) {
  const [{ data: appointments }, { data: services }, { data: doctors }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patient.id),
      supabase.from("services").select("*").eq("clinic_id", clinicId),
      // Without this, `buildAppointmentViews` has nothing to resolve
      // `doctor_id` against and every row reads "Doctor unassigned".
      supabase.from("doctors").select("*").eq("clinic_id", clinicId),
    ]);

  const views = buildAppointmentViews(
    appointments ?? [],
    [patient],
    services ?? [],
    doctors ?? [],
  );
  const nowMs = Date.now();
  const withStart = views.map((view) => ({
    view,
    startMs: new Date(view.start_time).getTime(),
  }));
  const upcomingRows = withStart
    .filter(
      ({ view, startMs }) =>
        (view.status === "pending" || view.status === "confirmed") &&
        startMs >= nowMs,
    )
    .sort((a, b) => a.startMs - b.startMs)
    .map(({ view }) => view);
  const upcomingIds = new Set(upcomingRows.map((view) => view.id));
  const pastRows = withStart
    .filter(({ view }) => !upcomingIds.has(view.id))
    .sort((a, b) => b.startMs - a.startMs)
    .map(({ view }) => view);

  return { upcoming: upcomingRows, past: pastRows };
}

/**
 * Whether the selected patient is in today's active queue, and whether the
 * "Start Consultation" button should be offered.
 *
 * Mirrors the doctor waiting list's queue-position logic: a patient can be
 * started only when they are the first waiting/checked-in visit in queue
 * order for their doctor AND nobody else is already in consultation with
 * that same doctor.
 */
async function fetchActiveVisitInfo(
  supabase: TypedClient,
  clinicId: string,
  patientId: string,
  today: { startIso: string; endIso: string },
): Promise<ActiveVisitBundle> {
  const { data: activeVisits, error } = await supabase
    .from("visits")
    .select("id, patient_id, doctor_id, status, token_number, queue_position, checked_in_at")
    .eq("clinic_id", clinicId)
    .in("status", ["waiting", "checked_in", "in_consultation"])
    .gte("checked_in_at", today.startIso)
    .lt("checked_in_at", today.endIso)
    .order("queue_position", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[patients page] active visit lookup failed", {
      clinicId,
      code: error.code,
      message: error.message,
    });
    return EMPTY_ACTIVE_VISIT;
  }

  type QueueVisitRow = {
    id: string;
    patient_id: string;
    doctor_id: string | null;
    status: ActiveVisitInfo["status"];
    token_number: number | null;
    queue_position: number | null;
    checked_in_at: string | null;
  };
  const visits = (activeVisits ?? []) as QueueVisitRow[];
  const mine = visits.find((row) => row.patient_id === patientId);
  if (!mine) return EMPTY_ACTIVE_VISIT;

  // Queue eligibility is per doctor (mirrors `complete_and_advance`, which
  // only promotes within the same doctor — `null is not distinct from null`
  // groups doctor-less visits together too).
  const sameDoctor = (row: QueueVisitRow) => row.doctor_id === mine.doctor_id;

  const someoneInConsultation = visits.some(
    (row) => sameDoctor(row) && row.status === "in_consultation",
  );
  const firstWaiting =
    (visits.find((row) => sameDoctor(row) && row.status === "waiting") ??
      visits.find(
        (row) => sameDoctor(row) && row.status === "checked_in",
      )) ??
    null;

  // The Prescription tab's data. These four reads all key off the visit that
  // was just found, so they go out together — one more round trip on this
  // path, and only for a patient who actually has a live visit (the common
  // case above returns before reaching here). Templates depend on the visit's
  // doctor, which is already in `mine`, so no extra hop for that either.
  const [rxRes, vitalsRes, doctorRes, templates] = await Promise.all([
    supabase
      .from("prescriptions")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("visit_id", mine.id)
      .maybeSingle(),
    supabase
      .from("vitals")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("visit_id", mine.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    mine.doctor_id
      ? supabase
          .from("doctors")
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("id", mine.doctor_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    mine.doctor_id
      ? fetchPrescriptionTemplates(supabase, clinicId, mine.doctor_id)
      : Promise.resolve([]),
  ]);

  const rxError = rxRes.error ?? vitalsRes.error ?? doctorRes.error;
  if (rxError) {
    // The tab can still open a blank form from the visit alone, so a failed
    // enrichment is a log line, not a broken record pane.
    console.error("[patients page] prescription tab data failed", {
      clinicId,
      visitId: mine.id,
      code: rxError.code,
      message: rxError.message,
    });
  }

  return {
    activeVisit: {
      id: mine.id,
      status: mine.status,
      tokenNumber: mine.token_number ?? 0,
    },
    // Already actively in consultation, or behind someone — no Start button.
    canStart:
      mine.status !== "in_consultation" &&
      !someoneInConsultation &&
      firstWaiting?.id === mine.id,
    rxBundle: {
      visit: {
        id: mine.id,
        status: mine.status,
        tokenNumber: mine.token_number ?? 0,
      },
      // `checked_in_at` is non-null for any row this query can return (the
      // date filters themselves require it); the fallback only keeps the
      // printable visit date from producing an Invalid Date on a NULL.
      checkedInAt: mine.checked_in_at ?? new Date().toISOString(),
      doctorId: mine.doctor_id,
      visitDoctor: (doctorRes.data as Doctor | null) ?? null,
      prescription: (rxRes.data as Prescription | null) ?? null,
      templates,
      vitals: (vitalsRes.data as Vitals | null) ?? null,
    },
  };
}
