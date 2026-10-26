"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  FileImage,
  Files,
  FileText,
  Microscope,
  ScrollText,
  Send,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { ConsentFormGenerator } from "@/components/patients/record/consent-form-generator";
import { DocumentPreviewModal } from "@/components/patients/record/document-preview-modal";
import { DocumentRowActions } from "@/components/patients/record/document-row-actions";
import { DocumentUploader } from "@/components/patients/record/document-uploader";
import { RecordEmpty } from "@/components/patients/record/record-primitives";
import { pushSnippetToSessionDraft } from "@/lib/session-note-draft";
import {
  PATIENT_DOCUMENT_CATEGORY_META,
  documentKindLabel,
  formatFileSize,
  isImageDocument,
  patientDocumentCategoryLabel,
  type PatientDocumentView,
} from "@/lib/patient-documents-queries";
import { cn } from "@/lib/utils";
import {
  formatNaiveDate,
  formatNaiveTime,
  formatShortDate,
} from "@/lib/utils/datetime";
import { utcIsoToClinicLocalInput } from "@/lib/time";
import {
  PATIENT_DOCUMENT_CATEGORIES,
  type PatientDocumentCategory,
} from "@/types/database";

/** Icons never change per bucket; the labels and colors come from the meta map. */
const CATEGORY_ICONS: Record<PatientDocumentCategory, typeof ScrollText> = {
  consents_legal: ScrollText,
  labs_scans: Microscope,
  referrals_evals: Send,
  patient_uploads: Smartphone,
  general: Files,
};

/**
 * Documents — every file attached to this patient, newest first, with the 0117
 * category buckets as a filter bar.
 *
 * A table on `sm` and up: name, category, type, size, when it arrived, actions.
 * Below that it becomes stacked cards, the same fallback the Vitals tab uses,
 * because five columns on a phone is unreadable.
 *
 * The uploader sits above the list rather than inside the empty state, so
 * attaching a second document is exactly as easy as attaching the first. Next
 * to it: the built-in consent generator — print the standard form on clinic
 * letterhead, then file the signed scan under "Consents & Legal".
 */
