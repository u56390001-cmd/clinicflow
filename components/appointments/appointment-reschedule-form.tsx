"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rescheduleAppointmentAction } from "@/lib/actions/appointments";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { computeAppointmentEnd, formatNaiveTime } from "@/lib/utils/datetime";
import type { ActionResult } from "@/types";

/**
 * Inline reschedule form. Defaults to the appointment's current start; the
 * availability check (overlap, working hours, blocked times) runs server-side
 * before the atomic reschedule RPC.
 */
export function AppointmentRescheduleForm({
  appointmentId,
  currentStartIso,
  durationMinutes,
  timezone,
}: {
  appointmentId: string;
  currentStartIso: string;
  durationMinutes: number;
  timezone: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    rescheduleAppointmentAction,
    null,
  );
  const [start, setStart] = useState(
    utcIsoToClinicLocalInput(currentStartIso, timezone),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      setOpen(false);
    }
  }, [state, router]);

  const end = computeAppointmentEnd(start, durationMinutes);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarClock aria-hidden="true" />
        Reschedule
      </Button>

      {open && (
        <form action={formAction} noValidate className="space-y-3">
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <div className="space-y-2">
            <Label htmlFor="resched-start">New start time</Label>
            <Input
              id="resched-start"
              name="start"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
            {end && (
              <p className="text-xs text-text-secondary">
                Ends at{" "}
                <span className="font-medium text-text-primary">
                  {formatNaiveTime(end)}
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <SubmitButton loadingText="Rescheduling…">
              Save new time
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {state && !state.ok && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-xs">
            {state.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
