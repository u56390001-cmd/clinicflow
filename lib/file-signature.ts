/**
 * Content-based file identification for every upload path in the CMS.
 *
 * Sniffing the bytes rather than trusting `File.type` is the point: the browser
 * derives `type` from the file extension, and both it and the `accept` attribute
 * are client-supplied. A renamed `.exe` would otherwise be stored with a
 * `mime_type` of `application/pdf` and handed back to a clinician's browser under
 * that content type.
 *
 * The four types here are exactly the ones the `patient_documents` and
 * `telehealth_messages` CHECK constraints accept, so a file that passes this
 * sniff is always storable.
 */

export type FileSignature = {
  mimeType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  extension: string;
};

const MAGIC_BYTES: ReadonlyArray<{
  mimeType: FileSignature["mimeType"];
  extension: string;
  match: (bytes: Uint8Array) => boolean;
}> = [
  {
    mimeType: "application/pdf",
    extension: "pdf",
    // "%PDF-"
    match: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  },
  {
    mimeType: "image/png",
    extension: "png",
    match: (b) =>
      startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
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

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

/** The `accept` attribute the upload pickers use, derived from the same list. */
export const UPLOAD_ACCEPT_ATTRIBUTE =
  "application/pdf,image/png,image/jpeg,image/webp";

/** Human-readable allow-list for error copy. */
export const UPLOAD_KIND_LABEL = "PDF, PNG, JPEG or WebP";

/**
 * Identify a file by its contents. Returns `null` when the bytes match none of
 * the allowed types, which is the reject path — we never fall back to the
 * client-declared type.
 *
 * 16 bytes is enough for every signature above (WebP needs 12).
 */
export function sniffFileSignature(header: Uint8Array): FileSignature | null {
  return MAGIC_BYTES.find((candidate) => candidate.match(header)) ?? null;
}

/** Reads just the bytes a signature check needs. */
export async function readSignatureHeader(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

/**
 * Make a user-supplied filename safe to use as the tail of a storage object
 * key: no path traversal, no separators, no control characters, bounded length.
 * The `{uuid}-` prefix added by the caller guarantees uniqueness, so collisions
 * after sanitising are not a concern.
 */
export function sanitiseFileName(
  name: string,
  fallbackExtension: string,
): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    // Anything outside the safe set — spaces, control characters, non-ASCII —
    // collapses to a dash. Leading dots and dashes are then stripped so the key
    // cannot begin with a hidden-file marker.
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);

  if (!base) return `document.${fallbackExtension}`;
  return base.includes(".") ? base : `${base}.${fallbackExtension}`;
}

/** 10485760 bytes — matches the DB CHECKs and both storage buckets. */
export const MAX_UPLOAD_BYTES = 10_485_760;
