import { PATIENT_DOCUMENT_MAX_BYTES, PATIENT_DOCUMENT_MIME_TYPES } from "@/types/database";

/**
 * Patient-document file validation, shared by the authenticated uploader and
 * the public WhatsApp upload link.
 *
 * Kept out of the `"use server"` action module on purpose: a `"use server"`
 * file may only export async functions, so pure helpers cannot live there.
 */

export { PATIENT_DOCUMENT_MAX_BYTES };

type MagicSignature = {
  mimeType: (typeof PATIENT_DOCUMENT_MIME_TYPES)[number];
  extension: string;
  match: (bytes: Uint8Array) => boolean;
};

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

/**
 * The four types the DB CHECK accepts, each with the leading bytes a real file
 * of that type must start with. Sniffing bytes rather than trusting `File.type`
 * is the point: the browser derives `type` from the extension, and both it and
 * the `accept` attribute are client-supplied.
 */
export const PATIENT_DOCUMENT_SIGNATURES: readonly MagicSignature[] = [
  {
    mimeType: "application/pdf",
    extension: "pdf",
    match: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), // "%PDF-"
  },
  {
    mimeType: "image/png",
    extension: "png",
    match: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    match: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: "image/webp",
    extension: "webp",
    // "RIFF" .... "WEBP" — the four size bytes at offset 4 are skipped.
    match: (b) =>
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
];

/** Identify a file by its contents; `null` means reject (never trust the client type). */
export function sniffPatientDocumentMime(
  header: Uint8Array,
): MagicSignature | null {
  return PATIENT_DOCUMENT_SIGNATURES.find((candidate) => candidate.match(header)) ?? null;
}

/** Make a filename safe as the tail of a storage key: no traversal, bounded length. */
export function sanitiseDocumentFileName(
  name: string,
  fallbackExtension: string,
): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);

  if (!base) return `document.${fallbackExtension}`;
  return base.includes(".") ? base : `${base}.${fallbackExtension}`;
}
