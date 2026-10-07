"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MessageEditor } from "@/components/engagement/message-editor";

export type SelectOption = { value: string; label: string };

type TemplateConfigCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  selectLabel: string;
  selectOptions: SelectOption[];
  selectValue: string;
  onSelectChange: (value: string) => void;
  templateText: string;
  onSaveTemplate: (text: string) => Promise<boolean>;
  variables?: readonly string[];
  disabled?: boolean;
  note?: string;
};

/**
 * The recurring "message + timing" card (pre-appointment reminder, no-show
 * recovery, auto follow-up): a persisted toggle up top, the window/delay
 * select, and the shared message editor underneath.
 */
export function TemplateConfigCard({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  selectLabel,
  selectOptions,
  selectValue,
  onSelectChange,
  templateText,
  onSaveTemplate,
  variables,
  disabled = false,
  note,
}: TemplateConfigCardProps) {
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
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Badge variant={enabled ? "success" : "default"}>{enabled ? "Active" : "Inactive"}</Badge>
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
        </div>
      </div>

      <div className="border-t border-hairline p-4">
        <label className="text-xs font-medium text-text-primary">{selectLabel}</label>
        <NativeSelect
          value={selectValue}
          disabled={disabled}
          onChange={(event) => onSelectChange(event.target.value)}
          className="mt-1.5 h-9 text-sm"
        >
          {selectOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>

        <div className="mt-4">
          <MessageEditor
            value={draft}
            baseValue={templateText}
            onValueChange={setDraft}
            onSave={handleSave}
            saving={saving}
            variables={variables}
            disabled={disabled}
          />
        </div>

        {note && (
          <p className="mt-3 rounded-control bg-skeleton/60 px-3 py-2 text-xs text-text-muted">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}