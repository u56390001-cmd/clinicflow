"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  CircleCheckBig,
  CircleUser,
  CircleX,
  Clock,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Stethoscope,
  User,
  X,
} from "lucide-react";

import { APPOINTMENT_STATUS_META, VISIT_STATUS_META, VISIT_PAYMENT_STATUS_META } from "@/lib/constants";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import type {
  Appointment,
  Doctor,
  Patient,
  Service,
  Visit,
} from "@/types/database";

type DetailsAppointment = Appointment & {
  patientName: string;
  patientPhone: string | null;
  serviceName: string;
  doctorName: string | null;
  visit: Visit | null;
};

const BOOKING_SOURCE_LABEL: Record<string, { label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> }> = {
  dashboard: { label: "Walk-in (Dashboard)", icon: CircleUser },
  walk_in: { label: "Walk-in", icon: CircleUser },
  phone_call: { label: "Phone Call", icon: Phone },
  ai_agent: { label: "AI / WhatsApp", icon: MessageCircle },
  widget: { label: "Widget", icon: CircleUser },
  website: { label: "Website", icon: CircleUser },
};

function bookingSourceMeta(source: string) {
  return BOOKING_SOURCE_LABEL[source] ?? {
    label: source ? source.charAt(0).toUpperCase() + source.slice(1) : "Not set",
    icon: CircleUser,
  };
}

/** Clinic-local `DD-MM-YYYY`. */
function formatDate(startIso: string, tz: string): string {
  const local = utcIsoToClinicLocalInput(startIso, tz).slice(0, 10);
  const [y, m, d] = local.split("-");
  return `${d}-${m}-${y}`;
}

