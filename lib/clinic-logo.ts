/**
 * Clinic logo helpers.
 *
 * Kept out of `lib/actions/settings.ts` deliberately: that file carries the
 * `"use server"` directive, which permits only async exports. A plain function
 * exported from it fails the build.
 */
import { cache } from "react";

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

/**
 * Read a clinic's stored logo path, tolerating a database that has not run
 * migration 0054 yet.
 *
 * Selecting `logo_url` on a database without that column fails PostgREST with
 * `42703 column clinics.logo_url does not exist`. Because `getCurrentClinic`
 * runs on every authenticated page, folding this column into its main select
 * would take down the dashboard and appointments too — not just the settings
 * screen. So the column is read here, in isolation, and any failure degrades to
 * "no logo", which is exactly what a clinic without a logo should render.
 *
 * Once 0054 is applied this call succeeds and the logo appears with no code
 * change.
 *
 * Memoized with React `cache()` for the same reason `getCurrentClinic` is: the
 * app header and the settings page both need this in a single request, and it
 * should cost one query rather than two.
 */
export const readClinicLogoPath = cache(
  async (clinicId: string): Promise<string | null> => {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("clinics")
      .select("logo_url")
      .eq("id", clinicId)
      .maybeSingle();

    if (error) {
      // Expected until 0054 is applied: 42703 (undefined column) or PGRST204
      // (column not in the schema cache). Anything else is a genuine problem,
      // but still not worth failing a page over a missing logo.
      console.warn("[readClinicLogoPath] could not read clinics.logo_url", {
        code: error.code,
        message: error.message,
      });
      return null;
    }

    const row = data as { logo_url?: string | null } | null;
    return row?.logo_url ?? null;
  },
);
