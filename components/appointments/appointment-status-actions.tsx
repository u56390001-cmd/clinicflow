"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setAppointmentStatusAction } from "@/lib/actions/appointments";
import type { ActionResult } from "@/types";
import type { AppointmentStatus } from "@/types/database";

/**
 * Status-change buttons appropriate to the appointment's current state. Each
 * button is a submit button of the same form; the clicked one provides its
 * `status` value. A cancelled appointment frees its slot; `no_show` and
 * `completed` are terminal.
 */
export function AppointmentStatusActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: AppointmentStatus;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    setAppointmentStatusAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const actions = actionsFor(status);
  if (actions.length === 0) return null;

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action.value}
              type="submit"
              name="status"
              value={action.value}
              size="sm"
              variant={action.variant}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </form>
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

function actionsFor(
  status: AppointmentStatus,
): { value: AppointmentStatus; label: string; variant: "primary" | "secondary" | "outline" | "destructive" | "ghost" | "link" }[] {
  switch (status) {
    case "pending":
      return [
        { value: "confirmed", label: "Confirm", variant: "primary" },
        { value: "cancelled", label: "Cancel", variant: "outline" },
      ];
    case "confirmed":
      return [
        { value: "completed", label: "Mark complete", variant: "primary" },
        { value: "no_show", label: "No-show", variant: "secondary" },
        { value: "cancelled", label: "Cancel", variant: "outline" },
      ];
    default:
      return [];
  }
}
