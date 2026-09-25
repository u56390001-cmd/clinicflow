"use client";

import { useState } from "react";
import {
  CalendarCheck,
  ClipboardCheck,
  ListOrdered,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckInModal } from "@/components/queue/check-in-modal";
import { WaitingQueueList } from "@/components/queue/waiting-queue-list";
import {
  VISIT_STATUS_META,
  APPOINTMENT_STATUS_META,
  VISIT_PAYMENT_STATUS_META,
} from "@/lib/constants";
import { formatClinicLocalSlot } from "@/lib/time";
import type { QueueAppointment } from "@/lib/visits-queries";
import type { Visit, Vitals } from "@/types/database";

type QueueItem = Visit & {
  patientName: string;
  patientPhone: string | null;
  doctorName: string | null;
  tokenNumber: number;
  vitals: Vitals | null;
};

/**
 * Queue manager — the main client component for the Queue page.
 * Shows Today's Appointments (with check-in actions) and the Waiting Queue.
 */
export function QueueManager({
  appointments,
  queue,
  timezone,
  canManage,
}: {
  appointments: QueueAppointment[];
  queue: QueueItem[];
  timezone: string;
  canManage: boolean;
}) {
  const [checkInTarget, setCheckInTarget] = useState<QueueAppointment | null>(null);

  // Separate appointments by their visit status
  const notCheckedIn = appointments.filter((a) => !a.visit && a.status !== "cancelled" && a.status !== "no_show");
  const checkedIn = appointments.filter((a) => a.visit && a.visit.status !== "completed");
  const completed = appointments.filter((a) => a.visit?.status === "completed");

  return (
    <div className="space-y-6">
      {/* Waiting Queue */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListOrdered className="h-5 w-5 text-primary" aria-hidden="true" />
            Waiting Queue
            {queue.length > 0 && (
              <Badge variant="default" className="ml-1">
                {queue.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WaitingQueueList queue={queue} />
        </CardContent>
      </Card>

      {/* Today's Appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Today&apos;s Appointments
            {appointments.length > 0 && (
              <Badge variant="outline" className="ml-1">
                {appointments.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No appointments today"
              description="Appointments booked for today will appear here."
            />
          ) : (
            <div className="space-y-4">
              {/* Not yet checked in */}
              {notCheckedIn.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Not Checked In ({notCheckedIn.length})
                  </h3>
                  <div className="space-y-1">
                    {notCheckedIn.map((appt) => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        timezone={timezone}
                        canManage={canManage}
                        onCheckIn={() => setCheckInTarget(appt)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Checked in / in progress */}
              {checkedIn.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    In Progress ({checkedIn.length})
                  </h3>
                  <div className="space-y-1">
                    {checkedIn.map((appt) => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        timezone={timezone}
                        canManage={canManage}
                        onCheckIn={() => setCheckInTarget(appt)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed */}
              {completed.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Completed ({completed.length})
                  </h3>
                  <div className="space-y-1">
                    {completed.map((appt) => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        timezone={timezone}
                        canManage={canManage}
                        onCheckIn={() => setCheckInTarget(appt)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-in modal */}
      {checkInTarget && (
        <CheckInModal
          appointment={checkInTarget}
          onClose={() => setCheckInTarget(null)}
        />
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  timezone,
  canManage,
  onCheckIn,
}: {
  appointment: QueueAppointment;
  timezone: string;
  canManage: boolean;
  onCheckIn: () => void;
}) {
  const visit = appointment.visit;
  const visitStatus = visit ? VISIT_STATUS_META[visit.status] : null;
  const apptStatus = APPOINTMENT_STATUS_META[appointment.status];

  const canCheckIn =
    canManage &&
    !visit &&
    appointment.status !== "cancelled" &&
    appointment.status !== "no_show";

  return (
    <div className="flex items-center gap-3 rounded-control border border-text-muted/20 px-4 py-3 transition-colors hover:bg-app">
      {/* Time */}
      <div className="w-32 shrink-0 text-xs text-text-secondary">
        {formatClinicLocalSlot(appointment.start_time, appointment.end_time, timezone)}
      </div>

      {/* Patient */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {appointment.patientName}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {appointment.serviceName}
          {appointment.doctorName ? ` · ${appointment.doctorName}` : ""}
        </p>
      </div>

      {/* Status */}
      {visitStatus ? (
        <Badge variant="outline" className="shrink-0">
          {visitStatus.label}
        </Badge>
      ) : apptStatus ? (
        <Badge variant="outline" className="shrink-0">
          {apptStatus.label}
        </Badge>
      ) : null}

      {/* Payment status */}
      {visit && visit.payment_status !== "pending" ? (
        <Badge
          variant={visit.payment_status === "not_required" ? "outline" : "success"}
          className="shrink-0 text-[10px]"
          title="Payment status"
        >
          {VISIT_PAYMENT_STATUS_META[visit.payment_status].label}
        </Badge>
      ) : null}

      {/* Vitals badge */}
      {appointment.vitals ? (
        <Badge variant="success" className="shrink-0 text-[10px]">
          Vitals Done
        </Badge>
      ) : null}

      {/* Token */}
      {visit && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-primary text-xs font-bold text-white">
          {visit.token_number}
        </div>
      )}

      {/* Action button */}
      {canCheckIn ? (
        <Button
          size="sm"
          variant="primary"
          onClick={onCheckIn}
          className="shrink-0"
        >
          <UserCheck className="h-4 w-4" aria-hidden="true" />
          Check In
        </Button>
      ) : visit ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onCheckIn}
          className="shrink-0"
        >
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          View
        </Button>
      ) : null}
    </div>
  );
}
