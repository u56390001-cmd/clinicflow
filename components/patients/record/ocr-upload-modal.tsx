"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileScan, FileText, ScanSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { processDocumentOCRAction } from "@/lib/actions/ocr-actions";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils/datetime";
import { PATIENT_DOCUMENT_MAX_BYTES } from "@/types/database";

const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "webp"];

function fileSizeLabel(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "Scan document" modal — module 2 of the ingestion scope.
 *
 * A bare dropzone holds one PDF/PNG/JPEG/WebP and a single action ("Scan with
 * AI") pushes it through `processDocumentOCRAction`. The server sniffs the
 * bytes, reads it with the clinic's AI provider, writes the extracted items
 * into `medical_history` as `pending_approval` rows, refreshes the patient's AI
 * summary and keeps the original scan in the patient's Documents tab; this
 * modal only has to tell the doctor what came back. The one memorable moment is
 * the short "Reading…" state between picking a file and the result.
 */
export function OcrUploadModal({
  patientId,
  onClose,
  onProcessed,
}: {
  patientId: string;
  onClose: () => void;
  /** Fired with the extracted count after a successful scan, so a hosting list
   *  (e.g. the waiting queue) can paint its own pending-review chip. */
  onProcessed?: (count: number) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function acceptCandidate(candidate: File) {
    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("Choose a PDF, PNG, JPEG or WebP file to scan.");
      return;
    }
    if (candidate.size === 0) {
      setError("That file looks empty. Choose a readable scan.");
      return;
    }
    if (candidate.size > PATIENT_DOCUMENT_MAX_BYTES) {
      setError(
        `That file is ${fileSizeLabel(candidate.size)}. The limit is 10 MB.`,
      );
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function scan() {
    if (!file || working) return;
    setWorking(true);
    setError(null);

    const data = new FormData();
    data.set("patientId", patientId);
    data.set("file", file);

    void processDocumentOCRAction(null, data).then((result) => {
      setWorking(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const count = result.data?.count ?? 0;
      const medicationsCount = result.data?.medicationsCount ?? 0;
      const alertsCount = result.data?.alertsCount ?? 0;
      toast.success(
        count === 1
          ? "1 history item extracted and saved for review."
          : `${count} history items extracted and saved for review.`,
      );
      if (medicationsCount > 0) {
        toast.info(
          medicationsCount === 1
            ? "1 medicine extracted — review it on the Overview tab."
            : `${medicationsCount} medicines extracted — review them on the Overview tab.`,
        );
      }
      if (alertsCount > 0) {
        toast.info(
          alertsCount === 1
            ? "1 allergy or known condition extracted — review it on the Overview tab."
            : `${alertsCount} allergies and known conditions extracted — review them on the Overview tab.`,
        );
      }
      if (result.data?.medicationsSaveIssue) {
        // The extraction succeeded but the rows could not be stored, so say so
        // rather than letting the doctor assume the medicines are on file.
        toast.warning(
          result.data.medicationsSaveIssue === "missing_table"
            ? `Found ${medicationsCount} medicines, but the medications table is missing on this database. Ask your developer to apply migration 0050, then scan the document again.`
            : `Found ${medicationsCount} medicines, but they could not be saved. The scan itself is fine — please try again.`,
        );
      }
      if (result.data?.summaryUpdated) {
        toast.info("Patient's AI summary was updated from this document.");
      }
      if (formatShortDate(result.data?.documentDate)) {
        toast.info(
          `Document dated ${formatShortDate(result.data?.documentDate)} — that date is saved with everything extracted from it.`,
        );
      }
      if (result.data?.documentSaved === false) {
        toast.warning(
          "History was saved, but the scan file couldn't be attached to Documents.",
        );
      }
      onProcessed?.(count);
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Scan medical document"
    >
      <div className="relative my-8 flex w-full max-w-lg flex-col overflow-hidden rounded-card border border-brand-line bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-line bg-brand-wash px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-control bg-brand-pale">
              <FileScan aria-hidden="true" className="size-4 text-brand-cta" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-brand-ink">Scan medical document</h2>
              <p className="text-xs text-brand-muted">
                AI extracts history for you to verify
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={working}
            className="group flex size-8 items-center justify-center rounded-control text-brand-muted transition-colors hover:bg-brand-pale hover:text-brand-ink"
            aria-label="Close"
          >
            <X
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:rotate-90"
            />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-brand-danger-soft bg-brand-danger-soft px-3 py-2 text-xs font-medium leading-relaxed text-brand-danger"
            >
              {error}
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) acceptCandidate(picked);
              event.target.value = "";
            }}
          />

          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-sage bg-brand-wash px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-pale text-brand-cta shadow-sm">
                  <FileText aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-brand-ink">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-brand-faint">{fileSizeLabel(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={working}
                onClick={() => setFile(null)}
                className="rounded-md p-1 text-brand-faint transition-colors hover:text-brand-danger"
                aria-label="Remove file"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) acceptCandidate(dropped);
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
                dragging
                  ? "border-brand-cta bg-brand-wash"
                  : "border-brand-line bg-brand-canvas",
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-pale text-brand-cta">
                <ScanSearch aria-hidden="true" className="size-5" />
              </span>
              <p className="text-[13px] font-semibold text-brand-ink">
                Drop a prescription or report here
              </p>
              <p className="text-[11px] text-brand-faint">
                PDF, PNG, JPEG or WebP · up to 10 MB
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => inputRef.current?.click()}
              >
                Choose a file
              </Button>
            </div>
          )}

          <div className="rounded-lg bg-brand-canvas px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-brand-muted">
              Reads past illnesses, surgeries and immunizations into the History
              tab, pulls out medicines for the medications list and any allergies
              or known conditions for the safety alerts, and refreshes the AI
              summary on the Overview tab — everything lands labelled{" "}
              <span className="font-semibold text-brand-ink">Needs review</span>,
              nothing is marked verified without you.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-brand-line bg-brand-canvas px-5 py-3.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={working}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!file || working}
            onClick={scan}
          >
            {working ? (
              <>
                <Spinner size="sm" />
                Scanning…
              </>
            ) : (
              <>
                <ScanSearch aria-hidden="true" className="size-3.5" />
                Scan with AI
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}