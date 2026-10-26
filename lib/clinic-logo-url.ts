/**
 * Client-safe clinic logo URL helpers.
 *
 * Kept separate from `lib/clinic-logo.ts` so client components (the white-label
 * patient portal headers and the print report) can build logo URLs without
 * dragging the server-only file reader into the client bundle.
 */

/** Public bucket created in migration 0054. */
export const LOGO_BUCKET = "clinic-logos";

/**
 * Turn a stored object path into a browser-usable URL.
 *
 * `clinics.logo_url` stores the *object path* (`{clinic_id}/{uuid}.png`), not a
 * full URL, so moving the Supabase project or switching domains does not
 * invalidate every clinic's row — the path is re-resolved against whatever
 * `NEXT_PUBLIC_SUPABASE_URL` currently points at.
 *
 * Returns null for a clinic with no logo, or when the URL env var is missing,
 * which lets callers treat "no image" and "cannot build the URL" identically
 * instead of rendering a broken `src`.
 */
export function clinicLogoPublicUrl(
  objectPath: string | null | undefined,
): string | null {
  if (!objectPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/${objectPath}`;
}
