"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Globe } from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { createClinicAction } from "@/lib/actions/clinic";
import { COMMON_TIMEZONES, slugify } from "@/lib/constants";
import type { ActionResult } from "@/types";

const initialState: ActionResult = { ok: true, data: undefined };

export function ClinicCreateForm() {
  const [state, formAction] = useActionState(createClinicAction, initialState);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const previewSlug = slug.trim().length > 0 ? slug.trim() : slugify(name);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

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
            placeholder={slugify(name) || "sunrise-family-clinic"}
          />
        </div>
        <p className="text-xs text-text-muted">
          {previewSlug ? (
            <>
              Your clinic&apos;s address will be <span className="font-medium text-text-secondary">/{previewSlug}</span>
            </>
          ) : (
            "Leave blank to auto-generate from the clinic name."
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="doctor-name">Doctor name</Label>
        <Input
          id="doctor-name"
          name="doctorName"
          placeholder="Dr. Sarah Chen"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <NativeSelect id="timezone" name="timezone" defaultValue="UTC">
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            autoComplete="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Contact email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="front@clinic.com"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          placeholder="123 Main Street, Springfield"
          autoComplete="street-address"
        />
      </div>

      <SubmitButton className="w-full" loadingText="Setting up your clinic…">
        Create clinic
      </SubmitButton>
    </form>
  );
}
