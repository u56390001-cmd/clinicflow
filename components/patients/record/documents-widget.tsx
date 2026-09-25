"use client";

import Link from "next/link";
import { FileImage, FileText } from "lucide-react";

import { DocumentUploader } from "@/components/patients/record/document-uploader";
import {
  formatFileSize,
  isImageDocument,
  type PatientDocumentView,
} from "@/lib/patient-documents-queries";

/**
 * Documents widget — the sidebar counterpart to the Documents tab.
 *
 * It stays on screen whichever tab is open, which is the point: a nurse reading
 * vitals should be able to drop in a lab report without first navigating
 * somewhere else. The dashed dropzone accepts a drag straight from the desktop.
 *
 * Only the three most recent files are listed. This is a 300px column, and the
 * full list is one click away — a long scroll here would push Basic Health Info
 * off the screen.
 */
const PREVIEW_COUNT = 3;

export function DocumentsWidget({
  patientId,
  documents,
  documentsTabHref,
  canManage,
  showUploader = true,
}: {
  patientId: string;
  documents: PatientDocumentView[];
  /** `?tab=documents` for this patient — the "View all" target. */
  documentsTabHref: string;
  canManage: boolean;
  /**
   * False while the Documents tab is open — that panel has its own upload
   * control, and two of them on one screen is just clutter.
   */
  showUploader?: boolean;
}) {
  const preview = documents.slice(0, PREVIEW_COUNT);
  const remaining = documents.length - preview.length;

  return (
    <section className="rounded-card border border-text-muted/15 bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-text-muted/15 px-4 py-3">
        <h3 className="text-[13px] font-bold text-secondary">Documents</h3>
        {documents.length > 0 && (
          <span className="rounded-pill bg-app px-1.5 py-0.5 text-[10px] tabular-nums text-text-muted">
            {documents.length}
          </span>
        )}
      </header>

      <div className="px-4 py-3">
        {preview.length > 0 && (
          <ul className="space-y-2">
            {preview.map((document) => {
              const Icon = isImageDocument(document.mime_type)
                ? FileImage
                : FileText;
              return (
                <li key={document.id} className="flex min-w-0 items-start gap-2">
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-text-muted"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-primary">
                      {document.document_name}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {formatFileSize(document.size_bytes)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {documents.length > 0 && (
          <Link
            href={documentsTabHref}
            scroll={false}
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            {remaining > 0 ? `View all ${documents.length}` : "Open Documents"}
          </Link>
        )}

        {documents.length === 0 && (
          <p className="text-sm text-text-secondary">No documents yet</p>
        )}

        {showUploader && (
          <div className="mt-3">
            <DocumentUploader
              patientId={patientId}
              variant="dropzone"
              disabled={!canManage}
            />
          </div>
        )}
      </div>
    </section>
  );
}
