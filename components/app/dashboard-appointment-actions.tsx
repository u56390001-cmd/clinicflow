"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  CircleCheck,
  Ban,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { setAppointmentStatusAction } from "@/lib/actions/appointments";
import type { ActionResult } from "@/types";
import type { AppointmentStatus } from "@/types/database";

function actionsFor(status: AppointmentStatus) {
  switch (status) {
    case "pending":
      return [
        { value: "confirmed" as const, label: "Confirm", icon: CheckCircle },
        { value: "cancelled" as const, label: "Cancel", icon: XCircle },
      ];
    case "confirmed":
      return [
        { value: "completed" as const, label: "Mark complete", icon: CircleCheck },
        { value: "no_show" as const, label: "No-show", icon: Ban },
        { value: "cancelled" as const, label: "Cancel", icon: XCircle },
      ];
    default:
      return [];
  }
}

export function DashboardAppointmentActions({
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
    if (state?.ok) router.refresh();
  }, [state, router]);

  const actions = actionsFor(status);
  if (actions.length === 0) return null;

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {actions.map((action) => (
        <Button
          key={action.value}
          type="submit"
          name="status"
          value={action.value}
          size="icon"
          variant={action.value === "cancelled" ? "outline" : "ghost"}
          className="h-7 w-7"
          title={action.label}
        >
          <action.icon aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">{action.label}</span>
        </Button>
      ))}
    </form>
  );
}
