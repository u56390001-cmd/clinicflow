"use client";

import { CalendarDays, Video } from "lucide-react";

import { AppointmentStatusActions } from "@/components/appointments/appointment-status-actions";
import { RecordEmpty } from "@/components/patients/record/record-primitives";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { formatClinicLocalRange } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import type { AppointmentView } from "@/lib/appointments-view";

/**
 * All Appointments — the booking dimension of the record, split into what is
 * still to come and what already happened.
 *
 * Deliberately not `<AppointmentDetail>`: that card leads with the patient's
 * name as an `<h2>`, which inside a record for that same patient is both
 * redundant and a heading-level regression. This is the same information as a
 * compact row, with the status actions kept intact for staff who can manage.
 */
export function AppointmentsTab({
  upcoming,
  past,
  timezone,
  canManage,
}: {
  upcoming: AppointmentView[];
  past: AppointmentView[];
  timezone: string;
  canManage: boolean;
}) {
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <RecordEmpty
        icon={CalendarDays}
        title="No appointments booked"
        description="Every booking for this patient shows up here — upcoming first, then the full history."
      />
    );
  }

  return (
    <div className="space-y-5">
      <AppointmentGroup
        title="Upcoming"
        appointments={upcoming}
        emptyLabel="Nothing upcoming."
        timezone={timezone}
        canManage={canManage}
      />
      <AppointmentGroup
        title="History"
        appointments={past}
        emptyLabel="No past appointments."
        timezone={timezone}
        canManage={false}
      />
    </div>
  );
}

function AppointmentGroup({
  title,
  appointments,
  emptyLabel,
  timezone,
  canManage,
}: {
  title: string;
  appointments: AppointmentView[];
  emptyLabel: string;
  timezone: string;
  canManage: boolean;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        <span className="text-xs text-text-muted tabular-nums">
          {appointments.length}
        </span>
      </div>
      {appointments.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {appointments.map((appointment) => (
            <AppointmentRow
              key={appointment.id}
              appointment={appointment}
              timezone={timezone}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AppointmentRow({
  appointment,
  timezone,
  canManage,
}: {
  appointment: AppointmentView;
  timezone: string;
  canManage: boolean;
}) {
  const meta = APPOINTMENT_STATUS_META[appointment.status];

  return (
    <li className="rounded-card border border-text-muted/20 bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {formatClinicLocalRange(
              appointment.start_time,
              appointment.end_time,
              timezone,
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {[
              appointment.serviceName,
              appointment.doctorName
                ? `Dr. ${appointment.doctorName}`
                : "Doctor unassigned",
              appointment.servicePrice > 0
                ? formatCurrency(appointment.servicePrice)
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {appointment.consultation_type === "online" && (
            <Badge
              variant="outline"
              className="ring-1 ring-inset ring-sky-600/20 bg-sky-50 text-sky-700"
            >
              <Video aria-hidden="true" className="mr-1 size-3" />
              Online
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn("ring-1 ring-inset", meta.badge)}
          >
            {meta.label}
          </Badge>
        </div>
      </div>

      {appointment.notes && (
        <p className="mt-2 whitespace-pre-wrap border-t border-text-muted/15 pt-2 text-xs text-text-secondary">
          {appointment.notes}
        </p>
      )}

      {canManage && (
        <div className="mt-3">
          <AppointmentStatusActions
            appointmentId={appointment.id}
            status={appointment.status}
          />
        </div>
      )}
    </li>
  );
}
