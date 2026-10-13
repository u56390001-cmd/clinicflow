import { redirect } from "next/navigation";

import { AssessmentLibraryManager } from "@/components/settings/assessment-library-manager";
import { canWriteClinic, getCurrentClinic } from "@/lib/clinic-access";
import { createClient } from "@/lib/supabase/server";
import type {
  AssessmentTemplate,
  ClinicAssessmentCategory,
} from "@/types/database";

/**
 * Settings → Clinical Settings → Assessment Library (migration 0085).
 *
 * The page owns the read: it loads the clinic's categories, templates and the
 * per-template usage figures (how many recorded psych assessments reference
 * each template), then hands everything to the client manager. Writes go
 * through the admin-gated server actions in lib/actions/assessment-library.ts.
 */
export default async function AssessmentLibrarySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);
  if (!access) redirect("/app");

  const { category } = await searchParams;

  const [{ data: categories }, { data: templates }, { data: usageRows }] =
    await Promise.all([
      supabase
        .from("clinic_assessment_categories")
        .select("*")
        .eq("clinic_id", access.clinic.id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("assessment_templates")
        .select("*")
        .eq("clinic_id", access.clinic.id)
        .order("name", { ascending: true }),
      supabase
        .from("psych_assessments")
        .select("template_id")
        .eq("clinic_id", access.clinic.id)
        .not("template_id", "is", null),
    ]);

  const usage: Record<string, number> = {};
  for (const row of usageRows ?? []) {
    if (row.template_id) usage[row.template_id] = (usage[row.template_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <AssessmentLibraryManager
        categories={(categories ?? []) as ClinicAssessmentCategory[]}
        templates={(templates ?? []) as AssessmentTemplate[]}
        usage={usage}
        canWrite={canWriteClinic(access.role)}
        initialCategory={
          category && categories?.some((c) => c.id === category) ? category : null
        }
      />
    </div>
  );
}