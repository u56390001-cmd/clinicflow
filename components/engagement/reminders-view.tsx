"use client";

import { useState } from "react";
import { Bell, Clock, PencilLine, Plus, Send, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ReminderModal,
  type ReminderFormValue,
} from "@/components/engagement/reminder-modal";
import type {
  EngagementAutomationView,
  EngagementTemplateView,
} from "@/lib/actions/engagement";
import { cn } from "@/lib/utils";

type RemindersViewProps = {
  canWrite: boolean;
  clinicId: string;
  clinicName: string;
  doctors: { id: string; name: string }[];
  reminderAutomation: EngagementAutomationView | undefined;
  reminderTemplate: EngagementTemplateView | undefined;
  remindersSent: number;
  onToggle: (type: string, enabled: boolean) => void;
  onSaveReminder: (form: ReminderFormValue) => Promise<boolean>;
  onDeleteReminder: () => Promise<boolean>;
};

/** Short human delay, e.g. "1 day" / "24 hours", from the stored config. */
function describeDelay(config: Record<string, unknown>): string {
  const rawValue =
    typeof config.delay_value === "number" ? config.delay_value : null;
  const unitIsDays = config.delay_unit === "days";
  if (rawValue !== null) {
    const value = Math.max(1, Math.round(rawValue));
    return `${value} ${unitIsDays ? "day" : "hour"}${value === 1 ? "" : "s"}`;
  }
  const hours =
    typeof config.delay_hours === "number" ? Math.max(1, Math.round(config.delay_hours)) : 24;
  if (hours % 24 === 0) {
    return `${hours / 24} day${hours / 24 === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * "Reminders" tab, rebuilt as the reference's "Active Reminders" container: a
 * header with the live count + a "New Reminder" button and one card per saved
 * reminder. Because the engagement model holds a single pre-appointment
 * reminder, the card list shows that automation (or an empty state when it has
 * been deleted). Every edit / "New Reminder" opens the full reminder popup.
 */
export function RemindersView({
  canWrite,
  clinicId,
  clinicName,
  doctors,
  reminderAutomation,
  reminderTemplate,
  remindersSent,
  onToggle,
  onSaveReminder,
  onDeleteReminder,
}: RemindersViewProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const config = reminderAutomation?.config ?? {};
  const deleted = config.deleted === true;
  const enabled = Boolean(reminderAutomation?.enabled);
  const hasReminder = Boolean(reminderAutomation) && !deleted;
  const templateName =
    typeof config.template_name === "string" && config.template_name.trim()
      ? config.template_name
      : "appointment reminder";
  const messagePreview = reminderTemplate?.templateText?.trim() ?? "";
  const trigger = config.trigger === "after" ? "After" : "Before";
  const doctorScope =
    config.doctor_scope === "specific" &&
    typeof config.doctor_id === "string" &&
    config.doctor_id
      ? (doctors.find((doctor) => doctor.id === config.doctor_id)?.name ?? "A specific doctor")
      : "All Doctors";

  return (
    <div className="space-y-4">
      {/* Active Reminders container — matches the reference design */}
      <div className="overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline bg-gradient-to-r from-gray-50 to-white px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Active Reminders</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Manage your automated appointment reminders
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-pill bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              {enabled ? "1" : "0"} Active
            </span>
            <Button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={!canWrite}
              className="items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#0F766E] px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-[#0C7A6F] hover:to-[#115E59] hover:shadow-xl"
            >
              <Plus className="size-4" aria-hidden="true" />
              New Reminder
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 p-6">
          {hasReminder ? (
            /* Reminder card */
            <div
              className={cn(
                "group relative rounded-xl border-2 p-5 transition-all duration-200",
                enabled
                  ? "cursor-pointer border-primary bg-primary/5 hover:shadow-lg"
                  : "border-hairline bg-surface hover:border-text-muted",
              )}
              onClick={() => canWrite && setModalOpen(true)}
              role={canWrite ? "button" : undefined}
              tabIndex={canWrite ? 0 : undefined}
              onKeyDown={
                canWrite
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setModalOpen(true);
                      }
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Bell className="size-5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                        {templateName}
                      </span>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-primary">
                        {messagePreview}
                      </p>
                    </div>
                  </div>

                  {/* Meta chips */}
                  <div className="ml-11 mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {trigger}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {describeDelay(config)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      <Users className="size-3.5" aria-hidden="true" />
                      {doctorScope}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      <Send className="size-3.5" aria-hidden="true" />
                      Sent: {remindersSent}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={enabled ? "Turn reminder off" : "Turn reminder on"}
                    disabled={!canWrite}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle("appointment_reminder", !enabled);
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
                      enabled ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-text-muted/40",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none block h-5 w-5 rounded-pill bg-white shadow-sm transition-transform duration-200",
                        enabled ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Edit reminder"
                    disabled={!canWrite}
                    onClick={(event) => {
                      event.stopPropagation();
                      setModalOpen(true);
                    }}
                    className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PencilLine className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete reminder"
                    disabled={!canWrite}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteReminder();
                    }}
                    className="flex size-9 items-center justify-center rounded-lg bg-gray-100 text-text-secondary transition-colors hover:bg-status-destructive hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-hairline px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-primary/10">
                <Bell className="size-6 text-primary" aria-hidden="true" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-text-primary">
                No reminders yet
              </h4>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-text-secondary">
                Create your first automated WhatsApp appointment reminder with a
                live preview and quick presets.
              </p>
              {canWrite && (
                <Button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="mt-4 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-[#0C7A6F] hover:to-[#115E59] hover:shadow-xl"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New Reminder
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* How reminders flow */}
      <div className="rounded-card border border-primary-tint-border bg-primary-tint p-4">
        <p className="text-sm font-semibold text-primary">How reminders are sent</p>
        <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-secondary">
          <li>
            <span className="font-semibold text-text-primary">1.</span> In the window you
            pick here, a scheduled job sends the reminder to enrolled patients.
          </li>
          <li>
            <span className="font-semibold text-text-primary">2.</span> Before or after the
            visit is fine — the trigger decides the direction.
          </li>
          <li>
            <span className="font-semibold text-text-primary">3.</span> Each send is recorded
            on the card and in the “Reminders Sent” metric above.
          </li>
        </ol>
      </div>

      <ReminderModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode="reminder"
        clinicId={clinicId}
        clinicName={clinicName}
        doctors={doctors}
        templateText={hasReminder ? messagePreview : (reminderTemplate?.templateText ?? "")}
        config={config}
        disabled={!canWrite}
        onSave={onSaveReminder}
      />
    </div>
  );
}