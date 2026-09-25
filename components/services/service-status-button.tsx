"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setServiceStatusAction } from "@/lib/actions/services";
import type { ActionResult } from "@/types";
import type { ServiceStatus } from "@/types/database";

/**
 * Soft-delete / reactivate toggle. Deactivating sets `status = inactive`;
 * the row is never hard-deleted (future appointments reference it).
 */
export function ServiceStatusButton({
  serviceId,
  status,
}: {
  serviceId: string;
  status: ServiceStatus;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    setServiceStatusAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  const next = status === "active" ? "inactive" : "active";

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="serviceId" value={serviceId} />
        <input type="hidden" name="status" value={next} />
        <Button
          type="submit"
          size="sm"
          variant={status === "active" ? "outline" : "secondary"}
        >
          {status === "active" ? "Deactivate" : "Activate"}
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
