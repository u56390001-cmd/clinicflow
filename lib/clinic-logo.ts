/**
 * Clinic logo helpers.
 *
 * Kept out of `lib/actions/settings.ts` deliberately: that file carries the
 * `"use server"` directive, which permits only async exports. A plain function
 * exported from it fails the build.
 */
import { cache } from "react";

import { LOGO_BUCKET, clinicLogoPublicUrl } from "@/lib/clinic-logo-url";

export { LOGO_BUCKET, clinicLogoPublicUrl };

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
