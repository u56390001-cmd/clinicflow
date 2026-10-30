"use server";

import { z } from "zod";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import {
  UPLOAD_KIND_LABEL,
  readSignatureHeader,
  sanitiseFileName,
  sniffFileSignature,
} from "@/lib/file-signature";
import { createClient } from "@/lib/supabase/server";
import {
  PATIENT_DOCUMENT_CATEGORIES,
  PATIENT_DOCUMENT_MAX_BYTES,
  PATIENT_DOCUMENTS_BUCKET,
} from "@/types/database";
import type { PatientDocumentCategory } from "@/types/database";
import type { ActionResult } from "@/types";

const uploadSchema = z.object({ patientId: z.uuid() });
const deleteSchema = z.object({ documentId: z.uuid() });

/**
 * The category is optional input: anything unexpected collapses to the
 * `general` bucket so a tampered form value can never violate the 0117 CHECK.
 */
function categoryFromForm(formData: FormData): PatientDocumentCategory {
  const raw = formData.get("category");
  return PATIENT_DOCUMENT_CATEGORIES.includes(raw as PatientDocumentCategory)
    ? (raw as PatientDocumentCategory)
    : "general";
}

/**
 * Attach a file to a patient's record.
 *
 * Three things are enforced here rather than in the browser: the type (by
 * sniffing the bytes), the size, and that the patient actually belongs to the
 * caller's clinic. The DB CHECKs and the composite FK on
 * `(clinic_id, patient_id)` are the backstop, not the first line of defence.
 */
export async function uploadPatientDocumentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = uploadSchema.safeParse({
    patientId: formData.get("patientId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing patient id." };
  }
  const { patientId } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file to upload." };
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }

  // 16 bytes is enough for every signature above (WebP needs 12).
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffFileSignature(header);
  if (!sniffed) {
    return {
      ok: false,
      message: `Only ${UPLOAD_KIND_LABEL} files can be attached. This file's contents are not one of those.`,
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to attach documents." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patient documents." };
  }
  const clinicId = access.clinic.id;

  // `getCurrentClinic` does not carry the user id, and `uploaded_by_user_id` is
  // the only audit trail on who attached a clinical file.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Confirms the patient is this clinic's before anything is written to
  // storage, so a bad id cannot leave a stray object behind.
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const rawName = formData.get("documentName");
  const suppliedName = typeof rawName === "string" ? rawName.trim() : "";
  const fileName = sanitiseFileName(file.name, sniffed.extension);
  const documentName = (suppliedName || fileName).slice(0, 255);

  // Segment 1 is the tenant boundary the storage RLS policies key off.
  const objectKey = `${clinicId}/${patientId}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .upload(objectKey, file, {
      contentType: sniffed.mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadPatientDocumentAction] storage upload failed", {
      clinicId,
      patientId,
      message: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload this file. Please try again." };
  }

  const { error: insertError } = await supabase
    .from("patient_documents")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      document_name: documentName,
      file_path: objectKey,
      mime_type: sniffed.mimeType,
      size_bytes: file.size,
      uploaded_by_user_id: user?.id ?? null,
      category: categoryFromForm(formData),
    });

  if (insertError) {
    // The object is already in the bucket but nothing references it. Remove it
    // rather than leaving an invisible file the clinic still pays to store.
    const { error: cleanupError } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    if (cleanupError) {
      console.error("[uploadPatientDocumentAction] orphaned storage object", {
        objectKey,
        message: cleanupError.message,
      });
    }

    console.error("[uploadPatientDocumentAction] metadata insert failed", {
      clinicId,
      patientId,
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });
    return { ok: false, message: "We couldn't save this document. Please try again." };
  }

  return { ok: true, data: undefined };
}

/**
 * Direct in-tab skin-photo upload for the dermatology workspace (Tab 3).
 *
 * Same bytes-sniffing / tenant checks as `uploadPatientDocumentAction`, but:
 * images only (PNG / JPEG / WebP — dermoscope exports are all three), the
 * file comes as an argument instead of a form round-trip so the drag-and-drop
 * surface can call it directly, and it returns the created `patient_documents`
 * id so the caller can immediately tag it as a `derm_photos` row without a
 * refetch round-trip.
 */
export async function uploadDermImageAction(
  patientId: string,
  file: File,
): Promise<ActionResult<{ documentId: string; documentName: string }>> {
  if (!z.string().uuid().safeParse(patientId).success) {
    return { ok: false, message: "Missing patient id." };
  }
  if (file.size === 0) {
    return { ok: false, message: "Choose a photo to upload." };
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `That photo is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }

  const header = await readSignatureHeader(file);
  const sniffed = sniffFileSignature(header);
  if (!sniffed || !sniffed.mimeType.startsWith("image/")) {
    return {
      ok: false,
      message: "Skin photos must be PNG, JPEG or WebP images.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to upload photos." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't upload patient photos." };
  }
  const clinicId = access.clinic.id;

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fileName = sanitiseFileName(file.name, sniffed.extension);
  const objectKey = `${clinicId}/${patientId}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .upload(objectKey, file, {
      contentType: sniffed.mimeType,
      upsert: false,
    });
  if (uploadError) {
    console.error("[uploadDermImageAction] storage upload failed", {
      clinicId,
      patientId,
      message: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload this photo. Please try again." };
  }

  const documentName = fileName.slice(0, 255);
  const { data: inserted, error: insertError } = await supabase
    .from("patient_documents")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      document_name: documentName,
      file_path: objectKey,
      mime_type: sniffed.mimeType,
      size_bytes: file.size,
      uploaded_by_user_id: user?.id ?? null,
      category: "general",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    const { error: cleanupError } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    if (cleanupError) {
      console.error("[uploadDermImageAction] orphaned storage object", {
        objectKey,
        message: cleanupError.message,
      });
    }
    console.error("[uploadDermImageAction] metadata insert failed", {
      clinicId,
      patientId,
      message: insertError?.message,
    });
    return { ok: false, message: "We couldn't save this photo. Please try again." };
  }

  return { ok: true, data: { documentId: inserted.id, documentName } };
}

/**
 * Detach a document: metadata row first, then the file.
 *
 * That order is deliberate. If the storage delete fails the clinic is left with
 * an unreferenced blob — invisible, and only a storage cost. The reverse order
 * would leave a row pointing at a file that no longer exists, which shows up in
 * the UI as a document that errors when opened.
 */
export async function deletePatientDocumentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse({
    documentId: formData.get("documentId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing document id." };
  }
  const { documentId } = parsed.data;

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to remove documents." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't manage patient documents." };
  }
  const clinicId = access.clinic.id;

  const { data: document } = await supabase
    .from("patient_documents")
    .select("id, file_path")
    .eq("clinic_id", clinicId)
    .eq("id", documentId)
    .maybeSingle();

  if (!document) {
    return { ok: false, message: "That document no longer exists." };
  }

  const { error: deleteError } = await supabase
    .from("patient_documents")
    .delete()
    .eq("clinic_id", clinicId)
    .eq("id", documentId);

  if (deleteError) {
    console.error("[deletePatientDocumentAction] metadata delete failed", {
      clinicId,
      documentId,
      code: deleteError.code,
      message: deleteError.message,
    });
    return { ok: false, message: "We couldn't remove this document. Please try again." };
  }

  const { error: storageError } = await supabase.storage
    .from(PATIENT_DOCUMENTS_BUCKET)
    .remove([document.file_path]);

  if (storageError) {
    console.error("[deletePatientDocumentAction] orphaned storage object", {
      objectKey: document.file_path,
      message: storageError.message,
    });
  }

  return { ok: true, data: undefined };
}
