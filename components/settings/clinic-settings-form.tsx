"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Globe } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { updateClinicAction } from "@/lib/actions/settings";
import { COMMON_TIMEZONES, slugify } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { CurrentClinicAccess } from "@/lib/clinic-access";

const initialState: ActionResult | null = null;

export function ClinicSettingsForm({
  clinic,
  canWrite,
}: {
  clinic: CurrentClinicAccess["clinic"];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateClinicAction,
    initialState,
  );
  const [name, setName] = useState(clinic.name);
  const [slug, setSlug] = useState(clinic.slug);

  const previewSlug = slug.trim().length > 0 ? slug.trim() : slugify(name);

  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
    }
  }, [state, router]);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Clinic profile</CardTitle>
        <CardDescription>
          {canWrite
            ? "Update your clinic's public details."
            : "Read-only for staff. Ask an owner or admin to make changes."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {submitted && !state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {submitted && state.ok && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>Clinic settings saved.</AlertDescription>
          </Alert>
        )}

        <form
          key={clinic.id}
          action={formAction}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Clinic name</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunrise Family Clinic"
              autoComplete="organization"
              required
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Clinic URL</Label>
            <div className="relative">
              <Globe
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                id="slug"
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="pl-9"
                placeholder={clinic.slug}
                disabled={!canWrite}
              />
            </div>
            <p className="text-xs text-text-muted">
              Public page will be{" "}
              <span className="font-medium text-text-secondary">
                /{previewSlug}
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doctor-name">Doctor name</Label>
            <Input
              id="doctor-name"
              name="doctorName"
              defaultValue={clinic.doctor_name ?? ""}
              placeholder="Dr. Sarah Chen"
              autoComplete="name"
              disabled={!canWrite}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <NativeSelect
              id="timezone"
              name="timezone"
              defaultValue={clinic.timezone}
              disabled={!canWrite}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-text-muted">
              Availability times are stored as wall clock in this timezone.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={clinic.phone ?? ""}
                placeholder="+1 (555) 123-4567"
                autoComplete="tel"
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={clinic.email ?? ""}
                placeholder="front@clinic.com"
                autoComplete="email"
                disabled={!canWrite}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue={clinic.address ?? ""}
              placeholder="123 Main Street, Springfield"
              autoComplete="street-address"
              disabled={!canWrite}
            />
          </div>

          {canWrite && (
            <SubmitButton
              className={cn("w-full sm:w-auto")}
              loadingText="Saving…"
            >
              Save changes
            </SubmitButton>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
