"use client";

import { useState, useTransition } from "react";
import { Check, Repeat } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { saveGrowthSettings } from "@/lib/actions/growth-agent";
import { GROWTH_FREQUENCY_LABELS } from "@/lib/constants";
import type { GrowthAgentSettings, GrowthPostingFrequency } from "@/types/database";

/**
 * 0=Monday, matching `availability_rules.day_of_week` and the 0..6 range that
 * `growthSettingsSchema` accepts. Sunday is 6, not 0 — a Sunday-first list here
 * would silently save every clinic's preferred day one off.
 */
const DAYS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
] as const;

/**
 * Auto-publishing preferences.
 *
 * The switch is honest about its own dependency: turning automation on while no
 * profile is linked does nothing, and this says so rather than letting someone
 * believe a weekly post is being written for them. `require_approval` stays on by
 * default because an unreviewed AI draft going live on a clinic's public
 * business listing is not a reasonable default for a healthcare business.
 */
export function AutomationSettings({
  settings,
  isConnected,
  canEdit,
}: {
  settings: GrowthAgentSettings;
  isConnected: boolean;
  canEdit: boolean;
}) {
  const [autoPost, setAutoPost] = useState(settings.auto_post_enabled);
  const [requireApproval, setRequireApproval] = useState(settings.require_approval);
  const [frequency, setFrequency] = useState<string>(settings.posting_frequency);
  const [day, setDay] = useState<string>(String(settings.preferred_day ?? 3));
  const [time, setTime] = useState<string>((settings.preferred_time ?? "10:00:00").slice(0, 5));
  const [isPending, startTransition] = useTransition();

  const dirty =
    autoPost !== settings.auto_post_enabled ||
    requireApproval !== settings.require_approval ||
    frequency !== settings.posting_frequency ||
    day !== String(settings.preferred_day ?? 3) ||
    time !== (settings.preferred_time ?? "10:00:00").slice(0, 5);

  const save = () => {
    const formData = new FormData();
    formData.set("autoPostEnabled", String(autoPost));
    formData.set("postingFrequency", frequency);
    formData.set("preferredDay", day);
    formData.set("preferredTime", time);
    formData.set("requireApproval", String(requireApproval));

    startTransition(async () => {
      const result = await saveGrowthSettings(null, formData);
      if (result.ok) {
        toast.success("Automation settings saved.");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <section
      aria-label="Posting automation"
      className="rounded-card border border-text-muted/30 bg-surface"
    >
      <div className="flex items-center gap-2.5 border-b border-text-muted/20 px-5 py-4">
        <Repeat className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">Posting rhythm</h2>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="growth-auto" className="text-sm">
              Post automatically
            </Label>
            <p className="mt-0.5 text-sm text-text-secondary">
              Draft on a schedule instead of writing each one by hand.
            </p>
          </div>
          <Switch
            id="growth-auto"
            checked={autoPost}
            onCheckedChange={setAutoPost}
            disabled={!canEdit}
            aria-describedby="growth-auto-help"
          />
        </div>

        <div
          className={autoPost ? "space-y-4" : "pointer-events-none space-y-4 opacity-45"}
          aria-hidden={!autoPost}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="growth-frequency" className="text-sm">
                How often
              </Label>
              <NativeSelect
                id="growth-frequency"
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as GrowthPostingFrequency)
                }
                disabled={!canEdit || !autoPost}
                className="mt-1.5"
              >
                {GROWTH_FREQUENCY_LABELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="growth-day" className="text-sm">
                Day
              </Label>
              <NativeSelect
                id="growth-day"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                disabled={!canEdit || !autoPost}
                className="mt-1.5"
              >
                {DAYS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="growth-time" className="text-sm">
                Time
              </Label>
              <input
                id="growth-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                disabled={!canEdit || !autoPost}
                className="mt-1.5 h-11 w-full rounded-control border border-text-muted/40 bg-surface px-3 text-sm text-text-primary outline-none transition-colors hover:border-text-muted/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-text-muted/20 pt-4">
            <div className="min-w-0">
              <Label htmlFor="growth-approval" className="text-sm">
                Ask me before anything goes out
              </Label>
              <p id="growth-auto-help" className="mt-0.5 text-sm text-text-secondary">
                Keep drafts in the queue for review instead of publishing on the
                schedule. Recommended for a public healthcare listing.
              </p>
            </div>
            <Switch
              id="growth-approval"
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
              disabled={!canEdit}
            />
          </div>
        </div>

        {autoPost && !isConnected ? (
          <p className="rounded-control border border-status-warning/30 bg-status-warning/10 px-3.5 py-2.5 text-sm text-text-secondary">
            Automation is on, but no Google profile is linked — nothing will be
            published until there is one. Drafts will still be written for you.
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex items-center gap-3 border-t border-text-muted/20 pt-4">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || isPending}
              variant={dirty ? "primary" : "outline"}
            >
              {isPending ? <Spinner /> : dirty ? <Check aria-hidden="true" /> : null}
              {isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
            {dirty ? <p className="text-xs text-text-secondary">Unsaved changes</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
