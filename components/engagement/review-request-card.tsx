"use client";

import { useState } from "react";
import { ExternalLink, Send, Star, WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MessageEditor } from "@/components/engagement/message-editor";

const REVIEW_DELAYS = [
  { value: "2", label: "2 hours after visit" },
  { value: "24", label: "24 hours after visit" },
  { value: "48", label: "48 hours after visit" },
] as const;

type ReviewRequestCardProps = {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  delayHours: number;
  onSaveDelay: (hours: number) => Promise<boolean>;
  templateText: string;
  onSaveTemplate: (text: string) => Promise<boolean>;
  reviewUrl: string;
  /** Live-sync the phone bubble as the clinic types. */
  onDraftChange: (text: string) => void;
  disabled?: boolean;
};

/**
 * The centerpiece automation: Google review requests. Textarea and delay get
 * saved through the same button; the switch and the delay select persist on
 * their own, and every keystroke streams into the live WhatsApp preview.
 */
export function ReviewRequestCard({
  enabled,
  onToggle,
  delayHours,
  onSaveDelay,
  templateText,
  onSaveTemplate,
  reviewUrl,
  onDraftChange,
  disabled = false,
}: ReviewRequestCardProps) {
  const [draft, setDraft] = useState(templateText);
  const [saving, setSaving] = useState(false);

  function handleDraftChange(value: string) {
    setDraft(value);
    onDraftChange(value);
  }

  async function handleSave() {
    setSaving(true);
    const ok = await onSaveTemplate(draft);
    setSaving(false);
    void ok;
  }

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
      {/* Head */}
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Star className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Google Review Automation</h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              Automatically request Google reviews after a visit
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Badge variant={enabled ? "success" : "default"}>{enabled ? "Active" : "Inactive"}</Badge>
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
        </div>
      </div>

      {/* Smart filter + review link */}
      <div className="border-t border-hairline px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-control bg-primary-tint px-3 py-2">
            <WandSparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="text-xs font-medium text-primary">Smart Filter</span>
            <NativeSelect
              defaultValue="completed"
              disabled={disabled}
              aria-label="Review request audience filter"
              className="h-8 w-auto cursor-not-allowed text-xs"
            >
              <option value="completed">Only completed appointments</option>
            </NativeSelect>
          </div>
          <a
            href={reviewUrl || undefined}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              reviewUrl
                ? "text-primary hover:underline"
                : "cursor-default no-underline text-text-muted"
            }`}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {reviewUrl ? reviewUrl : "Add your Google review link in Growth Agent"}
          </a>
        </div>
      </div>

      {/* Editor */}
      <div className="border-t border-hairline p-4">
        <MessageEditor
          value={draft}
          baseValue={templateText}
          onValueChange={handleDraftChange}
          onSave={handleSave}
          saving={saving}
          variables={["patient_name", "doctor_name", "clinic_name", "clinic_location"]}
          disabled={disabled}
        />
      </div>

      {/* Delay + save */}
      <div className="flex flex-col gap-3 border-t border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="review-delay" className="text-xs font-medium text-text-primary">
            Request after
          </label>
          <NativeSelect
            id="review-delay"
            value={String(delayHours)}
            disabled={disabled}
            onChange={(event) => void onSaveDelay(Number(event.target.value))}
            className="h-9 w-48 text-sm"
          >
            {REVIEW_DELAYS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={disabled || saving || draft === templateText}
          onClick={handleSave}
          className="min-w-[96px]"
        >
          <Send className="size-4" aria-hidden="true" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}