/** Clinic-local `7:30 PM - 8:00 PM` time range. */
function formatTimeRange(startIso: string, endIso: string, tz: string): string {
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

export function AppointmentDetailsModal({
  appointment,
  patient,
  doctor,
  service,
  timezone,
  uhid,
  canManage,
  onClose,
  onCheckIn,
  onNoShow,
}: {
  appointment: DetailsAppointment;
  patient: Patient | null;
  doctor: Doctor | null;
  service: Service | null;
  timezone: string;
  uhid: string;
  canManage: boolean;
  onClose: () => void;
  onCheckIn: () => void;
  onNoShow: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const statusMeta =
    APPOINTMENT_STATUS_META[
      appointment.status as keyof typeof APPOINTMENT_STATUS_META
    ] ?? { label: appointment.status, badge: "bg-brand-wash text-brand-muted" };

  const visit = appointment.visit;
  const visitActive =
    visit && ["waiting", "checked_in", "in_consultation"].includes(visit.status);
  const headerStatusLabel = visitActive
    ? VISIT_STATUS_META[visit.status].label
    : statusMeta.label;

  const dateLabel = formatDate(appointment.start_time, timezone);
  const slotTime = formatTimeRange(
    appointment.start_time,
    appointment.end_time,
    timezone,
  );

  const paymentMeta = visit
    ? VISIT_PAYMENT_STATUS_META[visit.payment_status] ?? null
    : null;
  const fee = service && service.price > 0 ? service.price : null;

  const sourceMeta = bookingSourceMeta(appointment.booking_source);
  const SourceIcon = sourceMeta.icon;

  const age = patient?.age ?? null;
  const city = patient?.city ?? null;
  const whatsapp = patient?.whatsapp_number ?? null;

  const arrivedTime = visit?.checked_in_at
    ? utcIsoToClinicLocalInput(visit.checked_in_at, timezone).slice(11, 16)
    : null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-black/60 md:flex md:items-center md:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Appointment Details"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="flex h-full w-full animate-scale-in flex-col overflow-hidden bg-brand-canvas shadow-2xl md:h-auto md:max-h-[95vh] md:max-w-4xl md:rounded-card md:bg-surface">
        {/* Mobile header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-brand-line bg-surface px-4 pb-4 pt-5 md:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-wash"
            aria-label="Close"
          >
            <ChevronLeft className="h-5 w-5 text-brand-muted" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-brand-ink">
              Appointment Details
            </h1>
            <p className="text-xs text-brand-muted">{dateLabel}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-brand-pale px-2 py-1 text-xs font-medium text-brand-cta">
              <CircleUser
                className="mr-1 h-3 w-3 flex-shrink-0"
                aria-hidden="true"
              />
              {headerStatusLabel}
            </span>
          </div>
        </div>

        {/* Desktop header */}
        <div className="relative hidden flex-shrink-0 bg-gradient-to-r from-brand-cta to-brand-sage p-8 text-white md:block">
          <div className="absolute inset-0 bg-black bg-opacity-5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 rounded-xl bg-surface bg-opacity-20 p-3 backdrop-blur-sm">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Appointment Details</h2>
                <div className="mt-1 flex items-center gap-3">
                  <p className="text-sm text-white/80">{dateLabel}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center space-x-3">
              <div className="flex items-center space-x-1.5 rounded-full border border-white/30 bg-surface/15 px-2.5 py-1.5 text-xs font-medium text-white md:space-x-2 md:px-4 md:py-2 md:text-sm">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <span className="capitalize">{headerStatusLabel}</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="group rounded-xl p-2 transition-all duration-200 hover:bg-surface hover:bg-opacity-20"
                aria-label="Close"
              >
                <X
                  className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-brand-canvas md:bg-surface">
          <div className="p-3 md:p-8">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
              {/* Column 1 */}
              <div className="space-y-3 lg:space-y-6">
                {/* Patient Information */}
                <div className="rounded-card border border-brand-line bg-surface p-3 shadow-sm lg:p-6">
                  <div className="mb-4">
                    <h3 className="flex items-center text-lg font-semibold text-brand-ink">
                      <div className="mr-3 rounded-lg bg-brand-pale p-2">
                        <User className="h-5 w-5 text-brand-cta" aria-hidden="true" />
                      </div>
                      Patient Information
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                        Full Name
                      </label>
                      <p className="text-lg font-semibold text-brand-ink">
                        {appointment.patientName}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                        Patient ID
                      </label>
                      <p className="text-sm font-semibold text-brand-cta">
                        {uhid}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                          Age
                        </label>
                        <div className="flex items-center space-x-2">
                          <CircleUser className="h-4 w-4 text-brand-success" aria-hidden="true" />
                          <p className="font-medium text-brand-ink">{age ?? "N/A"}</p>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                          Gender
                        </label>
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-brand-success" aria-hidden="true" />
                          <p className="font-medium capitalize text-brand-ink">
                            {patient?.gender ?? "N/A"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                          City
                        </label>
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4 text-brand-success" aria-hidden="true" />
                          <p className="font-medium text-brand-ink">{city ?? "N/A"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                          Phone Number
                        </label>
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-brand-cta" aria-hidden="true" />
                          <p className="font-medium text-brand-ink">
                            {appointment.patientPhone ?? "N/A"}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                          WhatsApp
                        </label>
                        <div className="flex items-center space-x-2">
                          <MessageCircle className="h-4 w-4 text-brand-success" aria-hidden="true" />
                          <p className="font-medium text-brand-ink">
                            {whatsapp ?? "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Booking Source
                      </label>
                      <div className="flex items-center space-x-2">
                        <SourceIcon
                          className="h-4 w-4 text-brand-warning"
                          aria-hidden="true"
                        />
                        <span className="capitalize text-brand-ink">
                          {sourceMeta.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Doctor Information */}
                <div className="rounded-card border border-brand-line bg-surface p-3 shadow-sm lg:p-6">
                  <h3 className="mb-4 flex items-center text-lg font-semibold text-brand-ink">
                    <div className="mr-3 rounded-lg bg-brand-pale p-2">
                      <User className="h-5 w-5 text-brand-cta" aria-hidden="true" />
                    </div>
                    Doctor Information
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                        Doctor Name
                      </label>
                      <p className="text-lg font-semibold text-brand-ink">
                        {doctor?.name ?? appointment.doctorName ?? "Not assigned"}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                        Title
                      </label>
                      <p className="capitalize text-brand-ink">{doctorTitle(doctor)}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                        Speciality
                      </label>
                      <p className="capitalize text-brand-ink">
                        {doctor?.specialty ?? "General"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-3 lg:space-y-6">
                {/* Schedule Details */}
                <div className="rounded-card border border-brand-line bg-surface p-3 shadow-sm lg:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center text-lg font-semibold text-brand-ink">
                      <div className="mr-3 rounded-lg bg-brand-success-soft p-2">
                        <Calendar
                          className="h-5 w-5 text-brand-success"
                          aria-hidden="true"
                        />
                      </div>
                      Schedule Details
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Date
                      </label>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-brand-success" aria-hidden="true" />
                        <p className="font-semibold text-brand-ink">{dateLabel}</p>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Token Number
                      </label>
                      <div className="inline-flex items-center rounded-lg border border-brand-sage bg-brand-pale px-4 py-2">
                        <p className="text-2xl font-bold text-brand-cta">
                          #{visit?.token_number ?? "—"}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Slot Time
                      </label>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-brand-success" aria-hidden="true" />
                        <p className="font-semibold text-brand-ink">{slotTime}</p>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Arrival Time
                      </label>
                      {arrivedTime ? (
                        <div className="flex flex-wrap items-center space-x-2">
                          <CircleCheckBig className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                          <p className="font-medium text-brand-ink">
                            Checked in today · {arrivedTime}
                          </p>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Arrived
                          </span>
                        </div>
                      ) : (
                        <p className="font-medium text-brand-faint">Not yet arrived</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consultation & Payment */}
                <div className="rounded-card border border-brand-line bg-surface p-3 shadow-sm lg:p-6">
                  <h3 className="mb-4 flex items-center text-lg font-semibold text-brand-ink">
                    <div className="mr-3 rounded-lg bg-brand-warning-soft p-2">
                      <FileText
                        className="h-5 w-5 text-brand-warning"
                        aria-hidden="true"
                      />
                    </div>
                    Consultation &amp; Payment
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-brand-muted">
                          Consultation Type
                        </label>
                        <span className="flex w-fit items-center rounded-full bg-brand-success-soft px-3 py-1.5 text-sm font-medium text-brand-success">
                          <Stethoscope
                            className="mr-1.5 h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {appointment.consultation_type === "in_clinic"
                            ? "In-Person Visit"
                            : "Online / Video"}
                        </span>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-brand-muted">
                          Payment Status
                        </label>
                        <span
                          className={`flex w-fit items-center rounded-full px-3 py-1.5 text-sm font-medium ${
                            paymentMeta
                              ? "bg-brand-success-soft text-brand-success"
                              : "bg-brand-warning-soft text-brand-warning"
                          }`}
                        >
                          <CircleCheckBig
                            className="mr-1.5 h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {paymentMeta?.label ?? "Payment Pending"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-brand-muted">
                        Consultation Fee
                      </label>
                      <div className="rounded-card border border-brand-line bg-brand-warning-soft p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-brand-ink">
                            {fee != null ? `₹${fee.toLocaleString()}` : "N/A"}
                          </span>
                          {fee != null && (
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-medium ${
                                paymentMeta
                                  ? "bg-brand-success-soft text-brand-success"
                                  : "bg-brand-warning-soft text-brand-warning"
                              }`}
                            >
                              {paymentMeta?.label ?? "Pay at Clinic"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop footer */}
        <div className="hidden flex-shrink-0 border-t border-brand-line bg-brand-canvas p-6 md:block">
          <div className="flex items-center justify-between">
            <div className="text-sm text-brand-muted">
              <span className="flex items-center">
                <CircleCheckBig
                  className="mr-1 h-4 w-4 text-brand-success"
                  aria-hidden="true"
                />
                Data encrypted and secure
              </span>
            </div>
            <div className="flex items-center space-x-3">
              {visitActive ? (
                <div className="flex items-center gap-2 rounded-xl border-2 border-brand-sage bg-brand-pale px-4 py-2.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-brand-cta" />
                  <span className="text-sm font-semibold text-brand-cta">
                    In Queue
                  </span>
                </div>
              ) : (
                <span
                  className={`inline-flex items-center whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium ${statusMeta.badge}`}
                >
                  {statusMeta.label}
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={onNoShow}
                  className="flex items-center space-x-2 rounded-xl border-2 border-brand-warning bg-brand-warning-soft px-4 py-2.5 text-sm font-semibold text-brand-warning transition-all duration-200 hover:bg-brand-warning-soft"
                >
                  <CircleX className="h-4 w-4" aria-hidden="true" />
                  <span>No Show</span>
                </button>
              )}
              {canManage && !visit && (
                <button
                  type="button"
                  onClick={onCheckIn}
                  className="flex items-center gap-2 rounded-xl bg-status-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-status-success/90"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Check In Patient
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile footer */}
        <div
          className="flex flex-shrink-0 flex-col gap-2 border-t border-brand-line bg-surface px-4 py-3 md:hidden"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))" }}
        >
          {visitActive ? (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-sage bg-brand-pale py-2.5">
              <div className="h-2 w-2 animate-pulse rounded-full bg-brand-cta" />
              <span className="text-sm font-semibold text-brand-cta">In Queue</span>
            </div>
          ) : (
            <span
              className={`inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl py-2.5 text-xs font-medium ${statusMeta.badge}`}
            >
              {statusMeta.label}
            </span>
          )}
          {canManage && !visit && (
            <button
              type="button"
              onClick={onCheckIn}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-status-success py-2.5 text-sm font-semibold text-white"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Check In Patient
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onNoShow}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-brand-warning bg-brand-warning-soft py-2.5 text-sm font-semibold text-brand-warning"
            >
              <CircleX className="h-4 w-4" aria-hidden="true" />
              Mark No Show
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function doctorTitle(doctor: Doctor | null): string {
  if (!doctor) return "Not assigned";
  const creds = doctor.credentials;
  if (Array.isArray(creds) && creds.length > 0) {
    return creds.slice(0, 2).join(", ");
  }
  return doctor.consultation_fee != null && doctor.consultation_fee > 0
    ? "Consulting Doctor"
    : "Doctor";
}