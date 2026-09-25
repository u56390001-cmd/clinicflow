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

import type { Database, PatientDocument } from "@/types/database";

/**
 * A document as the UI sees it: everything from the row except `file_path`,
 * which is deliberately dropped so a storage key cannot leak into a client
 * component's props.
 */
export type PatientDocumentView = Omit<PatientDocument, "file_path">;

export async function fetchPatientDocuments(
  supabase: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientDocumentView[]> {
  const { data, error } = await supabase
    .from("patient_documents")
    .select(
      "id, clinic_id, patient_id, document_name, mime_type, size_bytes, uploaded_by_user_id, uploaded_at",
    )
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.error("[patient documents] query failed", {
      clinicId,
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []) as PatientDocumentView[];
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
