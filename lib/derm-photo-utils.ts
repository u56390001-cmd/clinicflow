import type { DermImageKind, DermPhoto } from "@/types/database";
import { patientDocumentHref } from "@/lib/patient-documents-queries";

/** Timeline position of a capture relative to the treatment course. */
export const PHOTO_TYPE_LABEL: Record<DermPhoto["photo_type"], string> = {
  baseline: "Baseline",
  follow_up: "Follow-up",
  post_treatment: "Post-treatment",
};

/** How the capture was taken — migration 0121 (`derm_photos.image_kind`). */
export const IMAGE_KIND_LABEL: Record<DermImageKind, string> = {
  clinical: "Clinical",
  dermoscopy: "Dermoscopy",
  histology: "Histology",
};

/**
 * Colour-coded modality badges for the gallery grid: Clinical = blue,
 * Dermoscopy = purple, Histology = amber.
 */
export const IMAGE_KIND_BADGE_CLASS: Record<DermImageKind, string> = {
  clinical: "bg-sky-100 text-sky-700",
  dermoscopy: "bg-violet-100 text-violet-700",
  histology: "bg-amber-100 text-amber-700",
};

/** Accessible image description for a tagged skin photo. */
export function photoAlt(photo: DermPhoto): string {
  return `${IMAGE_KIND_LABEL[photo.image_kind]} · ${photo.body_region} — ${
    PHOTO_TYPE_LABEL[photo.photo_type]
  } skin photo`;
}

/**
 * Thumbnail-sized document href. The `/api/patients/documents/[id]` route
 * accepts `?w=` to request a server-side resized render of the private
 * object, so a 48px gallery tile downloads a 480px image instead of the full
 * 12 MP dermatoscope capture. Full resolution (no width) for the lightbox.
 */
export function photoThumbHref(
  documentId: string,
  width: number,
): string {
  return `${patientDocumentHref(documentId)}?w=${Math.min(
    Math.max(Math.round(width), 32),
    2000,
  )}`;
}
