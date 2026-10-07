"use client";

import { useState } from "react";
import { Check, Globe2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { COMMON_TIMEZONES, formatTimezoneOption } from "@/lib/constants";

type GeneralSettingsCardProps = {
  timezone: string;
  mapsLink: string;
  onSave: (timezone: string, mapsLink: string) => Promise<boolean>;
  disabled?: boolean;
};

/**
 * "General Settings": the timezone that reminder/confirmation dates render in,
 * and the Google Maps link that fills the {clinic_location} variable.
 */
export function GeneralSettingsCard({
  timezone,
  mapsLink,
  onSave,
  disabled = false,
}: GeneralSettingsCardProps) {
  const [zone, setZone] = useState(timezone);
  const [link, setLink] = useState(mapsLink);
  const [saving, setSaving] = useState(false);

  const dirty = zone !== timezone || link !== mapsLink;

  async function handleSave() {
    setSaving(true);
    await onSave(zone, link.trim());
    setSaving(false);
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
          <Globe2 className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">General Settings</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Timezone and location link used across all messages
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <label htmlFor="engagement-timezone" className="text-xs font-medium text-text-primary">
            Time Zone
          </label>
          <NativeSelect
            id="engagement-timezone"
            value={zone}
            disabled={disabled}
            onChange={(event) => setZone(event.target.value)}
            className="mt-1.5 text-sm"
          >
            {COMMON_TIMEZONES.map((option) => (
              <option key={option} value={option}>
                {formatTimezoneOption(option)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div>
          <label
            htmlFor="engagement-maps-link"
            className="flex items-center gap-1.5 text-xs font-medium text-text-primary"
          >
            <MapPin className="size-3.5 text-primary" aria-hidden="true" />
            Google Maps Link
          </label>
          <Input
            id="engagement-maps-link"
            value={link}
            disabled={disabled}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://maps.google.com/?q=Clinic+Address"
            className="mt-1.5 text-sm"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Fills the {"{clinic_location}"} variable in your messages.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={disabled || saving || !dirty}
            onClick={handleSave}
            className="min-w-[96px]"
          >
            <Check className="size-4" aria-hidden="true" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}