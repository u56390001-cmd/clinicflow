import Link from "next/link";
import { Bell, Clock, User, Stethoscope } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DashboardAppointmentActions } from "@/components/app/dashboard-appointment-actions";
import { buildAppointmentViews } from "@/lib/appointments-view";
import { APP_ROUTES, APPOINTMENT_STATUS_META } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { formatClinicLocalSlot } from "@/lib/time";

export async function DashboardUpcomingAppointments({
  clinicId,
  timezone,
}: {
  clinicId: string;
  timezone: string;
}) {
  const supabase = await createClient();

  const [
    { data: upcomingRows },
    { data: patients },
    { data: services },
    { data: doctors },
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .eq("clinic_id", clinicId)
      .neq("status", "cancelled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(1),
    supabase.from("patients").select("*").eq("clinic_id", clinicId),
    supabase.from("services").select("*").eq("clinic_id", clinicId),
    supabase.from("doctors").select("*").eq("clinic_id", clinicId),
  ]);

  const appointments = buildAppointmentViews(
    upcomingRows ?? [],
    patients ?? [],
    services ?? [],
    doctors ?? [],
  );

  const appointment = appointments[0] ?? null;
  const meta = appointment
    ? APPOINTMENT_STATUS_META[appointment.status]
    : null;

  const isToday = appointment
    ? new Date(appointment.start_time).toDateString() === new Date().toDateString()
    : false;

  return (
    <Card className="border border-border-light bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Bell aria-hidden="true" className="h-5 w-5 text-white" />
          </div>
          <h3 className="text-base font-semibold text-text-primary">
            Next Appointment
          </h3>
        </div>
        {appointment && (
          <Badge className="border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
            {isToday ? "Today" : "Upcoming"}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {!appointment ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
              <Bell aria-hidden="true" className="h-7 w-7 text-violet-600" />
            </div>
            <p className="mt-4 text-sm font-medium text-text-secondary">
              No upcoming appointments
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Book your first appointment to get started.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
              {/* Time column */}
              <div className="flex items-center gap-3 py-4 sm:px-5 sm:py-2 sm:first:pl-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                  <Clock aria-hidden="true" className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Time</p>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary">
                    {formatClinicLocalSlot(
                      appointment.start_time,
                      appointment.end_time,
                      timezone,
                    )}
                  </p>
                </div>
              </div>

              <div className="hidden sm:block sm:w-px sm:self-stretch sm:bg-border-light" />
              <div className="h-px bg-border-light sm:hidden" />

              {/* Patient column */}
              <div className="flex items-center gap-3 py-4 sm:px-5 sm:py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <User aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Patient</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="text-sm font-semibold text-text-primary">
                      {appointment.patientName}
                    </p>
                    {meta && (
                      <Badge className={meta.badge} variant="outline">
                        {meta.label}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden sm:block sm:w-px sm:self-stretch sm:bg-border-light" />
              <div className="h-px bg-border-light sm:hidden" />

              {/* Doctor / Service column */}
              <div className="flex items-center gap-3 py-4 sm:px-5 sm:py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50">
                  <Stethoscope aria-hidden="true" className="h-4 w-4 text-rose-600" />
                </div>
                <div>
                  <p className="text-xs text-text-muted">Doctor</p>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary">
                    {appointment.doctorName || appointment.serviceName || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center justify-between border-t border-border-light pt-3">
              <DashboardAppointmentActions
                appointmentId={appointment.id}
                status={appointment.status}
              />
              <Link
                href={APP_ROUTES.app.appointments}
                className="text-sm font-medium text-violet-600 transition-colors hover:text-violet-700"
              >
                View Full Schedule →
              </Link>
            </div>
          </>
        )}

        {!appointment && (
          <div className="border-t border-border-light pt-3">
            <Link
              href={APP_ROUTES.app.appointments}
              className="text-sm font-medium text-violet-600 transition-colors hover:text-violet-700"
            >
              View Full Schedule →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
