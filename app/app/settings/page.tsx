import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClinicEmptyState } from "@/components/app/clinic-empty-state";
import { ClinicLogoField } from "@/components/settings/clinic-logo-field";
import { ClinicSettingsForm } from "@/components/settings/clinic-settings-form";
import { GoogleReviewQrCard } from "@/components/settings/google-review-qr-card";
import { TimezoneWorkingHoursCard } from "@/components/settings/timezone-working-hours-card";
import { Button } from "@/components/ui/button";
import { getCurrentClinic, canWriteClinic } from "@/lib/clinic-access";
import { clinicLogoPublicUrl, readClinicLogoPath } from "@/lib/clinic-logo";
import { APP_ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clinic settings" };

/** Postgres `time` arrives as `HH:MM:SS`; the form works in `HH:MM`. */
function toHhMm(value: string): string {
  return value.slice(0, 5);
}

/**
 * Reduce the clinic's `availability_rules` rows to what the shared-range card
 * can represent: which weekdays are open, and the hours they share.
 *
 * The card edits ONE range for every selected day, so when the stored rows
 * disagree we report that to the user rather than silently picking Monday's
 * hours and presenting them as the clinic's. The first enabled row supplies the
 * displayed range; `hadVariedHours` is the signal that saving will flatten it.
 */
function summarizeRules(
  rows: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    enabled: boolean;
  }[],
) {
  const open = rows.filter((row) => row.enabled);
  const fallback = rows[0];
  const first = open[0] ?? fallback;

  const startTime = first ? toHhMm(first.start_time) : "09:00";
  const endTime = first ? toHhMm(first.end_time) : "18:00";
  const hadVariedHours = open.some(
    (row) =>
      toHhMm(row.start_time) !== startTime || toHhMm(row.end_time) !== endTime,
  );

  return {
    initialDays: open.map((row) => row.day_of_week).sort((a, b) => a - b),
    initialStartTime: startTime,
    initialEndTime: endTime,
    hadVariedHours,
  };
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const access = await getCurrentClinic(supabase);

  if (!access) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-secondary">
            Clinic settings
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage your clinic&apos;s profile.
          </p>
        </div>
        <ClinicEmptyState />
      </div>
    );
  }

  // Staff members can't access clinic settings (Phase 9 permission audit).
  if (!canWriteClinic(access.role)) {
    redirect(APP_ROUTES.app.dashboard);
  }

  // Clinic-wide defaults only: `doctor_id is null` is the clinic row, a non-null
  // value is that doctor's personal hours (migration 0017).
  const { data: ruleRows } = await supabase
    .from("availability_rules")
    .select("day_of_week,start_time,end_time,enabled")
    .eq("clinic_id", access.clinic.id)
    .is("doctor_id", null);

  const hours = summarizeRules(ruleRows ?? []);
  const canWrite = canWriteClinic(access.role);
  const logoPath = await readClinicLogoPath(access.clinic.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-secondary">
          Clinic settings
        </h1>
      </div>
      <p className="-mt-4 text-sm text-text-secondary">
        {access.clinic.name} · /{access.clinic.slug}
      </p>

      <ClinicLogoField
        logoUrl={clinicLogoPublicUrl(logoPath)}
        clinicName={access.clinic.name}
        canWrite={canWrite}
      />

      <ClinicSettingsForm clinic={access.clinic} canWrite={canWrite} />

      <TimezoneWorkingHoursCard
        timezone={access.clinic.timezone}
        initialDays={hours.initialDays}
        initialStartTime={hours.initialStartTime}
        initialEndTime={hours.initialEndTime}
        hadVariedHours={hours.hadVariedHours}
        canWrite={canWrite}
      />

      <GoogleReviewQrCard
        savedUrl={access.clinic.google_review_url}
        clinicSlug={access.clinic.slug}
        canWrite={canWrite}
      />
    </div>
  );
}
