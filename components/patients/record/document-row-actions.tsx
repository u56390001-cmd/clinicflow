"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, NotebookPen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deletePatientDocumentAction } from "@/lib/actions/patient-documents";
import { patientDocumentHref } from "@/lib/patient-documents-queries";
import type { ActionResult } from "@/types";

/**
 * Preview / download / push-note / remove for one document row.
 *
 * Preview opens the in-app modal (`document-preview-modal.tsx`) instead of a raw
 * new tab. Download is still a plain link to `/api/patients/documents/{id}` —
 * the route checks access and mints a fresh signed URL per click, so nothing
 * here holds a URL that could go stale or be shared.
 *
 * Removal asks first. Deleting a lab report is not undoable and the file is gone
 * from storage too, so a stray click on a 4-icon row must not be enough.
 */
export function DocumentRowActions({
  documentId,
  documentName,
  canManage,
  onPreview,
  onPushToNote,
}: {
  documentId: string;
  documentName: string;
  canManage: boolean;
  /** Open the in-app preview modal. */
  onPreview: () => void;
  /** Present only where a psychology session-note draft is being kept. */
  onPushToNote?: () => void;
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
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onPreview}
        title={`Preview ${documentName}`}
      >
        <Eye aria-hidden="true" />
        <span className="sr-only">Preview {documentName}</span>
      </Button>
      {onPushToNote && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onPushToNote}
          title={`Push ${documentName} to Session Note`}
        >
          <NotebookPen aria-hidden="true" />
          <span className="sr-only">Push {documentName} to Session Note</span>
        </Button>
      )}
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
