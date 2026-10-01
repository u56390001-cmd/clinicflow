"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { canManageClinical, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import { checkRateLimit, envInt } from "@/lib/ai/rate-limit";
import { MAX_SUMMARY_CHARS } from "@/lib/ai/patient-summary";
import { historyInsertFromIntakeEntry, parseOnsetDate } from "@/lib/medical-history-mapping";
import {
  AI_OCR_CREATED_BY,
  OCR_RESPONSE_SCHEMA,
  OCR_SYSTEM_PROMPT,
  ocrExtractedDocSchema,
} from "@/lib/validation/ocr-intake-schema";
import {
  AI_OCR_DOCUMENTS_BUCKET,
  PATIENT_DOCUMENT_MAX_BYTES,
  PATIENT_DOCUMENTS_BUCKET,
} from "@/types/database";
import type { ActionResult } from "@/types";

const scannerSchema = z.object({ patientId: z.uuid() });

/**
 * Leading bytes of the file types the scanner accepts — identical signature set
 * to `patient-documents`. Sniffing beats trusting `File.type`, which the
 * browser derives from the filename and is trivially spoofed.
 */
const MAGIC_BYTES: ReadonlyArray<{
  mimeType: string;
  extension: string;
  match: (bytes: Uint8Array) => boolean;
}> = [
  { mimeType: "application/pdf", extension: "pdf", match: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  { mimeType: "image/png", extension: "png", match: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mimeType: "image/jpeg", extension: "jpg", match: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { mimeType: "image/webp", extension: "webp", match: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && b.length >= 12 && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]) },
];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function sniffMimeType(header: Uint8Array) {
  return MAGIC_BYTES.find((candidate) => candidate.match(header)) ?? null;
}

/** Keep a user-supplied filename as a safe object-key tail (see 0029 action). */
function sanitiseFileName(name: string, fallbackExtension: string): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);

  if (!base) return `scan.${fallbackExtension}`;
  return base.includes(".") ? base : `${base}.${fallbackExtension}`;
}

/**
 * Whether a write failed because the target table is not in the database yet.
 * OCR staging is best-effort below the history insert, so when the clinic has
 * not applied the migration a scan still succeeds — but the caller needs to
 * know the medicines/alerts were silently dropped rather than telling the
 * doctor they are saved.
 */
function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null,
  table: string,
): boolean {
  const code = error?.code ?? "";
  if (code === "42P01" || code === "PGRST205") return true;
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes(table.toLowerCase()) ||
    message.includes("relation does not exist") ||
    message.includes("could not find the function")
  );
}

/** Whether a write failed only because the 0052 document-date column is absent. */
function isMissingDateColumnError(
  error: { code?: string | null; message?: string | null } | null,
): boolean {
  const code = error?.code ?? "";
  if (code === "42703" || code === "PGRST204") return true;
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("report_date") || message.includes("document_date")
  );
}

/**
 * The same rows minus the 0052 date columns. Lets a best-effort write retry on a
 * database that has 0050/0051 but not yet 0052 — the medicines, alerts or file
 * still land, just without the document date, instead of being dropped.
 */
function withoutDateColumns<
  T extends {
    report_date?: string | null;
    document_date?: string | null;
  },
>(rows: T[]): T[] {
  return rows.map((row) => {
    const rest = { ...row };
    delete rest.report_date;
    delete rest.document_date;
    return rest;
  });
}

/**
 * Scan a medical document (prescription, lab report, discharge summary) with
 * the AI provider and stage the extracted items as `pending_approval` rows in
 * `medical_history`, where the doctor verifies or discards them on the History
 * tab.
 *
 * The model returns a concise clinical summary alongside the items, which is
 * written to `patients.ai_summary` so the Overview tab's AI Patient Summary card
 * reflects this document (`summaryUpdated: true`).
 *
 * On success the original scan is kept in the patient's Documents tab as well
 * (a permanent `patient_documents` record), so the clinic retains an audit copy
 * alongside the structured extraction. Persisting it is best-effort — if it
 * fails the extraction still stands, and the caller is told via
 * `documentSaved: false`. The stage bucket copy is always transient.
 *
 * The medicines and safety alerts (allergies / known cases) the model picks up
 * are also staged best-effort into their pending-review tables (0050/0051) and
 * reported via `medicationsCount` / `alertsCount`. If those writes fail because
 * the clinic has not applied the migration, the caller is told explicitly via
 * `medicationsSaveIssue: "missing_table"` so the doctor learns the rows were
 * not saved rather than being led to believe they were.
 */
