"use client";

import { Plus, Smile, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** One editable question row in the Details tab (Phase 22). */
export type PreConsultationQuestionDraft = {
  id: string;
  text: string;
};

/** One timing's question set: an on/off toggle + its own rows. */
export type PreConsultationQuestionSet = {
  enabled: boolean;
  rows: PreConsultationQuestionDraft[];
};

export type PreConsultationEditorValue = {
  duringBooking: PreConsultationQuestionSet;
  afterBooking: PreConsultationQuestionSet;
};

const MAX_QUESTIONS = 3;

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Shared Pre-consultation Questions editor used by both the Doctor and the
 * Service form. Phase 22 redesign: two independent timing sets — "During
 * Booking" (the AI receptionist asks in the booking conversation) and "After
 * Booking" (a WhatsApp follow-up) — each with its own on/off toggle and its
 * own question list. Up to 3 questions in total across both sets. Rows carry
 * a decorative smiley icon and are persisted in display order through a
 * hidden JSON field owned by the parent form.
 */
export function PreConsultationEditor({
  value,
  onChange,
}: {
  value: PreConsultationEditorValue;
  onChange: (next: PreConsultationEditorValue) => void;
}) {
  const totalRows = value.duringBooking.rows.length + value.afterBooking.rows.length;

  function setEnabled(card: keyof PreConsultationEditorValue, enabled: boolean) {
    onChange({ ...value, [card]: { ...value[card], enabled } });
  }

  function updateRow(
    card: keyof PreConsultationEditorValue,
    id: string,
    text: string,
  ) {
    const set = value[card];
    onChange({
      ...value,
      [card]: {
        ...set,
        rows: set.rows.map((row) => (row.id === id ? { ...row, text } : row)),
      },
    });
  }

  function removeRow(card: keyof PreConsultationEditorValue, id: string) {
    const set = value[card];
    onChange({
      ...value,
      [card]: { ...set, rows: set.rows.filter((row) => row.id !== id) },
    });
  }

  function addRow(card: keyof PreConsultationEditorValue) {
    if (totalRows >= MAX_QUESTIONS) return;
    const set = value[card];
    onChange({
      ...value,
      [card]: { ...set, rows: [...set.rows, { id: uid(), text: "" }] },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Pre-consultation questions
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Ask patients up to 3 questions before their visit, so their answers
          are ready when they walk in.
        </p>
      </div>

      <QuestionCard
        title="During Booking"
        badge="Before Confirmation"
        helper="The AI Assistant asks these questions via WhatsApp during the booking conversation, before confirming the appointment."
        oneCaption="During booking"
        set={value.duringBooking}
        totalRows={totalRows}
        onEnabledChange={(enabled) => setEnabled("duringBooking", enabled)}
        onUpdate={(id, text) => updateRow("duringBooking", id, text)}
        onRemove={(id) => removeRow("duringBooking", id)}
        onAdd={() => addRow("duringBooking")}
      />

      <QuestionCard
        title="After Booking"
        badge="Via WhatsApp Instantly"
        helper="The AI Assistant asks these questions via WhatsApp immediately after the appointment is confirmed."
        oneCaption="After booking"
        set={value.afterBooking}
        totalRows={totalRows}
        onEnabledChange={(enabled) => setEnabled("afterBooking", enabled)}
        onUpdate={(id, text) => updateRow("afterBooking", id, text)}
        onRemove={(id) => removeRow("afterBooking", id)}
        onAdd={() => addRow("afterBooking")}
      />
    </div>
  );
}

function QuestionCard({
  title,
  badge,
  helper,
  oneCaption,
  set,
  totalRows,
  onEnabledChange,
  onUpdate,
  onRemove,
  onAdd,
}: {
  title: string;
  badge: string;
  helper: string;
  oneCaption: string;
  set: PreConsultationQuestionSet;
  totalRows: number;
  onEnabledChange: (enabled: boolean) => void;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3 rounded-control border border-neutral-borderLight bg-app/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {badge}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className="rounded-full bg-text-muted/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary"
            title="At most 3 questions in total — shared across During booking and After booking."
          >
            {totalRows} of {MAX_QUESTIONS} total
          </span>
          <Switch
            checked={set.enabled}
            onCheckedChange={onEnabledChange}
            aria-label={`Toggle ${title} questions`}
          />
        </div>
      </div>

      <p className="text-xs text-text-muted">{helper}</p>

      <div
        className={cn(
          "space-y-2",
          !set.enabled && "opacity-40 transition-opacity",
        )}
      >
        {set.rows.map((row, index) => (
          <div
            key={row.id}
            className="flex items-center gap-2 rounded-control border border-neutral-borderLight bg-surface p-3"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Smile className="h-4 w-4" />
            </span>
            <span className="shrink-0 text-sm font-semibold text-text-muted">
              {index + 1}
            </span>
            <Input
              value={row.text}
              maxLength={100}
              disabled={!set.enabled}
              onChange={(event) => onUpdate(row.id, event.target.value)}
              placeholder={`${oneCaption} — Question ${index + 1}, e.g. Any allergies to medicines?`}
              aria-label={`${title} question ${index + 1} text`}
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              disabled={!set.enabled}
              onClick={() => onRemove(row.id)}
              aria-label={`Remove question ${index + 1}`}
              className="shrink-0"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}

        {set.enabled && totalRows < MAX_QUESTIONS && (
          <Button variant="outline" size="sm" type="button" onClick={onAdd}>
            <Plus aria-hidden="true" />
            Add question
          </Button>
        )}
        {totalRows === MAX_QUESTIONS && (
          <p className="text-xs text-text-muted">
            You can configure up to {MAX_QUESTIONS} questions.
          </p>
        )}
      </div>
    </div>
  );
}