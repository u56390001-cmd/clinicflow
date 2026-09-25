"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deletePatientDocumentAction } from "@/lib/actions/patient-documents";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import type { ActionResult } from "@/types";

/**
 * View / download / remove for one document row.
 *
 * View and download are plain links to `/api/patients/documents/{id}` — the
 * route checks access and mints a fresh signed URL per click, so nothing here
 * holds a URL that could go stale or be shared.
 *
 * Removal asks first. Deleting a lab report is not undoable and the file is gone
 * from storage too, so a stray click on a 4-icon row must not be enough.
 */
export function DocumentRowActions({
  documentId,
  documentName,
  canManage,
}: {
  documentId: string;
  documentName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(deletePatientDocumentAction, null);

  useEffect(() => {
    if (state?.ok) {
      setConfirming(false);
      router.refresh();
    }
  }, [state, router]);

  const href = patientDocumentHref(documentId);

  if (confirming) {
    return (
      <form action={formAction} className="flex items-center justify-end gap-1">
        <input type="hidden" name="documentId" value={documentId} />
        <span className="mr-1 text-xs text-text-secondary">Remove?</span>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Spinner size="sm" /> : null}
          {pending ? "Removing…" : "Remove"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {state && !state.ok && (
        <span className="mr-1 text-xs text-status-destructive">{state.message}</span>
      )}
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-8"
        title={`View ${documentName}`}
      >
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Eye aria-hidden="true" />
          <span className="sr-only">View {documentName}</span>
        </a>
      </Button>
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="size-8"
        title={`Download ${documentName}`}
      >
        <a href={`${href}?download=1`}>
          <Download aria-hidden="true" />
          <span className="sr-only">Download {documentName}</span>
        </a>
      </Button>
      {canManage && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-status-destructive hover:text-status-destructive"
          onClick={() => setConfirming(true)}
          title={`Remove ${documentName}`}
        >
          <Trash2 aria-hidden="true" />
          <span className="sr-only">Remove {documentName}</span>
        </Button>
      )}
    </div>
  );
}