export async function processDocumentOCRAction(
  _prevState: ActionResult<{
    count: number;
    fileName: string;
    documentDate: string | null;
    documentSaved: boolean;
    summaryUpdated: boolean;
    medicationsCount: number;
    medicationsSaved: boolean;
    medicationsSaveIssue: "missing_table" | "error" | null;
    alertsCount: number;
  }> | null,
  formData: FormData,
): Promise<
  ActionResult<{
    count: number;
    fileName: string;
    documentDate: string | null;
    documentSaved: boolean;
    summaryUpdated: boolean;
    medicationsCount: number;
    medicationsSaved: boolean;
    medicationsSaveIssue: "missing_table" | "error" | null;
    alertsCount: number;
  }>
> {
  const parsed = scannerSchema.safeParse({
    patientId: formData.get("patientId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Missing patient id." };
  }
  const { patientId } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a document to scan." };
  }
  if (file.size > PATIENT_DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
    };
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffMimeType(header);
  if (!sniffed) {
    return {
      ok: false,
      message:
        "Only PDF, PNG, JPEG and WebP files can be scanned. This file's contents are not one of those.",
    };
  }

  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) {
    return { ok: false, message: "You must have a clinic to scan documents." };
  }
  if (!canManageClinical(access.role)) {
    return { ok: false, message: "Your role can't scan patient documents." };
  }
  const clinicId = access.clinic.id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "You need to be signed in to do that." };
  }

  const rateLimit = checkRateLimit(
    `ai:ocr:${user.id}`,
    envInt("AI_OCR_RATE_LIMIT", 6),
    60 * 60 * 1000,
  );
  if (!rateLimit.ok) {
    console.warn("[processDocumentOCRAction] rate limit hit", {
      userId: user.id,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    return {
      ok: false,
      message: `You've scanned a lot of documents recently. Please try again in ${rateLimit.retryAfterSeconds} seconds.`,
    };
  }

  // Same guard as uploads: confirm the patient is this clinic's before anything
  // is staged in storage, so a bad id cannot litter the bucket.
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) {
    return { ok: false, message: "That patient is not in this clinic." };
  }

  const fileName = sanitiseFileName(file.name, sniffed.extension);
  const objectKey = `${clinicId}/${patientId}/${crypto.randomUUID()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(AI_OCR_DOCUMENTS_BUCKET)
    .upload(objectKey, file, {
      contentType: sniffed.mimeType,
      upsert: false,
    });
  if (uploadError) {
    console.error("[processDocumentOCRAction] upload failed", { clinicId, patientId, message: uploadError.message });
    return { ok: false, message: "We couldn't upload this document. Please try again." };
  }

  // Everything below can fail; the staged scan is transient either way.
  const cleanup = async () => {
    const { error: removeError } = await supabase.storage
      .from(AI_OCR_DOCUMENTS_BUCKET)
      .remove([objectKey]);
    if (removeError) {
      console.error("[processDocumentOCRAction] orphaned scan object", { objectKey, message: removeError.message });
    }
  };

  try {
    const { data: stored } = await supabase.storage
      .from(AI_OCR_DOCUMENTS_BUCKET)
      .download(objectKey);
    if (!stored) {
      await cleanup();
      return { ok: false, message: "We couldn't read this document back. Please try again." };
    }

    const provider = await resolveProviderForClinic(clinicId);
    const documentBase64 = Buffer.from(await stored.arrayBuffer()).toString("base64");

    const raw = await provider.completeJson({
      systemInstruction: OCR_SYSTEM_PROMPT,
      prompt:
        "Read this medical document and return the patient's structured medical history as JSON.",
      schema: OCR_RESPONSE_SCHEMA,
      document: { mimeType: sniffed.mimeType, data: documentBase64 },
      temperature: 0.1,
      maxOutputTokens: 4096,
    });

    const extracted = ocrExtractedDocSchema.safeParse(raw);
    if (!extracted.success || extracted.data.items.length === 0) {
      await cleanup();
      return {
        ok: false,
        message:
          "We couldn't find any past illnesses, surgeries or other history in this document. Check that the scan is legible.",
      };
    }

        // The date printed on the document itself. A 2018 prescription tells the
    // doctor something different from last month's, so it rides along on every
    // row this scan produces (history, medicines, alerts, document metadata).
    // `parseOnsetDate` is the same loose parser the history rows use, so
    // "2018-03-15", "2018-03" and "2018" all land as real dates and anything
    // unreadable becomes null instead of failing the scan.
    const reportDate = parseOnsetDate(extracted.data.document_date);

    const rows = extracted.data.items.map((item) =>
      historyInsertFromIntakeEntry({
        clinic_id: clinicId,
        patient_id: patientId,
        category: item.category,
        condition: item.condition_name,
        onsetDate: item.onset_date,
        relationship: item.relationship,
        notes: item.notes,
        clinicalStatus: item.clinical_status,
        source: "ai_ocr",
        createdBy: AI_OCR_CREATED_BY,
        reportDate,
      }),
    );

    const { error: insertError } = await supabase
      .from("medical_history")
      .insert(rows);
if (insertError) {
      console.error("[processDocumentOCRAction] history insert failed", { clinicId, patientId, code: insertError.code, message: insertError.message });
      await cleanup();
      if (isMissingDateColumnError(insertError)) {
        return {
          ok: false,
          message:
            "This database is missing the document-date columns. Ask your developer to apply supabase/migrations/0052_document_dates.sql, then scan the document again.",
        };
      }
      return { ok: false, message: "We couldn't save the extracted history. Please try again." };
    }

    // Feed the Overview tab's AI Patient Summary card from this document. The
    // summary rides in the same structured response as the items (no second
    // model call) and overwrites the cached column; stamping it with the current
    // visit count keeps the card's staleness logic consistent.
    const summary = extracted.data.summary?.trim();
    let summaryUpdated = false;
    if (summary) {
      const { data: directory } = await supabase
        .from("patient_directory")
        .select("visit_count")
        .eq("clinic_id", clinicId)
        .eq("id", patientId)
        .maybeSingle();
      const { error: summaryError } = await supabase
        .from("patients")
        .update({
          ai_summary: summary.slice(0, MAX_SUMMARY_CHARS),
          ai_summary_generated_at: new Date().toISOString(),
          ai_summary_visit_count: directory?.visit_count ?? 0,
        })
        .eq("clinic_id", clinicId)
        .eq("id", patientId);
      if (summaryError) {
        console.error("[processDocumentOCRAction] ai_summary update failed", {
          clinicId,
          patientId,
          code: summaryError.code,
          message: summaryError.message,
        });
      } else {
        summaryUpdated = true;
      }
    }

    // Stage the document's medicines as `active_pending` rows the doctor reviews
    // on the Overview / Medications tabs. Extraction succeeded, so a storage
    // failure here must not fail the whole scan — report via `medicationsCount`.
    const medicationRows = extracted.data.medications.map((medication) => ({
      clinic_id: clinicId,
      patient_id: patientId,
      medicine_name: medication.medicine_name,
      strength: medication.strength,
      frequency: medication.frequency,
      duration: medication.duration,
      instructions: medication.instructions,
      report_name: fileName,
      report_date: reportDate,
      status: "active_pending" as const,
      source: "ai_ocr" as const,
      created_by_user_id: user.id,
      created_by_name: AI_OCR_CREATED_BY,
    }));

    let medicationsCount = 0;
    let medicationsSaved = false;
    let medicationsSaveIssue: "missing_table" | "error" | null = null;
    if (medicationRows.length > 0) {
      let medicationsError = (
        await supabase.from("patient_medications").insert(medicationRows)
      ).error;
      if (medicationsError && isMissingDateColumnError(medicationsError)) {
        console.warn(
          "[processDocumentOCRAction] 0052 date column missing — saving medicines without the document date",
          { clinicId, patientId, code: medicationsError.code },
        );
        medicationsError = (
          await supabase
            .from("patient_medications")
            .insert(withoutDateColumns(medicationRows))
        ).error;
      }
      if (medicationsError) {
        medicationsSaveIssue = isMissingTableError(
          medicationsError,
          "patient_medications",
        )
          ? "missing_table"
          : "error";
        console.error("[processDocumentOCRAction] medications insert failed", {
          clinicId,
          patientId,
          count: medicationRows.length,
          code: medicationsError.code,
          message: medicationsError.message,
          details: medicationsError.details,
          hint: medicationsError.hint,
        });
      } else {
        medicationsCount = medicationRows.length;
        medicationsSaved = true;
      }
    }

    // Stage safety alerts (allergies + known conditions) from the scan the same
    // way: `active_pending` rows the doctor approves into the Critical Safety
    // Alerts block on the Overview tab, or dismisses (migration 0051).
    const alertRows = [
      ...extracted.data.allergies.map((text) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        alert_type: "allergy" as const,
        text,
        report_name: fileName,
        report_date: reportDate,
        status: "active_pending" as const,
        source: "ai_ocr" as const,
        created_by_user_id: user.id,
        created_by_name: AI_OCR_CREATED_BY,
      })),
      ...extracted.data.known_cases.map((text) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        alert_type: "known_case" as const,
        text,
        report_name: fileName,
        report_date: reportDate,
        status: "active_pending" as const,
        source: "ai_ocr" as const,
        created_by_user_id: user.id,
        created_by_name: AI_OCR_CREATED_BY,
      })),
    ];

    let alertsCount = 0;
    if (alertRows.length > 0) {
      let alertsError = (
        await supabase.from("patient_alerts").insert(alertRows)
      ).error;
      if (alertsError && isMissingDateColumnError(alertsError)) {
        console.warn(
          "[processDocumentOCRAction] 0052 date column missing — saving safety alerts without the document date",
          { clinicId, patientId, code: alertsError.code },
        );
        alertsError = (
          await supabase
            .from("patient_alerts")
            .insert(withoutDateColumns(alertRows))
        ).error;
      }
      if (alertsError) {
        console.error("[processDocumentOCRAction] alerts insert failed", {
          clinicId,
          patientId,
          count: alertRows.length,
          code: alertsError.code,
          message: alertsError.message,
          details: alertsError.details,
          hint: alertsError.hint,
        });
      } else {
        alertsCount = alertRows.length;
      }
    }

    // Keep the original scan in the patient's Documents tab. Extraction already
    // succeeded, so a failure here must NOT fail the whole scan (the doctor
    // would retry and duplicate history rows) — report it via `documentSaved`.
    let documentSaved = false;
    const storedObjectKey = `${clinicId}/${patientId}/${crypto.randomUUID()}-${fileName}`;
    const { error: persistUploadError } = await supabase.storage
      .from(PATIENT_DOCUMENTS_BUCKET)
      .upload(storedObjectKey, file, {
        contentType: sniffed.mimeType,
        upsert: false,
      });
    if (persistUploadError) {
      console.error("[processDocumentOCRAction] document persist upload failed", { clinicId, patientId, message: persistUploadError.message });
    } else {
      const documentRow = {
        clinic_id: clinicId,
        patient_id: patientId,
        document_name: fileName,
        file_path: storedObjectKey,
        mime_type: sniffed.mimeType,
        size_bytes: file.size,
        document_date: reportDate,
        uploaded_by_user_id: user.id,
      };
      let persistInsertError = (
        await supabase.from("patient_documents").insert(documentRow)
      ).error;
      if (persistInsertError && isMissingDateColumnError(persistInsertError)) {
        // Keep the scan itself even on a database without 0052 — losing the
        // audit copy of the document would be worse than losing its date.
        console.warn(
          "[processDocumentOCRAction] 0052 date column missing — saving the document without its date",
          { clinicId, patientId, code: persistInsertError.code },
        );
        persistInsertError = (
          await supabase
            .from("patient_documents")
            .insert(withoutDateColumns([documentRow])[0])
        ).error;
      }
      if (persistInsertError) {
        const { error: cleanupError } = await supabase.storage
          .from(PATIENT_DOCUMENTS_BUCKET)
          .remove([storedObjectKey]);
        if (cleanupError) {
          console.error("[processDocumentOCRAction] orphaned persisted scan object", { storedObjectKey, message: cleanupError.message });
        }
        console.error("[processDocumentOCRAction] document persist insert failed", {
          clinicId,
          patientId,
          code: persistInsertError.code,
          message: persistInsertError.message,
          details: persistInsertError.details,
          hint: persistInsertError.hint,
        });
      } else {
        documentSaved = true;
      }
    }

    await cleanup();
    revalidatePath("/app/patients");
    revalidatePath("/app/appointments");
    return {
      ok: true,
      data: {
        count: rows.length,
        fileName,
        documentDate: reportDate,
        documentSaved,
        summaryUpdated,
        medicationsCount,
        medicationsSaved,
        medicationsSaveIssue,
        alertsCount,
      },
    };
  } catch (error) {
    console.error("[processDocumentOCRAction] AI extraction failed", {
      clinicId,
      patientId,
      fileName,
      message: error instanceof Error ? error.message : String(error),
    });
    await cleanup();
    return {
      ok: false,
      message:
        "The AI reader couldn't process this document right now. Please try again in a moment.",
    };
  }
}