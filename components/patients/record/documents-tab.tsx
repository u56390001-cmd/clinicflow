"use client";

import { FileText, FileImage, Files } from "lucide-react";

import { DocumentRowActions } from "@/components/patients/record/document-row-actions";
import { DocumentUploader } from "@/components/patients/record/document-uploader";
import { RecordEmpty } from "@/components/patients/record/record-primitives";
import {
  documentKindLabel,
  formatFileSize,
  isImageDocument,
  type PatientDocumentView,
} from "@/lib/patient-documents-queries";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import { formatNaiveDate, formatNaiveTime } from "@/lib/utils/datetime";

/**
 * Documents — every file attached to this patient, newest first.
 *
 * A table on `sm` and up: name, type, size, when it arrived, actions. Below that
 * it becomes stacked cards, the same fallback the Vitals tab uses, because five
 * columns on a phone is unreadable.
 *
 * The uploader sits above the list rather than inside the empty state, so
 * attaching a second document is exactly as easy as attaching the first.
 */
export function DocumentsTab({
  patientId,
  documents,
  timezone,
  canManage,
}: {
  patientId: string;
  documents: PatientDocumentView[];
  timezone: string;
  canManage: boolean;
}) {
  return (
    <div className="space-y-3">
      <DocumentUploader patientId={patientId} disabled={!canManage} />

      {documents.length === 0 ? (
        <RecordEmpty
          icon={Files}
          title="No documents yet"
          description="Lab reports, scans and referrals attached here stay with the patient's record. PDF, PNG, JPEG or WebP, up to 10 MB each."
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-text-muted/20 sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-text-muted/20 bg-app text-left">
                  <Th>Document</Th>
                  <Th>Type</Th>
                  <Th>Size</Th>
                  <Th>Uploaded</Th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-muted/15">
                {documents.map((document) => (
                  <tr key={document.id} className="bg-surface">
                    <td className="px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <DocumentIcon mimeType={document.mime_type} />
                        <span className="truncate text-text-primary">
                          {document.document_name}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                      {documentKindLabel(document.mime_type)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-text-secondary">
                      {formatFileSize(document.size_bytes)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                      {describeUploadedAt(document.uploaded_at, timezone)}
                    </td>
                    <td className="px-3 py-2">
                      <DocumentRowActions
                        documentId={document.id}
                        documentName={document.document_name}
                        canManage={canManage}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 sm:hidden">
            {documents.map((document) => (
              <li
                key={document.id}
                className="rounded-card border border-text-muted/20 bg-surface p-3"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <DocumentIcon mimeType={document.mime_type} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-text-primary">
                      {document.document_name}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {documentKindLabel(document.mime_type)} ·{" "}
                      {formatFileSize(document.size_bytes)} ·{" "}
                      {describeUploadedAt(document.uploaded_at, timezone)}
                    </p>
                  </div>
                </div>
                <div className="mt-2">
                  <DocumentRowActions
                    documentId={document.id}
                    documentName={document.document_name}
                    canManage={canManage}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
    >
      {children}
    </th>
  );
}

function DocumentIcon({ mimeType }: { mimeType: string }) {
  const Icon = isImageDocument(mimeType) ? FileImage : FileText;
  return (
    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
  );
}

/** Date, plus the time — two scans on the same day are common. */
function describeUploadedAt(uploadedAt: string, timezone: string): string {
  const local = utcIsoToClinicLocalInput(uploadedAt, timezone);
  const date = formatNaiveDate(local);
  const time = formatNaiveTime(local);
  return time ? `${date} · ${time}` : date;
}
