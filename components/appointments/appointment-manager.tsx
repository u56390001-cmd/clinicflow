"use client";

import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  CircleUser,
  Clock,
  Download,
  EllipsisVertical,
  Eye,
  Funnel,
  MoreHorizontal,
  Plus,
  Search,
  Stethoscope,
  UserCheck,
  AlertCircle,
  Calendar,
  CreditCard,
  Pencil,
  XCircle,
  UserX,
  CalendarDays,
  X,
  Activity,
  GripHorizontal,
  PersonStanding,
} from "lucide-react";

import { AppointmentForm } from "@/components/appointments/appointment-form";
import { AppointmentDetailsModal } from "@/components/appointments/appointment-details-modal";
import { BookingModal } from "@/components/appointments/booking-modal";
import { ServicesTab } from "@/components/appointments/services-tab";
import { ActionConfirmModal } from "@/components/appointments/action-confirm-modal";
import {
  ExportAppointmentsModal,
  type ExportOptions,
} from "@/components/appointments/export-appointments-modal";
import { RowMenu, type RowMenuAction } from "@/components/appointments/row-menu";
import { buildAppointmentSheet, downloadCsvFile, downloadXlsxFile } from "@/lib/export";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckInModal } from "@/components/queue/check-in-modal";
import type { DoctorVitalsConfigMap } from "@/lib/vitals-config";
import { setAppointmentStatusAction } from "@/lib/actions/appointments";
import { completeAndAdvanceAction } from "@/lib/actions/consultation";
import { reorderQueueAction } from "@/lib/actions/queue";
import {
  APPOINTMENT_STATUS_META,
  VISIT_STATUS_META,
  VISIT_PAYMENT_STATUS_META,
} from "@/lib/constants";
import { formatClinicLocalSlot, utcIsoToClinicLocalInput } from "@/lib/time";
import type { QueueAppointment, AppointmentRow } from "@/lib/visits-queries";
import type { ActionResult } from "@/types";
import type { Doctor, Patient, Service, Visit, Vitals } from "@/types/database";

type QueueItem = Visit & {
  patientName: string;
  patientPhone: string | null;
  doctorName: string | null;
  tokenNumber: number;
  vitals: Vitals | null;
};

type SubTab = "today" | "upcoming" | "completed" | "all" | "cancelled";
type ViewMode = "consultation" | "service";

/** Which Today-queue action is awaiting confirmation in the popup. */
type ConfirmKind = "confirm_appointment" | "no_show" | "cancel" | "complete";

/** Appointment row enriched with full patient / doctor / service objects for the details modal. */
type DetailsRow = AppointmentRow & {
  patient: Patient | null;
  doctor: Doctor | null;
  service: Service | null;
};

/**
 * Human-readable, stable UHID derived from patient creation order, e.g.
 * "UHID-0001". Display-only (no DB column); consistent with the fact that this
 * project exposes patients by UUID everywhere else, so it is computed from the
 * same full patient list used across the Appointments module.
 */
function buildUhids(patients: Patient[]): Map<string, string> {
  const ordered = [...patients].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const map = new Map<string, string>();
  ordered.forEach((patient, index) => {
    map.set(patient.id, `UHID-${String(index + 1).padStart(4, "0")}`);
  });
  return map;
}

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
  { key: "cancelled", label: "Cancelled" },
];

/** Status filter options. Key is the filter-key; matched against both the
 * appointment `status` and the related visit `status` (see matchesStatusFilter). */
const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: "scheduled", label: "Scheduled" },
  { key: "checked_in", label: "Checked In" },
  { key: "in_consultation", label: "In Consultation" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No Show" },
];

/** Source filter options. Each maps to the real `booking_source` value(s) the
 * app actually writes. "Website" covers both direct site bookings ('website')
 * and the website chat widget ('widget'). */
const SOURCE_FILTER_OPTIONS: {
  value: string;
  label: string;
  sources: string[];
}[] = [
  { value: "dashboard", label: "Walk-in (Dashboard)", sources: ["dashboard"] },
  { value: "ai_agent", label: "WhatsApp Chatbot", sources: ["ai_agent"] },
  { value: "phone_call", label: "Phone Call", sources: ["phone_call"] },
  { value: "website", label: "Website", sources: ["website", "widget"] },
];

type StatusFilterKey =
  | "scheduled"
  | "checked_in"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "no_show";

interface AppointmentFilters {
  doctorIds: string[];
  statuses: StatusFilterKey[];
  sources: string[];
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: AppointmentFilters = {
  doctorIds: [],
  statuses: [],
  sources: [],
  dateFrom: "",
  dateTo: "",
};

/** True when an appointment row should show for the selected status key(s).
 * Reconciles the split status model: appointment status vs. visit status. */
function rowMatchesStatus(
  row: Pick<AppointmentRow, "status" | "visit">,
  key: StatusFilterKey,
): boolean {
  const vStatus = row.visit?.status ?? null;
  switch (key) {
    case "scheduled":
      return row.status === "pending" || row.status === "confirmed";
    case "checked_in":
      return vStatus === "checked_in" || vStatus === "waiting";
    case "in_consultation":
      return vStatus === "in_consultation";
    case "completed":
      return row.status === "completed" || vStatus === "completed";
    case "cancelled":
      return row.status === "cancelled";
    case "no_show":
      return row.status === "no_show";
  }
}

/** Applies search + all four filters (AND across categories, OR within a
 * category) to a row. Shared by both the table rows and the Today queue. */
function rowMatchesAll(
  row: Pick<
    AppointmentRow,
    | "patientName"
    | "patientPhone"
    | "doctorName"
    | "serviceName"
    | "doctor_id"
    | "status"
    | "visit"
    | "booking_source"
    | "start_time"
  >,
  query: string,
  filters: AppointmentFilters,
): boolean {
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    const phone = (row.patientPhone ?? "").replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    const nameHit =
      row.patientName.toLowerCase().includes(q) ||
      (row.doctorName && row.doctorName.toLowerCase().includes(q)) ||
      row.serviceName.toLowerCase().includes(q);
    const phoneHit = qDigits.length > 0 && phone.includes(qDigits);
    if (!nameHit && !phoneHit) return false;
  }

  if (filters.doctorIds.length > 0) {
    if (!row.doctor_id || !filters.doctorIds.includes(row.doctor_id))
      return false;
  }

  if (filters.statuses.length > 0) {
    if (!filters.statuses.some((key) => rowMatchesStatus(row, key)))
      return false;
  }