export function DocumentsTab({
  patientId,
  documents,
  timezone,
  canManage,
  sessionNoteDraftKey,
  patientInfo,
}: {
  patientId: string;
  documents: PatientDocumentView[];
  timezone: string;
  canManage: boolean;
  /** `psych-session-draft:{patientId}` enables 📋 Push-to-Session-Note actions. */
  sessionNoteDraftKey?: string | null;
  /** Patient identity for the consent generator; absent disables it. */
  patientInfo?: {
    name: string;
    patientCode: string | null;
    dateOfBirth: string | null;
    gender: string | null;
  } | null;
}) {
  const [filter, setFilter] = useState<"all" | PatientDocumentCategory>("all");
  const [preview, setPreview] = useState<PatientDocumentView | null>(null);
  const [uploaderCategory, setUploaderCategory] =
    useState<PatientDocumentCategory>("general");

  const counts = useMemo(() => {
    const map = new Map<PatientDocumentCategory, number>();
    for (const category of PATIENT_DOCUMENT_CATEGORIES) map.set(category, 0);
    for (const document of documents) {
      const key = document.category ?? "general";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [documents]);

  const visible = useMemo(
    () =>
      filter === "all"
        ? documents
        : documents.filter((document) => (document.category ?? "general") === filter),
    [documents, filter],
  );

  /**
   * 📋 Push to Session Note — a one-line clinical citation into today's draft
   * (BIRP Behavior / SOAP Objective / DAP Data, whatever the draft already
   * uses), so the note can cite the reviewed document by name, bucket and date.
   */
  function pushDocumentToNote(document: PatientDocumentView) {
    const uploaded = describeUploadedAt(document.uploaded_at, timezone).split(" · ")[0];
    const snippet = `Document reviewed: ${document.document_name} (${patientDocumentCategoryLabel(document.category)}) uploaded on ${uploaded}.`;
    const result = pushSnippetToSessionDraft(patientId, snippet);
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

  function fileSignedCopy() {
    setUploaderCategory("consents_legal");
    toast.success(
      "New uploads will be filed under “Consents & Legal”. Choose the scan of the signed form to upload.",
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <DocumentUploader
          patientId={patientId}
          disabled={!canManage}
          defaultCategory={uploaderCategory}
        />
        {canManage && patientInfo && (
          <ConsentFormGenerator
            patientInfo={patientInfo}
            disabled={!canManage}
            onUnsignedCopyUpload={fileSignedCopy}
          />
        )}
      </div>

      {documents.length === 0 ? (
        <RecordEmpty
          icon={Files}
          title="No documents yet"
          description="Lab reports, scans and referrals attached here stay with the patient's record. PDF, PNG, JPEG or WebP, up to 10 MB each."
        />
      ) : (
        <>
          {/* Category filter bar */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by category">
            <FilterPill
              active={filter === "all"}
              onClick={() => setFilter("all")}
              icon={Files}
              label="All"
              count={documents.length}
              badge="bg-text-muted/10 text-text-secondary"
            />
            {PATIENT_DOCUMENT_CATEGORIES.map((category) => {
              const meta = PATIENT_DOCUMENT_CATEGORY_META[category];
              return (
                <FilterPill
                  key={category}
                  active={filter === category}
                  onClick={() => setFilter(filter === category ? "all" : category)}
                  icon={CATEGORY_ICONS[category]}
                  label={meta.short}
                  count={counts.get(category) ?? 0}
                  badge={meta.badge}
                />
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-card border border-dashed border-text-muted/30 bg-app/40 px-4 py-6 text-center text-sm text-text-muted">
              No documents in this category yet.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-card border border-text-muted/20 sm:block">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-text-muted/20 bg-app text-left">
                      <Th>Document</Th>
                      <Th>Category</Th>
                      <Th>Type</Th>
                      <Th>Size</Th>
                      <Th>Doc date</Th>
                      <Th>Uploaded</Th>
                      <Th>Added by</Th>
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-muted/15">
                    {visible.map((document) => {
                      const categoryKey = document.category ?? "general";
                      const categoryMeta =
                        PATIENT_DOCUMENT_CATEGORY_META[categoryKey] ??
                        PATIENT_DOCUMENT_CATEGORY_META.general;
                      return (
                        <tr key={document.id} className="bg-surface">
                          <td className="px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <DocumentIcon mimeType={document.mime_type} />
                              <span className="truncate text-text-primary">
                                {document.document_name}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={cn(
                                "rounded-pill px-2 py-0.5 text-[11px] font-semibold",
                                categoryMeta.badge,
                              )}
                            >
                              {categoryMeta.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                            {documentKindLabel(document.mime_type)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-text-secondary">
                            {formatFileSize(document.size_bytes)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                            {document.document_date ? (
                              <span className="inline-flex items-center gap-1.5">
                                <CalendarDays
                                  aria-hidden="true"
                                  className="size-3.5 text-primary"
                                  strokeWidth={2.25}
                                />
                                {formatShortDate(document.document_date)}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">
                            {describeUploadedAt(document.uploaded_at, timezone)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span
                              className={
                                document.source === "patient_online"
                                  ? "rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                                  : "text-text-secondary"
                              }
                            >
                              {documentSourceLabel(document.source)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <DocumentRowActions
                              documentId={document.id}
                              documentName={document.document_name}
                              canManage={canManage}
                              onPreview={() => setPreview(document)}
                              onPushToNote={
                                sessionNoteDraftKey
                                  ? () => pushDocumentToNote(document)
                                  : undefined
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 sm:hidden">
                {visible.map((document) => {
                  const categoryKey = document.category ?? "general";
                  const categoryMeta =
                    PATIENT_DOCUMENT_CATEGORY_META[categoryKey] ??
                    PATIENT_DOCUMENT_CATEGORY_META.general;
                  return (
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
                            <span className={cn("font-semibold", categoryMeta.badge.split(" ")[1])}>
                              {categoryMeta.label}
                            </span>
                            {" · "}
                            {documentKindLabel(document.mime_type)} ·{" "}
                            {formatFileSize(document.size_bytes)}
                            {document.document_date
                              ? ` · dated ${formatShortDate(document.document_date)}`
                              : ""}{" "}
                            · {describeUploadedAt(document.uploaded_at, timezone)} ·{" "}
                            {documentSourceLabel(document.source)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2">
                        <DocumentRowActions
                          documentId={document.id}
                          documentName={document.document_name}
                          canManage={canManage}
                          onPreview={() => setPreview(document)}
                          onPushToNote={
                            sessionNoteDraftKey
                              ? () => pushDocumentToNote(document)
                              : undefined
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      <DocumentPreviewModal
        document={preview}
        timezone={timezone}
        canPushToNote={Boolean(sessionNoteDraftKey)}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                    */
/* -------------------------------------------------------------------------- */

function FilterPill({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ScrollText;
  label: string;
  count: number;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-text-muted/25 bg-surface text-text-secondary hover:border-primary/50 hover:text-text-primary",
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
      <span className={cn("rounded-pill px-1.5 text-[10px] tabular-nums font-bold", badge)}>
        {count}
      </span>
    </button>
  );
}

/** How a document arrived — a patient link, the desk, or a clinician. */
function documentSourceLabel(source: string): string {
  if (source === "patient_online") return "Patient online";
  if (source === "reception") return "Reception";
  return "Clinician";
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
