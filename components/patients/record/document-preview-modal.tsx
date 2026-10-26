"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Minus,
  NotebookPen,
  Plus,
  Printer,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

import { pushSnippetToSessionDraft } from "@/lib/session-note-draft";
import {
  PATIENT_DOCUMENT_CATEGORY_META,
  formatFileSize,
  isImageDocument,
  patientDocumentCategoryLabel,
} from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import type { PatientDocumentView } from "@/lib/patient-documents-queries";

/** How a document arrived — the same wording the table's "Added by" pill uses. */
function sourceLabel(source: string): string {
  if (source === "patient_online") return "Patient online";
  if (source === "reception") return "Reception";
  return "Clinician";
}

function describeUploadedAt(uploadedAt: string, timezone: string): string {
  const local = utcIsoToClinicLocalInput(uploadedAt, timezone);
  const date = formatNaiveDate(local);
  const time = formatNaiveTime(local);
  return time ? `${date} · ${time}` : date;
}

/**
 * In-app secure preview for one document.
 *
 * - Images render in a zoomable lightbox (scaled `<img>`, buttons rather than
 *   pinch because the modal is mostly opened from a desktop list row).
 * - PDFs render in an iframe pointed at `/api/…?embed=1`, which streams the
 *   file same-origin — the browser's PDF plugin can display it, and
 *   "Print document" can call `iframe.contentWindow.print()` without being
 *   blocked as cross-origin.
 *
 * No new tabs, no downloads unless the clinician asks for one.
 */
export function DocumentPreviewModal({
  document: doc,
  timezone,
  onClose,
  canPushToNote = false,
}: {
  document: PatientDocumentView | null;
  timezone: string;
  onClose: () => void;
  /** Psych workspace mounts with a draft key context; general record leaves it off. */
  canPushToNote?: boolean;
}) {
  const [scale, setScale] = useState(1);
  const [printing, setPrinting] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Reset zoom per document, not per lifetime of the component.
  useEffect(() => {
    setScale(1);
  }, [doc?.id]);

  const open = Boolean(doc);
  const isImage = Boolean(doc && isImageDocument(doc.mime_type));
  const isPdf = Boolean(doc && doc.mime_type === "application/pdf");
  const href = doc ? `/api/patients/documents/${doc.id}` : "";

  if (doc) {
    const category = patientDocumentCategoryLabel(doc.category);

    function printDocument() {
      const frame = frameRef.current;
      if (!frame) return;
      setPrinting(true);
      // One retry: the PDF plugin may still be initializing on a slow first
      // load. The timer keeps Edge's spinner honest without freezing UI.
      window.setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          toast.error("Printing is blocked for this file. Use Download instead.");
        } finally {
          setPrinting(false);
        }
      }, 150);
    }

    function pushToNote() {
      if (!doc) return;
      const category = patientDocumentCategoryLabel(doc.category);
      const snippet = `Document reviewed: ${doc.document_name} (${category}) uploaded on ${describeUploadedAt(doc.uploaded_at, timezone).split(" · ")[0]}.`;
      const result = pushSnippetToSessionDraft(doc.patient_id, snippet);
      if (!result.ok) {
        toast.error(
          "Couldn't reach the session note draft. Open Session Notes and paste it manually.",
        );
        return;
      }
      toast.success(
        `Document reference pushed to today's session note draft (${result.format} ${result.fieldLabel}) — review it in Session Notes.`,
      );
    }

    return (
      <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
        <DialogContent size="wide" className="max-h-[92vh] gap-0 p-0">
          <DialogHeader className="border-b border-hairline px-4 py-3">
            <DialogTitle className="truncate pr-6 text-sm font-semibold">
              {doc.document_name}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span
                className={cn(
                  "rounded-pill px-2 py-0.5 font-semibold",
                  PATIENT_DOCUMENT_CATEGORY_META[doc.category]?.badge ??
                    PATIENT_DOCUMENT_CATEGORY_META.general.badge,
                )}
              >
                {category}
              </span>
              <span className="rounded-pill bg-app px-2 py-0.5 text-text-secondary">
                {sourceLabel(doc.source)}
              </span>
              <span className="text-text-muted">
                {formatFileSize(doc.size_bytes)} · uploaded{" "}
                {describeUploadedAt(doc.uploaded_at, timezone)}
              </span>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto bg-app/60">
            {isImage ? (
              <div className="flex min-h-full items-start justify-center p-4">
                {/* Hidden print frame: `contentWindow.print()` needs a
                    same-origin document, which `?embed=1` provides. */}
                <iframe
                  ref={frameRef}
                  src={`${href}?embed=1`}
                  title=""
                  aria-hidden="true"
                  tabIndex={-1}
                  className="absolute size-0 border-0 opacity-0"
                />
                <img
                  src={href}
                  alt={doc.document_name}
                  style={{ transform: `scale(${scale})` }}
                  className={cn(
                    "origin-top rounded border border-hairline bg-white shadow-sm transition-transform",
                    "max-w-full",
                  )}
                />
              </div>
            ) : isPdf ? (
              <iframe
                ref={frameRef}
                src={`${href}?embed=1`}
                title={`Preview of ${doc.document_name}`}
                className="h-[72vh] w-full border-0 bg-white"
              />
            ) : (
              <p className="p-6 text-sm text-text-secondary">
                This file type can&apos;t be previewed in the app. Use Download below.
              </p>
            )}
          </div>

          {isImage && (
            <div className="flex items-center justify-center gap-1.5 border-t border-hairline px-4 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setScale((s) => Math.max(1, +(s - 0.5).toFixed(2)))}
              >
                <Minus aria-hidden="true" />
                <span className="sr-only">Zoom out</span>
              </Button>
              <span className="w-14 text-center text-xs tabular-nums text-text-muted">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setScale((s) => Math.min(4, +(s + 0.5).toFixed(2)))}
              >
                <Plus aria-hidden="true" />
                <span className="sr-only">Zoom in</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setScale(1)}
              >
                <RotateCcw aria-hidden="true" />
                <span className="sr-only">Reset zoom</span>
              </Button>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
            {canPushToNote && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={pushToNote}
              >
                <NotebookPen aria-hidden="true" />
                Push to Session Note
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={printing || (!isPdf && !isImage)}
              title={isPdf || isImage ? undefined : "Unavailable for this file type"}
              onClick={printDocument}
            >
              {printing ? <Spinner size="sm" /> : <Printer aria-hidden="true" />}
              Print Document
            </Button>
            <Button asChild variant="primary" size="sm">
              <a href={`${href}?download=1`}>
                <Download aria-hidden="true" />
                Download
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
