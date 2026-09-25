"use client";

import { AppointmentRescheduleForm } from "@/components/appointments/appointment-reschedule-form";
import { AppointmentStatusActions } from "@/components/appointments/appointment-status-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { APPOINTMENT_STATUS_META } from "@/lib/constants";
import { formatClinicLocalRange } from "@/lib/time";
import { formatCurrency } from "@/lib/utils/currency";
import type { AppointmentView } from "@/lib/appointments-view";

export function AppointmentDetail({
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
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-medium text-secondary">
              {appointment.patientName}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {formatClinicLocalRange(
                appointment.start_time,
                appointment.end_time,
                timezone,
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {appointment.consultation_type === "online" && (
              <Badge className="bg-sky-50 text-sky-700 ring-sky-600/20">
                Online visit
              </Badge>
            )}
            <Badge className={meta.badge}>{meta.label}</Badge>
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <MetaItem label="Service">
            {appointment.serviceName}
            {appointment.serviceDurationMinutes > 0 &&
              ` · ${formatDuration(appointment.serviceDurationMinutes)}`}
            {appointment.servicePrice > 0 &&
              ` · ${formatPrice(appointment.servicePrice)}`}
          </MetaItem>
          <MetaItem label="Doctor">
            {appointment.doctorName ?? "Not assigned"}
          </MetaItem>
          <MetaItem label="Consultation type">
            {appointment.consultation_type === "online"
              ? "Online"
              : "In clinic"}
          </MetaItem>
          <MetaItem label="Patient contact">
            {appointment.patientPhone || appointment.patientEmail
              ? [appointment.patientPhone, appointment.patientEmail]
                  .filter(Boolean)
                  .join(" · ")
              : "No contact on file"}
          </MetaItem>
          {appointment.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Notes
              </dt>
              <dd className="mt-0.5 text-text-primary">
                {appointment.notes}
              </dd>
            </div>
          )}
        </dl>

        {canManage && (
          <div className="border-t border-text-muted/20 pt-4">
            <AppointmentStatusActions
              appointmentId={appointment.id}
              status={appointment.status}
            />
            {["pending", "confirmed"].includes(appointment.status) && (
              <div className="mt-3">
                <AppointmentRescheduleForm
                  appointmentId={appointment.id}
                  currentStartIso={appointment.start_time}
                  durationMinutes={appointment.serviceDurationMinutes}
                  timezone={timezone}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-text-primary">{children}</dd>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function formatPrice(price: number): string {
  return formatCurrency(price);
}
