"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MessageEditor } from "@/components/engagement/message-editor";
import { SAFETY_ALERT_VARIABLES } from "@/lib/engagement-safety";

type SafetyAlertCardProps = {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  templateText: string;
  onSaveTemplate: (text: string) => Promise<boolean>;
  disabled?: boolean;
};

/**
 * Phase 5 — the staff-facing safety alert template. Same shape as the other
 * engagement template cards, but its recipient is the care team: when a scored
 * assessment trips a safety rule, this copy is sent over WhatsApp to staff with
 * a known number (and the alert always also goes by email).
 */
export function SafetyAlertCard({
  enabled,
  onToggle,
  templateText,
  onSaveTemplate,
  disabled = false,
}: SafetyAlertCardProps) {
  const [draft, setDraft] = useState(templateText);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const ok = await onSaveTemplate(draft);
    setSaving(false);
    return ok;
  }

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-status-destructive/10 text-status-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Clinical Safety Alerts
            </h3>
            <p className="mt-0.5 text-xs text-text-secondary">
              WhatsApp the care team when an assessment flags risk
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Badge variant={enabled ? "success" : "default"}>
            {enabled ? "Active" : "Inactive"}
          </Badge>
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
        </div>
      </div>

      <div className="border-t border-hairline p-4">
        <p className="mb-3 rounded-control bg-skeleton/60 px-3 py-2 text-xs text-text-muted">
          Sent to staff with a phone number on file when a scored assessment trips
          a safety trigger. Email is always sent regardless of this switch.
        </p>
        <MessageEditor
          value={draft}
          baseValue={templateText}
          onValueChange={setDraft}
          onSave={handleSave}
          saving={saving}
          variables={SAFETY_ALERT_VARIABLES}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
