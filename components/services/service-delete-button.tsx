"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { deleteServiceAction } from "@/lib/actions/services";
import type { ActionResult } from "@/types";

/**
 * Hard-delete a service. Slot templates cascade; a service referenced by
 * appointments is rejected by the FK and the action surfaces the error.
 */
export function ServiceDeleteButton({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    deleteServiceAction,
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
        <input type="hidden" name="serviceId" value={serviceId} />
        <SubmitButton loadingText="Removing…" variant="ghost">
          Remove
        </SubmitButton>
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