"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setDoctorVisibilityAction } from "@/lib/actions/doctors";
import type { ActionResult } from "@/types";

/**
 * Bookable toggle. Hiding a doctor removes them from NEW booking surfaces
 * (AI widget, website, dashboard selection); history and settings remain.
 */
export function DoctorVisibilityButton({
  doctorId,
  isVisible,
}: {
  doctorId: string;
  isVisible: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    setDoctorVisibilityAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="doctorId" value={doctorId} />
        <input type="hidden" name="isVisible" value={isVisible ? "off" : "on"} />
        <Button
          type="submit"
          size="sm"
          variant={isVisible ? "outline" : "secondary"}
        >
          {isVisible ? "Hide from booking" : "Make bookable"}
        </Button>
      </form>
      {state && !state.ok && (
        <Alert variant="destructive" className="max-w-xs py-2">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="text-xs">{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
