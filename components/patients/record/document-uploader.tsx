"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CloudUpload, Paperclip } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadPatientDocumentAction } from "@/lib/actions/patient-documents";
import { formatFileSize } from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import {
  PATIENT_DOCUMENT_MAX_BYTES,
  PATIENT_DOCUMENT_MIME_TYPES,
} from "@/types/database";
import type { ActionResult } from "@/types";

/** What the file picker offers. Not validation — the server sniffs the bytes. */
const ACCEPT = PATIENT_DOCUMENT_MIME_TYPES.join(",");

/**
 * Upload one document to a patient's record.
 *
 * Two shapes, one implementation, so the sidebar widget and the Documents tab
 * cannot drift apart:
 * - `dropzone` — the dashed drop target for the sidebar
 * - `inline` — a single button, for the top of the tab where the list is the
 *   main content
 *
 * The obvious client-side checks (type, size) run here purely for a fast, clear
 * error; `uploadPatientDocumentAction` re-checks both and identifies the file by
 * its magic bytes rather than the type the browser guessed from the extension.
 */
export function DocumentUploader({
  patientId,
  variant = "inline",
  disabled = false,
}: {
  patientId: string;
  variant?: "dropzone" | "inline";
  /** True when the signed-in role may not manage clinical data. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(uploadPatientDocumentAction, null);

  useEffect(() => {
    if (state?.ok) {
      setClientError(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }, [state, router]);

  /**
   * Returns the reason a file is unacceptable, or `null` to proceed. Mirrors the
   * server's limits so the common mistakes are caught without a round trip.
   */
  function rejectionReason(file: File): string | null {
    if (file.size === 0) return "That file is empty.";
    if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
      return `${file.name} is ${formatFileSize(file.size)}. The limit is 10 MB.`;
    }
    if (
      file.type &&
      !(PATIENT_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return "Only PDF, PNG, JPEG and WebP files can be attached.";
    }
    return null;
  }

  /** Validate, then submit. One file per upload keeps the error reporting honest. */
  function submitFile(file: File | undefined) {
    if (!file) return;
    const reason = rejectionReason(file);
    if (reason) {
      setClientError(reason);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setClientError(null);
    formRef.current?.requestSubmit();
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (disabled || pending) return;
    const file = event.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;

    // Move the dropped file into the real input so the form action receives it.
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    submitFile(file);
  }

  const message = clientError ?? (state && !state.ok ? state.message : null);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled || pending}
        onChange={(event) => submitFile(event.target.files?.[0])}
      />

      {variant === "dropzone" ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled && !pending) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-card border border-dashed px-4 py-6 text-center transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-text-muted/30 bg-app/40",
          )}
        >
          <span className="mx-auto mb-2 flex size-9 items-center justify-center rounded-pill bg-surface">
            {pending ? (
              <Spinner size="sm" />
            ) : (
              <CloudUpload aria-hidden="true" className="size-4 text-text-muted" />
            )}
          </span>
          <p className="text-sm text-text-secondary">
            {pending ? "Uploading…" : "Drop a file here, or"}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={disabled || pending}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip aria-hidden="true" />
            Upload Document
          </Button>
          <p className="mt-2 text-xs text-text-muted">
            PDF, PNG, JPEG or WebP · up to 10 MB
          </p>
        </div>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={disabled || pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? <Spinner size="sm" /> : <Paperclip aria-hidden="true" />}
          {pending ? "Uploading…" : "Upload Document"}
        </Button>
      )}

      {message && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {disabled && (
        <p className="text-xs text-text-muted">
          Your role can&apos;t attach documents to a patient record.
        </p>
      )}
    </form>
  );
}
