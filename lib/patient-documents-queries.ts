/**
 * Reads for the patient Documents tab (migration 0029).
 *
 * Only metadata is fetched here. The files themselves live in the PRIVATE
 * `patient-documents` storage bucket and are never linked directly — a document
 * is opened through `/api/patients/documents/{id}`, which re-checks access and
 * mints a short-lived signed URL. `file_path` must not reach the browser.
 *
 * Like `lib/patient-record.ts`, every query filters `clinic_id` as well as
 * `patient_id`. RLS already scopes the table; the explicit filter means a
 * mis-passed patient id can never widen the result set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  PatientDocument,
  PatientDocumentCategory,
} from "@/types/database";

/** Filter-bar + badge metadata for the 0117 category buckets. */
export const PATIENT_DOCUMENT_CATEGORY_META: Record<
  PatientDocumentCategory,
  { label: string; short: string; badge: string }
> = {
  consents_legal: {
    label: "Consents & Legal",
    short: "Consents",
    badge: "bg-violet-500/10 text-violet-700",
  },
  labs_scans: {
    label: "Labs & Scans",
    short: "Labs",
    badge: "bg-teal-500/10 text-teal-700",
  },
  referrals_evals: {
    label: "Referrals & Evals",
    short: "Referrals",
    badge: "bg-amber-500/10 text-amber-700",
  },
  patient_uploads: {
    label: "Patient Uploads",
    short: "Patient",
    badge: "bg-primary/10 text-primary",
  },
  general: {
    label: "General",
    short: "General",
    badge: "bg-text-muted/10 text-text-secondary",
  },
};

/** Safe folder label for a category that an older DB has not seen yet. */
export function patientDocumentCategoryLabel(
  category: string | null | undefined,
): string {
  const meta = (category as PatientDocumentCategory | undefined | null)
    ? PATIENT_DOCUMENT_CATEGORY_META[category as PatientDocumentCategory]
    : undefined;
  return meta?.label ?? "General";
}

/** Columns every row carries, regardless of which migrations have landed. */
const BASE_COLUMNS =
  "id, clinic_id, patient_id, document_name, mime_type, size_bytes, uploaded_by_user_id, uploaded_at, source";

/** `document_date` arrived in 0052. */
const WITH_DATE_COLUMNS = `${BASE_COLUMNS}, document_date`;

/** `category` arrived in 0117. */
const WITH_CATEGORY_COLUMNS = `${WITH_DATE_COLUMNS}, category`;

/**
 * A document as the UI sees it: everything from the row except `file_path`,
 * which is deliberately dropped so a storage key cannot leak into a client
 * component's props.
 */
export type PatientDocumentView = Omit<PatientDocument, "file_path">;

/** Shape the query actually returns — every late column optional. */
type RawDocumentRow = Partial< {
  document_date: string | null;
  category: PatientDocumentCategory;
} > &
  Omit<PatientDocumentView, "document_date" | "category">;

function asView(
  row: RawDocumentRow,
): PatientDocumentView {
  return {
    ...row,
    document_date: row.document_date ?? null,
    category: row.category ?? "general",
  };
}

export async function fetchPatientDocuments(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientDocumentView[]> {
  const { data, error } = await supabase
    .from("patient_documents")
    .select(WITH_CATEGORY_COLUMNS)
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    // `document_date` arrived in 0052 and `category` in 0117. If a deployment
    // has not applied one of them yet, retry without the missing column rather
    // than blanking the whole Documents tab — extras are a bonus, the list is
    // not. The checks match the 42703 message shape PostgREST returns.
    const message = error.message.toLowerCase();
    const missing = error.code === "42703" || error.code === "PGRST204";
    if (missing && message.includes("category")) {
      const retry = await supabase
        .from("patient_documents")
        .select(WITH_DATE_COLUMNS)
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("uploaded_at", { ascending: false });
      if (!retry.error) {
        return ((retry.data ?? []) as RawDocumentRow[]).map(asView);
      }
    }
    if (
      (missing && message.includes("document_date")) ||
      (missing && message.includes("category"))
    ) {
      const retry = await supabase
        .from("patient_documents")
        .select(BASE_COLUMNS)
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("uploaded_at", { ascending: false });
      if (!retry.error) {
        return ((retry.data ?? []) as RawDocumentRow[]).map(asView);
      }
    }

    console.error("[patient documents] query failed", {
      clinicId,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => asView(row as RawDocumentRow));
}

/**
 * Human-readable file size. Uses binary units to match the 10 MiB DB CHECK, so
 * a file the server rejected at 10485761 bytes does not read as "10 MB" here
 * while the error message says the limit is 10 MB.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Short label for the type column — "PDF", "PNG", "JPEG", "WebP". */
export function documentKindLabel(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    case "image/webp":
      return "WebP";
    default:
      return "File";
  }
}

/** True for the types a browser will render inline in a new tab. */
export function isImageDocument(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** The href that opens a document. The route mints the signed URL. */
export function patientDocumentHref(documentId: string): string {
  return `/api/patients/documents/${documentId}`;
}