  if (filters.sources.length > 0) {
    const acceptedSources = SOURCE_FILTER_OPTIONS.filter((option) =>
      filters.sources.includes(option.value),
    ).flatMap((option) => option.sources);
    if (!acceptedSources.includes(row.booking_source)) return false;
  }

  if (filters.dateFrom || filters.dateTo) {
    const day = row.start_time.slice(0, 10);
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
  }

  return true;
}

/** Number of filter categories with a non-default (active) selection. */
function activeFilterCount(filters: AppointmentFilters): number {
  let count = 0;
  if (filters.doctorIds.length > 0) count++;
  if (filters.statuses.length > 0) count++;
  if (filters.sources.length > 0) count++;
  if (filters.dateFrom || filters.dateTo) count++;
  return count;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-indigo-500",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Clinic-local `DD-MM-YYYY` for the reference table row layout. */
function formatRowDate(startIso: string, tz: string): string {
  const local = utcIsoToClinicLocalInput(startIso, tz).slice(0, 10);
  const [y, m, d] = local.split("-");
  return `${d}-${m}-${y}`;
}

/** Clinic-local `7:30 PM - 8:00 PM` time range for the reference row layout. */
function formatRowTimeRange(startIso: string, endIso: string, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  const toDate = (value: string) => {
    const [d, t] = value.split("T");
    const [hh, mm] = (t ?? "00:00").split(":");
    return new Date(`${d}T${hh}:${mm}:00Z`);
  };
  const start = fmt.format(toDate(utcIsoToClinicLocalInput(startIso, tz)));
  const end = fmt.format(toDate(utcIsoToClinicLocalInput(endIso, tz)));
  return `${start} - ${end}`;
}

export function AppointmentManager({
  todayAppointments,
  queue,
  allAppointments,
  patients,
  services,
  doctors,
  timezone,
  canManage,
  canMerge,
  initialCreateIntent,
  vitalsConfigs,
}: {
  todayAppointments: QueueAppointment[];
  queue: QueueItem[];
  allAppointments: AppointmentRow[];
  patients: Patient[];
  services: Service[];
  doctors: Doctor[];
  timezone: string;
  canManage: boolean;
  /**
   * Passed through to the booking form's duplicate-merge entry point. Every
   * member passes it (see `canMergePatients`) — the front desk is who books
   * walk-ins, and so is who meets the duplicate.
   */
  canMerge: boolean;
  initialCreateIntent?: "consultation" | "service" | null;
  /** Server-fetched doctor → vitals config map for the Add Vitals popup. */
  vitalsConfigs?: DoctorVitalsConfigMap | null;
}) {
  const [activeTab, setActiveTab] = useState<SubTab>("today");
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialCreateIntent === "service" ? "service" : "consultation",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [checkInTarget, setCheckInTarget] = useState<QueueAppointment | null>(
    null,
  );
  const [creating, setCreating] = useState<"consultation" | "service" | null>(
    initialCreateIntent ?? null,
  );
  const [bookServiceTarget, setBookServiceTarget] = useState<string | null>(
    null,
  );
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    kind: ConfirmKind;
    appt: QueueAppointment;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filters, setFilters] = useState<AppointmentFilters>(DEFAULT_FILTERS);
  const [rawSearch, setRawSearch] = useState(searchQuery);

  // Debounce the search input (~300ms) so we don't recompute on every keystroke
  // while preserving responsiveness when the user pauses typing.
  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(rawSearch), 300);
    return () => window.clearTimeout(t);
  }, [rawSearch]);

  const uhids = useMemo(() => buildUhids(patients), [patients]);

  // Map waiting-queue visits to their today appointments so the queue cards can
  // show the real slot time and open the CheckInModal (vitals) directly.
  const apptByVisitId = useMemo(() => {
    const map = new Map<string, QueueAppointment>();
    for (const appt of todayAppointments) {
      if (appt.visit) map.set(appt.visit.id, appt);
    }
    return map;
  }, [todayAppointments]);

  // The live waiting queue in the Today view respects the active filters too,
  // so the front desk only sees the patients that match the current search +
  // filters (doctor / status / source / date range).
  const filteredQueue = useMemo(
    () =>
      queue.filter((visit) => {
        const appt = apptByVisitId.get(visit.id);
        if (!appt) return true;
        return rowMatchesAll(appt, searchQuery, filters);
      }),
    [queue, apptByVisitId, searchQuery, filters],
  );

  const patientsById = useMemo(
    () => new Map(patients.map((p) => [p.id, p])),
    [patients],
  );
  const servicesById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const doctorsById = useMemo(
    () => new Map(doctors.map((d) => [d.id, d])),
    [doctors],
  );

  function enrichRow(row: AppointmentRow): DetailsRow {
    return {
      ...row,
      patient: patientsById.get(row.patient_id) ?? null,
      doctor: row.doctor_id ? doctorsById.get(row.doctor_id) ?? null : null,
      service: servicesById.get(row.service_id) ?? null,
    };
  }

  const detailTarget: DetailsRow | null = detailTargetId
    ? (() => {
        const row = allAppointments.find((a) => a.id === detailTargetId);
        return row ? enrichRow(row) : null;
      })()
    : null;

  const editRow: AppointmentRow | null = editTargetId
    ? allAppointments.find((a) => a.id === editTargetId) ?? null
    : null;

  const editValues = editRow
    ? (() => {
        const patient = patientsById.get(editRow.patient_id) ?? null;
        const gender =
          patient?.gender && ["male", "female", "other"].includes(patient.gender)
            ? (patient.gender as "male" | "female" | "other")
            : ("" as const);
        const ctype =
          editRow.consultation_type === "online" ||
          editRow.consultation_type === "video"
            ? editRow.consultation_type
            : ("in_clinic" as const);
        return {
          appointmentId: editRow.id,
          patientId: editRow.patient_id,
          patientName: editRow.patientName,
          patientPhone: editRow.patientPhone,
          patientAge: patient?.age != null ? String(patient.age) : "",
          patientGender: gender,
          patientCity: patient?.city ?? null,
          whatsapp: patient?.whatsapp_number ?? null,
          allergies: patient?.known_allergies ?? null,
          conditions: patient?.medical_conditions ?? null,
          serviceId: editRow.service_id,
          doctorId: editRow.doctor_id,
          startNaive: utcIsoToClinicLocalInput(editRow.start_time, timezone),
          consultationType: ctype,
          notes: editRow.notes,
        };
      })()
    : undefined;

  const handleClose = () => {
    setDetailTargetId(null);
    setEditTargetId(null);
  };

  const router = useRouter();

  // Shared status transitions — both the dropdown and the details-modal footer
  // call the SAME server action (setAppointmentStatusAction), satisfying the
  // "one shared function, not two" requirement.
  async function handleNoShow(row: AppointmentRow) {
    const fd = new FormData();
    fd.set("appointmentId", row.id);
    fd.set("status", "no_show");
    const res = await setAppointmentStatusAction(null, fd);
    if (res.ok) {
      router.refresh();
      setDetailTargetId(null);
    }
  }

  async function handleCancelAppointment(row: AppointmentRow) {
    const fd = new FormData();
    fd.set("appointmentId", row.id);
    fd.set("status", "cancelled");
    const res = await setAppointmentStatusAction(null, fd);
    if (res.ok) router.refresh();
  }

  // Today-queue confirmations — one shared popup, one shared server-action per
  // flow (Confirm Appointment / Mark No Show / Cancel / Complete).
  async function runConfirmAction() {
    if (!confirmAction) return;
    const { kind, appt } = confirmAction;
    setConfirmBusy(true);
    try {
      if (kind === "complete") {
        if (appt.visit) {
          const fd = new FormData();
          fd.set("visitId", appt.visit.id);
          const res = await completeAndAdvanceAction(null, fd);
          if (res.ok) {
            router.refresh();
            setConfirmAction(null);
          }
        }
      } else {
        const status =
          kind === "confirm_appointment"
            ? "confirmed"
            : kind === "no_show"
              ? "no_show"
              : "cancelled";
        const fd = new FormData();
        fd.set("appointmentId", appt.id);
        fd.set("status", status);
        const res = await setAppointmentStatusAction(null, fd);
        if (res.ok) {
          router.refresh();
          setConfirmAction(null);
        }
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  const openConfirm = useCallback(
    (kind: ConfirmKind) => (appt: QueueAppointment) =>
      setConfirmAction({ kind, appt }),
    [],
  );

  // Popup copy per action kind.
  const confirmConfig = confirmAction
    ? (() => {
        const name = confirmAction.appt.patientName;
        const fee = confirmAction.appt.servicePrice;
        switch (confirmAction.kind) {
          case "confirm_appointment":
            return {
              title: "Confirm Appointment",
              message: `Confirm payment of \u20B9${fee.toLocaleString()} from ${name}? Patient will be marked as confirmed but NOT checked in yet.`,
              variant: "primary" as const,
              confirmText: "Confirm",
            };
          case "no_show":
            return {
              title: "Mark No Show",
              message: `Mark ${name} as a no-show? The appointment will be moved out of the queue.`,
              variant: "destructive" as const,
              confirmText: "Mark No Show",
            };
          case "cancel":
            return {
              title: "Cancel Appointment",
              message: "Are you sure you want to cancel this appointment?",
              variant: "destructive" as const,
              confirmText: "Confirm",
            };
          case "complete":
            return {
              title: "Complete Appointment",
              message:
                "Mark this appointment as completed? This will trigger follow-up reminders.",
              variant: "primary" as const,
              confirmText: "Complete",
            };
        }
      })()
    : null;

  // Stat card counts — reference spec: Today / Confirmed / Pending / Cancelled
  const todayCount = todayAppointments.length;
  const confirmedCount = todayAppointments.filter(
    (a) => a.status === "confirmed",
  ).length;
  const pendingCount = todayAppointments.filter(
    (a) => a.status === "pending",
  ).length;
  const cancelledCount = todayAppointments.filter(
    (a) => a.status === "cancelled",
  ).length;

  // Filtered table data for each sub-tab
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const filteredRows = useMemo(() => {
    let rows = allAppointments;

    // Consultations/Services toggle filter (Phase 21: any non-consultation
    // category — service, diagnostic, lab test, procedure — is a "Service").
    if (viewMode === "consultation") {
      rows = rows.filter((a) => {
        const svc = services.find((s) => s.id === a.service_id);
        return !svc || svc.category === "consultation";
      });
    } else {
      rows = rows.filter((a) => {
        const svc = services.find((s) => s.id === a.service_id);
        return svc && svc.category !== "consultation";
      });
    }

    // Sub-tab filter
    switch (activeTab) {
      case "upcoming":
        rows = rows.filter(
          (a) =>
            (a.status === "pending" || a.status === "confirmed") &&
            a.start_time >= todayStr,
        );
        break;
      case "completed":
        rows = rows.filter((a) => a.status === "completed");
        break;
      case "cancelled":
        rows = rows.filter((a) => a.status === "cancelled");
        break;
      case "all":
        // no filter
        break;
      case "today":
        // handled separately by queue view
        rows = [];
        break;
    }

    // Search + Filters (combined AND across categories)
    rows = rows.filter((a) => rowMatchesAll(a, searchQuery, filters));

    return rows;
  }, [allAppointments, activeTab, searchQuery, todayStr, viewMode, services, filters]);

  // Today queue: split by status
  const todayFiltered = todayAppointments.filter((a) =>
    rowMatchesAll(a, searchQuery, filters),
  );
  const notCheckedIn = todayFiltered.filter(
    (a) => !a.visit && a.status !== "cancelled" && a.status !== "no_show",
  );
  const inConsultation = todayFiltered.filter(
    (a) => a.visit && a.visit.status === "in_consultation",
  );
  const waitingInQueue = todayFiltered.filter(
    (a) =>
      a.visit &&
      a.visit.status !== "completed" &&
      a.visit.status !== "in_consultation",
  );

  const statCards = [
    {
      label: "Today",
      value: todayCount,
      icon: Calendar,
      color: "bg-primary/10 text-primary",
    },
    {
      label: "Confirmed",
      value: confirmedCount,
      icon: CheckCircle,
      color: "bg-green-100 text-green-600",
    },
    {
      label: "Pending",
      value: pendingCount,
      icon: AlertCircle,
      color: "bg-yellow-100 text-yellow-600",
    },
    {
      label: "Cancelled",
      value: cancelledCount,
      icon: XCircle,
      color: "bg-red-100 text-red-600",
    },
  ];

  function handleExport() {
    setExportOpen(true);
  }

  /** Resolve the export rows for the chosen range, build the sheet, download. */
  function completeExport(options: ExportOptions) {
    const dateStr = new Date().toISOString().slice(0, 10);
    let rows: AppointmentRow[] = filteredRows;
    let label = `${activeTab}-${dateStr}`;

    // The Today tab renders from the queue data, not `filteredRows`, so reuse
    // the same filtered today list for the "current view" export.
    if (activeTab === "today") rows = todayFiltered;

    if (options.range === "all") {
      rows = allAppointments;
      label = `all-${dateStr}`;
    } else if (options.range === "custom") {
      const from = options.dateFrom ?? "";
      const to = options.dateTo ?? "";
      rows = allAppointments.filter((row) => {
        const day = row.start_time.slice(0, 10);
        return (!from || day >= from) && (!to || day <= to);
      });
      label = `${from || "from"}-${to || "to"}`;
    }

    if (rows.length === 0) {
      toast.error("Nothing to export — no appointments match this range.");
      return;
    }

    const sheet = buildAppointmentSheet(rows, timezone);
    const filename = `appointments-${label}.${options.format}`;
    try {
      if (options.format === "xlsx") downloadXlsxFile(sheet, filename);
      else downloadCsvFile(sheet, filename);
      toast.success(
        `Exported ${rows.length} appointment${rows.length === 1 ? "" : "s"} (${options.format.toUpperCase()}).`,
      );
      setExportOpen(false);
    } catch {
      toast.error("Export failed. Please try again.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-xl font-bold text-text-primary lg:text-2xl">
              Appointments
            </h1>
            <p className="text-sm text-text-secondary lg:text-base">
              Manage and track patient appointments
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreating(viewMode)}
              title="Book Consultation"
              aria-label="Book new appointment"
              className="rounded-full bg-primary p-2.5 text-white shadow-sm transition-colors hover:bg-primary-light focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {creating && (
        <BookingModal open={!!creating} onClose={() => setCreating(null)}>
          <AppointmentForm
            patients={patients}
            services={services}
            doctors={doctors}
            emergency={creating === "consultation"}
            canMerge={canMerge}
            onClose={() => setCreating(null)}
          />
        </BookingModal>
      )}

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:mb-8 lg:grid-cols-4 lg:gap-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:p-5"
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex-shrink-0 rounded-lg p-1.5 ${card.color}`}
              >
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="ml-1">
                <p className="text-xs font-medium tracking-wide text-gray-500">
                  {card.label}
                </p>
                <p className="text-xl font-bold text-text-primary">
                  {card.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Consultations / Services sliding toggle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm">
          <div className="relative flex gap-1.5">
            <div
              className="absolute bottom-0 left-0 top-0 z-0 h-full rounded-xl bg-primary shadow-lg transition-transform duration-300 ease-out"
              style={{
                width: "calc(50% - 3px)",
                transform:
                  viewMode === "service"
                    ? "translateX(calc(100% + 6px))"
                    : "translateX(0px)",
              }}
            />
            <button
              type="button"
              onClick={() => setViewMode("consultation")}
              className={`relative z-10 flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === "consultation"
                  ? "text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Consultations
            </button>
            <button
              type="button"
              onClick={() => setViewMode("service")}
              className={`relative z-10 flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === "service"
                  ? "text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Services
            </button>
          </div>
        </div>
      </div>

      {/* Main table card */}
      <div className="w-full overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Sub-tabs + Search/Filter/Export */}
        <div className="border-b border-gray-200 px-3 py-3 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative">
              <div className="scrollbar-none flex gap-0 overflow-x-auto pb-1 pr-8 lg:pb-0">
                {SUB_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 pb-2 text-sm font-medium capitalize transition-all duration-300 ease-in-out lg:px-4 ${
                      activeTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex w-full items-center gap-1.5 lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSearchQuery(rawSearch);
                  }}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary lg:w-56"
                />
              </div>

              {/* Filters button */}
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                aria-expanded={filtersOpen}
                className={`flex items-center space-x-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:scale-105 hover:bg-gray-50 active:scale-95 ${
                  activeFilterCount(filters) > 0
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "text-text-secondary"
                }`}
              >
                <Funnel className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount(filters) > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
                    {activeFilterCount(filters)}
                  </span>
                )}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    filtersOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {/* Export button */}
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center space-x-2 rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all duration-200 hover:scale-105 hover:bg-gray-50 active:scale-95"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter panel (Doctor / Status / Source / Date Range / Clear All) */}
        {filtersOpen && (
          <div className="animate-fade-in-down border-b border-gray-200 bg-gray-50 px-3 py-4 lg:px-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm lg:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Doctor
                  </label>
                  <select
                    value={
                      filters.doctorIds.length === 1 ? filters.doctorIds[0] : ""
                    }
                    onChange={(e) => {
                      const id = e.target.value;
                      setFilters({ ...filters, doctorIds: id ? [id] : [] });
                    }}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm transition-all hover:shadow-md focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All Doctors</option>
                    {doctors
                      .filter((d) => d.is_visible !== false)
                      .map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={
                      filters.statuses.length === 1 ? filters.statuses[0] : ""
                    }
                    onChange={(e) => {
                      const key = e.target.value as StatusFilterKey | "";
                      setFilters({ ...filters, statuses: key ? [key] : [] });
                    }}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm transition-all hover:shadow-md focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All Statuses</option>
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Source
                  </label>
                  <select
                    value={
                      filters.sources.length === 1 ? filters.sources[0] : ""
                    }
                    onChange={(e) => {
                      const source = e.target.value;
                      setFilters({ ...filters, sources: source ? [source] : [] });
                    }}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm shadow-sm transition-all hover:shadow-md focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">All Sources</option>
                    {SOURCE_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Date Range
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5 shadow-sm">
                    <CalendarDays
                      className="h-4 w-4 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                    <input
                      type="date"
                      aria-label="From date"
                      value={filters.dateFrom}
                      onChange={(e) =>
                        setFilters({ ...filters, dateFrom: e.target.value })
                      }
                      className="min-w-0 flex-1 text-sm focus:outline-none"
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="date"
                      aria-label="To date"
                      value={filters.dateTo}
                      onChange={(e) =>
                        setFilters({ ...filters, dateTo: e.target.value })
                      }
                      className="min-w-0 flex-1 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium shadow-sm transition-all duration-200 ${
                      activeFilterCount(filters) > 0
                        ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        : "cursor-not-allowed bg-gray-100 text-gray-400"
                    }`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Clear All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content area */}
        {activeTab === "today" ? (
          <TodayView
            queue={filteredQueue}
            notCheckedIn={notCheckedIn}
            inConsultation={inConsultation}
            waitingInQueue={waitingInQueue}
            apptByVisitId={apptByVisitId}
            timezone={timezone}
            canManage={canManage}
            onCheckIn={(appt) => setCheckInTarget(appt)}
            onViewDetails={(appt) => setDetailTargetId(appt.id)}
            onEdit={(appt) => setEditTargetId(appt.id)}
            onConfirmAppointment={openConfirm("confirm_appointment")}
            onNoShow={openConfirm("no_show")}
            onCancel={openConfirm("cancel")}
            onComplete={openConfirm("complete")}
          />
        ) : viewMode === "service" ? (
          <ServicesTab
            services={services}
            onBookService={(serviceId) => setBookServiceTarget(serviceId)}
          />
        ) : (
          <TableView
            rows={filteredRows}
            timezone={timezone}
            canManage={canManage}
            uhids={uhids}
            onView={(row) => setDetailTargetId(row.id)}
            onEdit={(row) => setEditTargetId(row.id)}
            onConfirmPayment={(row) => {
              const patient = patientsById.get(row.patient_id);
              setCheckInTarget({
                ...row,
                vitals: null,
                patientAge: patient?.age ?? null,
                patientCity: patient?.city ?? null,
                patientCode: patient?.patient_code ?? null,
              });
            }}
            onNoShow={(row) => handleNoShow(row)}
            onCancel={(row) => handleCancelAppointment(row)}
          />
        )}
      </div>

      {/* Check-in modal */}
      {checkInTarget && (
        <CheckInModal
          appointment={checkInTarget}
          onClose={() => setCheckInTarget(null)}
          vitalsConfigs={vitalsConfigs}
        />
      )}

      {/* Book Service modal (from Services tab) */}
      {bookServiceTarget && (
        <BookingModal
          open={!!bookServiceTarget}
          onClose={() => setBookServiceTarget(null)}
        >
          <AppointmentForm
            patients={patients}
            services={services}
            doctors={doctors}
            initialServiceId={bookServiceTarget}
            onClose={() => setBookServiceTarget(null)}
          />
        </BookingModal>
      )}

      {/* Appointment Details modal (Eye icon / row view) */}
      {detailTarget && (
        <AppointmentDetailsModal
          appointment={detailTarget}
          patient={detailTarget.patient}
          doctor={detailTarget.doctor}
          service={detailTarget.service}
          timezone={timezone}
          uhid={
            detailTarget.patient
              ? uhids.get(detailTarget.patient.id) ?? "—"
              : "—"
          }
          canManage={canManage}
          onClose={() => setDetailTargetId(null)}
          onCheckIn={() => {
            setCheckInTarget({
              ...detailTarget,
              vitals: null,
              patientAge: detailTarget.patient?.age ?? null,
              patientCity: detailTarget.patient?.city ?? null,
              patientCode: detailTarget.patient?.patient_code ?? null,
            });
            setDetailTargetId(null);
          }}
          onNoShow={() => handleNoShow(detailTarget)}
        />
      )}

      {/* Edit Appointment modal (three-dot -> Edit) */}
      {editRow && (
        <BookingModal
          open={!!editRow}
          onClose={handleClose}
          title="Edit Appointment"
          subtitle="Update the scheduled consultation"
          icon={Pencil}
        >
          <AppointmentForm
            patients={patients}
            services={services}
            doctors={doctors}
            initialValues={editValues}
            onClose={handleClose}
          />
        </BookingModal>
      )}

      {/* Today-queue confirmation popup */}
      {confirmAction && confirmConfig && (
        <ActionConfirmModal
          title={confirmConfig.title}
          message={confirmConfig.message}
          variant={confirmConfig.variant}
          confirmText={confirmConfig.confirmText}
          busy={confirmBusy}
          onConfirm={runConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* Export Appointments options popup */}
      <ExportAppointmentsModal
        open={exportOpen}
        currentCount={activeTab === "today" ? todayFiltered.length : filteredRows.length}
        onClose={() => setExportOpen(false)}
        onExport={completeExport}
      />
    </div>
  );
}

/* ── Today sub-tab: queue/check-in view ───────────────────────────── */

function TodayView({
  queue,
  notCheckedIn,
  inConsultation,
  waitingInQueue,
  apptByVisitId,
  timezone,
  canManage,
  onCheckIn,
  onViewDetails,
  onEdit,
  onConfirmAppointment,
  onNoShow,
  onCancel,
  onComplete,
}: {
  queue: QueueItem[];
  notCheckedIn: QueueAppointment[];
  inConsultation: QueueAppointment[];
  waitingInQueue: QueueAppointment[];
  apptByVisitId: Map<string, QueueAppointment>;
  timezone: string;
  canManage: boolean;
  onCheckIn: (appt: QueueAppointment) => void;
  onViewDetails: (appt: QueueAppointment) => void;
  onEdit: (appt: QueueAppointment) => void;
  onConfirmAppointment: (appt: QueueAppointment) => void;
  onNoShow: (appt: QueueAppointment) => void;
  onCancel: (appt: QueueAppointment) => void;
  onComplete: (appt: QueueAppointment) => void;
}) {
  const hasAny =
    notCheckedIn.length > 0 ||
    inConsultation.length > 0 ||
    waitingInQueue.length > 0 ||
    queue.length > 0;

  if (!hasAny) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No appointments today"
        description="Appointments booked for today will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* In Consultation section (reference-style collapsible) */}
      <ConsultationSection
        inConsultation={inConsultation}
        timezone={timezone}
        canManage={canManage}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onComplete={onComplete}
      />

      {/* Waiting Queue (reference-style collapsible section with wired actions) */}
      {queue.length > 0 && (
        <WaitingQueueSection
          queue={queue}
          apptByVisitId={apptByVisitId}
          timezone={timezone}
          canManage={canManage}
          onAddVitals={(appt) => onCheckIn(appt)}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onNoShow={onNoShow}
          onCancel={onCancel}
        />
      )}

      {/* Not Yet Arrived section */}
      <SectionGroup
        icon={<AlertCircle className="h-4 w-4" />}
        label="Not Yet Arrived"
        count={notCheckedIn.length}
        color="bg-amber-50 text-amber-700"
        borderColor="border-amber-200"
      >
        {notCheckedIn.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-secondary">
              All patients have been checked in
            </p>
          </div>
        ) : (
          notCheckedIn.map((appt) => (
            <QueueAppointmentRow
              key={appt.id}
              appointment={appt}
              timezone={timezone}
              canManage={canManage}
              onViewDetails={() => onViewDetails(appt)}
              onCheckIn={() => onCheckIn(appt)}
              onEdit={() => onEdit(appt)}
              onConfirmAppointment={() => onConfirmAppointment(appt)}
              onNoShow={() => onNoShow(appt)}
              onCancel={() => onCancel(appt)}
            />
          ))
        )}
      </SectionGroup>
    </div>
  );
}

/* ── In Consultation (reference-style collapsible section) ────────── */

/** Reference shows the doctor as "Dr. zimal fatima"; avoid doubling if the
 * name already carries the title. */
function doctorDisplayName(name: string | null): string {
  if (!name) return "—";
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}

function ConsultationSection({
  inConsultation,
  timezone,
  canManage,
  onViewDetails,
  onEdit,
  onComplete,
}: {
  inConsultation: QueueAppointment[];
  timezone: string;
  canManage: boolean;
  onViewDetails: (appt: QueueAppointment) => void;
  onEdit: (appt: QueueAppointment) => void;
  onComplete: (appt: QueueAppointment) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-2">
      {/* Collapsible header — indigo-tinted tint mapped to app teal */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        className="mb-1 flex w-full cursor-pointer items-center justify-between gap-2 rounded-tl-xl rounded-tr-xl border border-primary/20 bg-primary/10 px-3 py-2.5"
      >
        <span className="flex items-center gap-2">
          <Stethoscope
            className="h-4 w-4 flex-shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-primary">
            In Consultation ({inConsultation.length})
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-primary transition-transform duration-300 ease-in-out ${
            collapsed ? "" : "-rotate-180"
          }`}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div className="animate-fade-in-down space-y-2">
          {inConsultation.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center">
              <p className="text-sm text-text-secondary">
                No patient in consultation right now
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Check in a patient to begin
              </p>
            </div>
          ) : (
            inConsultation.map((appt) => {
              const isWalkIn =
                appt.booking_source === "dashboard" ||
                appt.booking_source === "walk_in";
              return (
                <div
                  key={appt.id}
                  onClick={() => canManage && onViewDetails(appt)}
                  className={`w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 transition-colors ${
                    canManage ? "cursor-pointer hover:opacity-100" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Initial avatar */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-light text-xs font-bold text-white">
                      {getInitials(appt.patientName)}
                    </div>

                    {/* Patient + doctor */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-gray-700">
                          {appt.patientName}
                        </p>
                        {isWalkIn && (
                          <span
                            title="Walk-in"
                            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-orange-100"
                          >
                            <PersonStanding
                              className="h-3 w-3 text-orange-500"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                        <span className="flex-shrink-0 text-xs text-gray-400">
                          {formatRowTimeRange(
                            appt.start_time,
                            appt.end_time,
                            timezone,
                          )}
                        </span>
                      </div>
                      <p className="truncate text-xs text-gray-400">
                        {doctorDisplayName(appt.doctorName)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {canManage && onComplete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onComplete(appt);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                        >
                          <CircleCheckBig
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          Complete
                        </button>
                      )}
                      {canManage && onEdit && (
                        <span
                          onClick={(e) => e.stopPropagation()}
                          className="contents"
                        >
                          <RowMenu
                            icon={EllipsisVertical}
                            triggerClassName="p-1.5 rounded-lg text-gray-500 transition-colors hover:bg-gray-200"
                            actions={[
                              {
                                key: "edit",
                                label: "Edit Appointment",
                                icon: Pencil,
                                onClick: () => onEdit(appt),
                              },
                            ]}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ── Section group (collapsible-style header) ─────────────────────── */

function SectionGroup({
  icon,
  label,
  count,
  color,
  borderColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${borderColor} bg-white`}>
      <div className={`flex items-center gap-2 px-4 py-3 ${color} rounded-t-xl`}>
        {icon}
        <span className="text-sm font-semibold">
          {label} ({count})
        </span>
      </div>
      <div className="divide-y divide-border-light">{children}</div>
    </div>
  );
}

/* ── Waiting Queue (reference-style collapsible section) ───────────── */

function WaitingQueueSection({
  queue,
  apptByVisitId,
  timezone,
  canManage,
  onAddVitals,
  onViewDetails,
  onEdit,
  onNoShow,
  onCancel,
}: {
  queue: QueueItem[];
  apptByVisitId: Map<string, QueueAppointment>;
  timezone: string;
  canManage: boolean;
  onAddVitals: (appt: QueueAppointment) => void;
  onViewDetails: (appt: QueueAppointment) => void;
  onEdit: (appt: QueueAppointment) => void;
  onNoShow: (appt: QueueAppointment) => void;
  onCancel: (appt: QueueAppointment) => void;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderState, reorderAction, isReordering] = useActionState<
    ActionResult | null,
    FormData
  >(reorderQueueAction, null);

  // Waiting list = 'waiting' status only (in-consultation patients are shown
  // in their own section above). Ordered by queue_position from the server.
  const waiting = queue.filter((v) => v.status === "waiting");
  const topWaiting = waiting[0] ?? null;
  const firstWaitingId = topWaiting?.id ?? null;

  // Refresh after successful reorder
  useEffect(() => {
    if (reorderState?.ok) {
      router.refresh();
    }
  }, [reorderState, router]);

  // Drag-and-drop reorder — drop the dragged token onto another card;
  // the new queue position is the drop target's position.
  const handleDrop = useCallback(
    (target: QueueItem) => {
      if (!dragId || dragId === target.id) return;
      setDragId(null);
      const formData = new FormData();
      formData.set("visitId", dragId);
      formData.set("newPosition", String(target.queue_position));
      startTransition(() => reorderAction(formData));
    },
    [dragId, reorderAction],
  );

  // Drop anywhere on the section header -> pin the dragged patient to the
  // top of the waiting queue (the emergency-priority gesture).
  const handleDropTop = useCallback(() => {
    if (!dragId || !topWaiting || dragId === topWaiting.id) return;
    setDragId(null);
    const formData = new FormData();
    formData.set("visitId", dragId);
    formData.set("newPosition", String(topWaiting.queue_position));
    startTransition(() => reorderAction(formData));
  }, [dragId, topWaiting, reorderAction]);

  return (
    <div>
      {/* Collapsible header — teal-tinted, matching the reference layout.
          Also a drag target: dropping a card here pins that patient to the
          top of the waiting queue. */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        onDragOver={(e) => {
          if (canManage && dragId) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (canManage) handleDropTop();
        }}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-2 rounded-tl-xl rounded-tr-xl border border-primary/20 bg-primary/10 px-3 py-2.5 mb-1 cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <CircleUser
            className="h-4 w-4 flex-shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-primary">
            Waiting Queue ({waiting.length})
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-primary transition-transform duration-300 ease-in-out ${
            collapsed ? "" : "-rotate-180"
          }`}
          aria-hidden="true"
        />
      </button>

      {!collapsed && (
        <div className="animate-fade-in-down space-y-2">
          {waiting.map((item) => {
            const appt = apptByVisitId.get(item.id) ?? null;
            const isFirst = item.id === firstWaitingId;
            const isWalkIn =
              appt?.booking_source === "dashboard" ||
              appt?.booking_source === "walk_in";
            const hasVitals = item.vitals != null;

            return (
              <div
                key={item.id}
                onDragOver={(e) => {
                  if (dragId && dragId !== item.id) e.preventDefault();
                }}
                onDrop={() => canManage && handleDrop(item)}
                onClick={() => appt && canManage && onViewDetails(appt)}
                className={`w-full select-none rounded-xl border bg-white p-3 shadow-sm transition-colors ${
                  dragId === item.id
                    ? "border-primary/40 opacity-60"
                    : "border-gray-200"
                } ${appt && canManage ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {/* Drag grip — drag & drop reorder (token position changes) */}
                  <div
                    draggable={canManage && !isReordering}
                    onDragStart={(e) => {
                      setDragId(item.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => setDragId(null)}
                    title="Drag to reorder token"
                    className={`shrink-0 self-center cursor-grab active:cursor-grabbing select-none p-1 ${
                      canManage ? "text-gray-400" : "text-gray-300"
                    }`}
                  >
                    <GripHorizontal
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  </div>

                  {/* Token chip */}
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-light shadow-sm">
                    <span className="text-[9px] font-medium leading-none text-white/70">
                      Token
                    </span>
                    <span className="text-sm font-bold leading-tight text-white">
                      #{item.tokenNumber}
                    </span>
                  </div>

                  {/* Patient + doctor + slot time */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {item.patientName}
                      </p>
                      {isWalkIn && (
                        <span
                          title="Walk-in"
                          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-orange-100"
                        >
                          <PersonStanding
                            className="h-3.5 w-3.5 text-orange-500"
                            aria-hidden="true"
                          />
                        </span>
                      )}
                      {isFirst && (
                        <Badge variant="success" className="shrink-0 text-[10px]">
                          NEXT
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-gray-500">
                      {item.doctorName ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {appt
                        ? formatRowTimeRange(
                            appt.start_time,
                            appt.end_time,
                            timezone,
                          )
                        : formatClinicLocalSlot(
                            item.checked_in_at,
                            item.checked_in_at,
                            timezone,
                          )}
                    </p>
                  </div>

                  {/* Vitals / actions */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-shrink-0 items-center gap-2.5 self-center"
                  >
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => appt && onViewDetails(appt)}
                          title="Appointment details"
                          aria-label="View appointment details"
                          className="rounded-full p-1 text-orange-500 transition-colors hover:bg-orange-50"
                        >
                          <CircleUser
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => appt && onAddVitals(appt)}
                          title={hasVitals ? "Update vitals" : "Add vitals"}
                          className="flex items-center gap-1 whitespace-nowrap rounded-full border-[1.5px] border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10"
                        >
                          <Activity className="h-3 w-3" aria-hidden="true" />
                          {hasVitals ? "Update Vitals" : (appt ? "Add Vitals" : "—")}
                        </button>
                        <RowMenu
                          actions={[
                            {
                              key: "edit",
                              label: "Edit Appointment",
                              icon: Pencil,
                              onClick: () => appt && onEdit(appt),
                            },
                            {
                              key: "no_show",
                              label: "Mark No Show",
                              icon: UserX,
                              onClick: () => appt && onNoShow(appt),
                            },
                            {
                              key: "cancel",
                              label: "Cancel Appointment",
                              icon: XCircle,
                              onClick: () => appt && onCancel(appt),
                              destructive: true,
                            },
                          ]}
                        />
                      </>
                    ) : (
                      <>
                        {hasVitals && (
                          <Badge variant="success" className="shrink-0 text-[10px]">
                            Vitals Done
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Queue appointment row (for Today sub-tab) ────────────────────── */

function QueueAppointmentRow({
  appointment,
  timezone,
  canManage,
  onViewDetails,
  onCheckIn,
  onEdit,
  onConfirmAppointment,
  onNoShow,
  onCancel,
  onComplete,
}: {
  appointment: QueueAppointment;
  timezone: string;
  canManage: boolean;
  onViewDetails?: () => void;
  onCheckIn?: () => void;
  onEdit?: () => void;
  onConfirmAppointment?: () => void;
  onNoShow?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}) {
  const visit = appointment.visit;
  const visitStatus = visit ? VISIT_STATUS_META[visit.status] : null;

  const canCheckIn =
    canManage &&
    !visit &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no_show";

  // Per-section three-dot actions — only the handlers the call site passed in
  // are shown, so each section gets exactly its own menu.
  const menuActions: RowMenuAction[] = [];
  if (onEdit) {
    menuActions.push({
      key: "edit",
      label: "Edit Appointment",
      icon: Pencil,
      onClick: onEdit,
    });
  }
  if (!visit && onConfirmAppointment) {
    menuActions.push({
      key: "confirm",
      label: "Confirm Appointment",
      icon: CheckCircle2,
      onClick: onConfirmAppointment,
    });
  }
  if (onNoShow) {
    menuActions.push({
      key: "no_show",
      label: "Mark No Show",
      icon: UserX,
      onClick: onNoShow,
    });
  }
  if (onCancel) {
    menuActions.push({
      key: "cancel",
      label: "Cancel Appointment",
      icon: XCircle,
      onClick: onCancel,
      destructive: true,
    });
  }

  const inConsultation = !!visit && visit.status === "in_consultation";

  const clickable = canManage && !!onViewDetails;

  return (
    <div
      onClick={clickable ? onViewDetails : undefined}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle ${
        clickable ? "cursor-pointer" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(appointment.patientName)}`}
      >
        {getInitials(appointment.patientName)}
      </div>

      {/* Name + details */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">
          {appointment.patientName}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {appointment.doctorName ?? "No doctor"} ·{" "}
          {formatClinicLocalSlot(
            appointment.start_time,
            appointment.end_time,
            timezone,
          )}
        </p>
      </div>

      {/* Vitals badge */}
      {appointment.vitals && (
        <Badge variant="success" className="shrink-0 text-[10px]">
          Vitals Done
        </Badge>
      )}

      {/* Token badge */}
      {visit && (
        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-primary text-[10px] leading-tight text-white">
          <span className="text-[8px] uppercase opacity-80">Token</span>
          <span className="text-xs font-bold">{visit.token_number}</span>
        </div>
      )}

      {/* Status */}
      {visitStatus && (
        <Badge variant="outline" className="shrink-0">
          {visitStatus.label}
        </Badge>
      )}

      {/* Payment status */}
      {visit && visit.payment_status !== "pending" ? (
        <Badge
          variant={visit.payment_status === "not_required" ? "outline" : "success"}
          className="shrink-0 text-[10px]"
          title="Payment status"
        >
          {VISIT_PAYMENT_STATUS_META[visit.payment_status]?.label ?? visit.payment_status}
        </Badge>
      ) : null}

      {/* Actions */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-1.5"
      >
        {onViewDetails && (
          <button
            type="button"
            onClick={onViewDetails}
            className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
            title="View Details"
            aria-label={`View ${appointment.patientName}'s appointment`}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {canCheckIn && onCheckIn ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onCheckIn}
            className="shrink-0 gap-1.5"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Check In
          </Button>
        ) : inConsultation && onComplete ? (
          <Button
            size="sm"
            onClick={onComplete}
            className="shrink-0 gap-1.5 bg-status-success text-white hover:bg-status-success/90"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Complete
          </Button>
        ) : null}
        {canManage && menuActions.length > 0 && (
          <RowMenu actions={menuActions} />
        )}
      </div>
    </div>
  );
}

/* ── Table view (Upcoming / Completed / All / Cancelled) ──────────── */

function TableView({
  rows,
  timezone,
  canManage,
  uhids,
  onView,
  onEdit,
  onConfirmPayment,
  onNoShow,
  onCancel,
}: {
  rows: AppointmentRow[];
  timezone: string;
  canManage: boolean;
  uhids: Map<string, string>;
  onView: (row: AppointmentRow) => void;
  onEdit: (row: AppointmentRow) => void;
  onConfirmPayment: (row: AppointmentRow) => void;
  onNoShow: (row: AppointmentRow) => void;
  onCancel: (row: AppointmentRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No appointments found"
        description="There are no appointments matching the current filter."
      />
    );
  }

  return (
    <div>
      {/* Desktop column headers */}
      <div className="hidden border-b border-gray-200 bg-gray-50 px-3 py-3 lg:block lg:px-6">
        <div className="grid grid-cols-12 gap-4 text-xs font-medium uppercase tracking-wide text-gray-500">
          <div className="col-span-3">Patient</div>
          <div className="col-span-2">Doctor</div>
          <div className="col-span-3">Date &amp; Slot</div>
          <div className="col-span-1">Token</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Actions</div>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {rows.map((row) => {
          const meta = APPOINTMENT_STATUS_META[row.status];
          const uhid = row.patient_id ? uhids.get(row.patient_id) ?? null : null;
          const token = row.visit?.token_number ?? null;
          const rowActions =
            canManage && row.status !== "cancelled" && (
              <TableActionsDropdown
                onEdit={() => onEdit(row)}
                onConfirmPayment={() => onConfirmPayment(row)}
                onNoShow={() => onNoShow(row)}
                onCancel={() => onCancel(row)}
              />
            );

          return (
            <div key={row.id}>
              {/* Mobile row */}
              <div className="px-3 py-2 transition-colors hover:bg-gray-50 lg:hidden">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light text-white">
                    <CircleUser className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {row.patientName}
                      </p>
                      {meta ? (
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-gray-500">
                        {row.doctorName ?? "—"} · {formatRowDate(row.start_time, timezone)} ·{" "}
                        {formatRowTimeRange(row.start_time, row.end_time, timezone)}
                      </p>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                          {token ?? "—"}
                        </span>
                        <button
                          type="button"
                          onClick={() => onView(row)}
                          className="rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
                          aria-label={`View ${row.patientName}'s appointment`}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {rowActions}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop row */}
              <div className="hidden px-3 py-2.5 transition-all duration-200 hover:bg-gray-50 hover:shadow-sm lg:block lg:px-6">
                <div className="grid grid-cols-12 items-center gap-4">
                  <div className="col-span-3">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light text-white">
                        <CircleUser className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {row.patientName}
                        </p>
                        {uhid ? (
                          <span className="hidden text-xs text-gray-500 xl:inline">
                            {uhid}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <p className="truncate text-sm text-gray-700">
                      {row.doctorName ?? "—"}
                    </p>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-medium text-gray-900">
                      {formatRowDate(row.start_time, timezone)}
                    </p>
                    <p className="mt-1 flex items-center text-xs text-gray-500">
                      <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                      {formatRowTimeRange(row.start_time, row.end_time, timezone)}
                    </p>
                  </div>
                  <div className="col-span-1">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
                      {token ?? "—"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    {meta ? (
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  <div className="relative col-span-1">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        type="button"
                        onClick={() => onView(row)}
                        className="rounded-lg p-1.5 text-primary transition-all duration-150 hover:scale-110 hover:bg-primary/10 active:scale-95"
                        title="View Details"
                        aria-label={`View ${row.patientName}'s appointment`}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {canManage && rowActions}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Four-action overflow dropdown for table rows ─────────────────── */

function TableActionsDropdown({
  onEdit,
  onConfirmPayment,
  onNoShow,
  onCancel,
}: {
  onEdit: () => void;
  onConfirmPayment: () => void;
  onNoShow: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const actions = [
    { icon: Pencil, label: "Edit Appointment", onClick: onEdit, destructive: false },
    { icon: CreditCard, label: "Confirm Payment", onClick: onConfirmPayment, destructive: false },
    { icon: UserX, label: "Mark No Show", onClick: onNoShow, destructive: false },
    { icon: XCircle, label: "Cancel Appointment", onClick: onCancel, destructive: true },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-app hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-md border border-text-muted/30 bg-white shadow-dropdown"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  action.onClick();
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-app ${
                  action.destructive
                    ? "text-status-destructive"
                    : "text-text-primary"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
