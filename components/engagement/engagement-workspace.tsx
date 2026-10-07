"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Keyboard,
  Plus,
  RefreshCcw,
  Receipt,
  Star,
  StarHalf,
  Users2,
  Zap,
} from "lucide-react";

import {
  addClinicReviewAction,
  deleteEngagementReminderAction,
  saveEngagementGeneralSettingsAction,
  saveEngagementReminderFormAction,
  saveEngagementTemplateAction,
  setEngagementAutomationAction,
  type EngagementSnapshot,
} from "@/lib/actions/engagement";
import type { EngagementAutomationView, EngagementTemplateView } from "@/lib/actions/engagement";
import { ENGAGEMENT_AUTOMATION_TYPES, ENGAGEMENT_TEMPLATE_TYPES } from "@/lib/validation/schemas";
import { AutomationToggleCard } from "@/components/engagement/automation-toggle-card";
import { GeneralSettingsCard } from "@/components/engagement/general-settings-card";
import { MetricCard } from "@/components/engagement/metric-card";
import { RemindersView } from "@/components/engagement/reminders-view";
import type { ReminderFormValue } from "@/components/engagement/reminder-modal";
import { ReviewDialog } from "@/components/engagement/review-dialog";
import { ReviewRequestCard } from "@/components/engagement/review-request-card";
import { TemplateConfigCard } from "@/components/engagement/template-config-card";
import { WhatsappPreview } from "@/components/engagement/whatsapp-preview";
import { cn } from "@/lib/utils";

type Toast = { message: string; tone: "success" | "error" };

type View = "reminders" | "automation";

const DEFAULT_REVIEW_TEMPLATE =
  "Hi {patient_name}! We hope you had a smooth appointment with {doctor_name} at {clinic_name}. 😊 We'd love your feedback — it takes less than a minute to leave a Google review.\n\n{clinic_name}\n{clinic_location}";

type AutomationTypeKey = (typeof ENGAGEMENT_AUTOMATION_TYPES)[number];
type TemplateTypeKey = (typeof ENGAGEMENT_TEMPLATE_TYPES)[number];

const WORKFLOW_STEPS = [
  {
    icon: Keyboard,
    title: "Auto-save Enabled",
    description: "Every change persists the moment you click Save — no separate publish step.",
  },
  {
    icon: CheckCircle2,
    title: "Smart Filtering",
    description: "Messages reach only the patients who completed the visit — no inbox noise.",
  },
  {
    icon: RefreshCcw,
    title: "Recognitions",
    description: "Review and reminder flows run on top of the appointments you already schedule.",
  },
  {
    icon: Zap,
    title: "Live Preview",
    description: "Watch the patient's WhatsApp view update as you type each message.",
  },
];

export function EngagementWorkspace({ snapshot: initial }: { snapshot: EngagementSnapshot }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [toast, setToast] = useState<Toast | null>(null);
  const [view, setView] = useState<View>("automation");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState(
    initial.templates.review_request?.templateText ?? DEFAULT_REVIEW_TEMPLATE,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSnapshot(initial), [initial]);

  function notify(message: string, tone: Toast["tone"] = "success") {
    setToast({ message, tone });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2600);
  }

  function patchAutomation(type: string, value: EngagementAutomationView) {
    setSnapshot((prev) => ({
      ...prev,
      automations: { ...prev.automations, [type]: value },
    }));
  }

  function patchTemplate(type: string, value: EngagementTemplateView) {
    setSnapshot((prev) => ({
      ...prev,
      templates: { ...prev.templates, [type]: value },
    }));
  }

  async function toggleAutomation(type: string, enabled: boolean): Promise<boolean> {
    const automation = snapshot.automations[type as AutomationTypeKey];
    const previous = automation ?? { enabled: !enabled, config: {} as Record<string, unknown> };
    patchAutomation(type, { ...previous, enabled });
    if (type === "receipt_delivery") {
      setSnapshot((prev) => ({ ...prev, receiptAutoSend: enabled }));
    }

    const result = await setEngagementAutomationAction({
      automationType: type as AutomationTypeKey,
      enabled,
      config: previous.config,
    });
    if (!result.ok) {
      patchAutomation(type, previous);
      if (type === "receipt_delivery") {
        setSnapshot((prev) => ({ ...prev, receiptAutoSend: previous.enabled }));
      }
      notify(result.message, "error");
      return false;
    }
    router.refresh();
    notify(`${enabled ? "Turned on" : "Turned off"} — saved automatically.`);
    return true;
  }

  async function saveAutomationConfig(
    type: string,
    config: Record<string, unknown>,
  ): Promise<boolean> {
    const automation = snapshot.automations[type as AutomationTypeKey];
    const previous = automation ?? { enabled: true, config: {} as Record<string, unknown> };
    patchAutomation(type, { ...previous, config });

    const result = await setEngagementAutomationAction({
      automationType: type as AutomationTypeKey,
      enabled: previous.enabled,
      config,
    });
    if (!result.ok) {
      patchAutomation(type, previous);
      notify(result.message, "error");
      return false;
    }
    router.refresh();
    notify("Settings saved.");
    return true;
  }

  async function saveTemplate(type: string, text: string): Promise<boolean> {
    const template = snapshot.templates[type as TemplateTypeKey];
    const previous = template ?? { templateText: text, enabled: true };
    patchTemplate(type, { ...previous, templateText: text });

    const result = await saveEngagementTemplateAction({
      type: type as TemplateTypeKey,
      templateText: text,
    });
    if (!result.ok) {
      patchTemplate(type, previous);
      notify(result.message, "error");
      return false;
    }
    router.refresh();
    notify("Message saved.");
    return true;
  }

  async function saveReminderForm(
    type: "appointment_confirmation" | "appointment_reminder",
    form: ReminderFormValue,
  ): Promise<boolean> {
    const parseAutomation = () =>
      type === "appointment_reminder"
        ? {
            template_name: form.templateName,
            template_header: form.templateHeader,
            template_header_type: form.headerType ?? (form.templateHeader ? "text" : "none"),
            template_header_image: form.headerImage ?? "",
            trigger: form.trigger,
            delay_value: form.delayValue,
            delay_unit: form.delayUnit,
            delay_hours:
              form.delayUnit === "hours"
                ? form.delayValue
                : Math.round(form.delayValue * 24),
            doctor_scope: form.doctorScope,
            doctor_id: form.doctorScope === "specific" ? form.doctorId : "",
          }
        : {
            template_name: form.templateName,
            template_header: form.templateHeader,
            template_header_type: form.headerType ?? (form.templateHeader ? "text" : "none"),
            template_header_image: form.headerImage ?? "",
          };

    const automation = snapshot.automations[type];
    const template = snapshot.templates[type];
    const previousAutomation = automation ?? { enabled: true, config: {} as Record<string, unknown> };
    const previousTemplate = template ?? { templateText: form.templateText, enabled: true };
    patchAutomation(type, { ...previousAutomation, config: parseAutomation() });
    patchTemplate(type, { ...previousTemplate, templateText: form.templateText });

    const result = await saveEngagementReminderFormAction({
      type,
      templateName: form.templateName,
      templateHeader: form.templateHeader,
      headerType: form.headerType,
      headerImage: form.headerImage,
      templateText: form.templateText,
      trigger: form.trigger,
      delayValue: form.delayValue,
      delayUnit: form.delayUnit,
      doctorScope: form.doctorScope,
      doctorId: form.doctorId,
    });
    if (!result.ok) {
      patchAutomation(type, previousAutomation);
      patchTemplate(type, previousTemplate);
      notify(result.message, "error");
      return false;
    }
    router.refresh();
    notify(type === "appointment_reminder" ? "Reminder saved." : "Confirmation message saved.");
    return true;
  }

  async function saveReminder(form: ReminderFormValue): Promise<boolean> {
    return saveReminderForm("appointment_reminder", form);
  }

  async function deleteReminder(): Promise<boolean> {
    const type = "appointment_reminder";
    const previousAutomation = snapshot.automations[type];
    if (!previousAutomation) return true;
    patchAutomation(type, { ...previousAutomation, enabled: false, config: { deleted: true } });

    const result = await deleteEngagementReminderAction({ type });
    if (!result.ok) {
      patchAutomation(type, previousAutomation);
      notify(result.message, "error");
      return false;
    }
    router.refresh();
    notify("Reminder deleted.");
    return true;
  }

  async function saveGeneralSettings(zone: string, mapsLink: string): Promise<boolean> {
    const result = await saveEngagementGeneralSettingsAction({ timezone: zone, mapsLink });
    if (!result.ok) {
      notify(result.message, "error");
      return false;
    }
    setSnapshot((prev) => ({
      ...prev,
      timezone: zone,
      automations: {
        ...prev.automations,
        general: { enabled: true, config: { maps_link: mapsLink } },
      },
    }));
    router.refresh();
    notify("General settings saved.");
    return true;
  }

  async function saveReview(rating: number, reviewerName: string, comment: string): Promise<boolean> {
    const result = await addClinicReviewAction({ rating, reviewerName, comment });
    if (!result.ok) {
      notify(result.message, "error");
      return false;
    }
    if (result.data) {
      setSnapshot((prev) => ({
        ...prev,
        metrics: {
          ...prev.metrics,
          reviewsCount: result.data!.reviewsCount,
          averageRating: result.data!.averageRating,
        },
      }));
    }
    router.refresh();
    notify("Review logged.");
    return true;
  }

  const { metrics } = snapshot;

  return (
    <div data-app-wide className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Patient Engagement
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Automate reminders and grow reviews — all over WhatsApp.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-pill border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-card">
          <span className="size-2 animate-pulse rounded-pill bg-status-success" />
          Auto-save Enabled
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={BellRing}
          label="Reminders Sent"
          value={String(metrics.remindersSent)}
          sub="Delivered over WhatsApp, all-time"
        />
        <MetricCard
          icon={CalendarCheck}
          label="Show-up Rate"
          value={`${metrics.showUpRate}%`}
          sub={`${metrics.completed} attended · ${metrics.completed + metrics.noShowCount} scheduled`}
        />
        <MetricCard
          icon={Star}
          label="Google Reviews"
          value={String(metrics.reviewsCount)}
          sub="Total reviews logged"
          action={
            snapshot.canWrite ? (
              <button
                type="button"
                onClick={() => setReviewOpen(true)}
                className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Log
              </button>
            ) : undefined
          }
        />
        <MetricCard
          icon={StarHalf}
          label="Average Rating"
          value={`${metrics.averageRating ?? "—"}★`}
          sub={`From ${metrics.reviewsCount} logged review${metrics.reviewsCount === 1 ? "" : "s"}`}
        />
      </div>

      {/* Segmented tabs */}
      <div
        className="inline-flex items-center gap-1 rounded-pill bg-text-muted/15 p-1"
        role="tablist"
        aria-label="Engagement settings sections"
      >
        {(
          [
            { id: "reminders", label: "Reminders" },
            { id: "automation", label: "Automation" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              "rounded-pill px-6 py-2 text-sm font-semibold transition-all",
              view === tab.id
                ? "bg-surface text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-8">
          {view === "reminders" ? (
            <RemindersView
              canWrite={snapshot.canWrite}
              clinicId={snapshot.clinicId}
              clinicName={snapshot.clinicName}
              doctors={snapshot.doctors}
              reminderAutomation={snapshot.automations.appointment_reminder}
              reminderTemplate={snapshot.templates.appointment_reminder}
              remindersSent={metrics.remindersSent}
              onToggle={toggleAutomation}
              onSaveReminder={saveReminder}
              onDeleteReminder={deleteReminder}
            />
          ) : (
            <>
              {/* Review automation */}
              <ReviewRequestCard
                enabled={Boolean(snapshot.automations.review_request?.enabled)}
                onToggle={(checked) => toggleAutomation("review_request", checked)}
                delayHours={Number(snapshot.automations.review_request?.config.delay_hours ?? 24)}
                onSaveDelay={(hours) => saveAutomationConfig("review_request", { delay_hours: hours })}
                templateText={
                  snapshot.templates.review_request?.templateText ?? DEFAULT_REVIEW_TEMPLATE
                }
                onSaveTemplate={(text) => saveTemplate("review_request", text)}
                reviewUrl={snapshot.reviewUrl}
                onDraftChange={setPreviewText}
                disabled={!snapshot.canWrite}
              />

              {/* Prescription / Receipt / Check-in */}
              <div className="space-y-3">
                <AutomationToggleCard
                  icon={FileText}
                  title="Prescription Delivery"
                  description="Send the digital prescription straight after a visit"
                  checked={Boolean(snapshot.automations.prescription_delivery?.enabled)}
                  onCheckedChange={(checked) => toggleAutomation("prescription_delivery", checked)}
                  disabled={!snapshot.canWrite}
                />
                <AutomationToggleCard
                  icon={Receipt}
                  title="Receipts after Payment"
                  description="Attach a payment receipt to every WhatsApp message"
                  checked={Boolean(snapshot.automations.receipt_delivery?.enabled)}
                  onCheckedChange={(checked) => toggleAutomation("receipt_delivery", checked)}
                  disabled={!snapshot.canWrite}
                  footnote="Also writes the clinic's auto-send-receipt column — the billing flow reads this."
                />
                <AutomationToggleCard
                  icon={ClipboardCheck}
                  title="Digital Check-in"
                  description="Confirm the queue position + estimated wait time"
                  checked={Boolean(snapshot.automations.check_in?.enabled)}
                  onCheckedChange={(checked) => toggleAutomation("check_in", checked)}
                  disabled={!snapshot.canWrite}
                />
              </div>

              {/* No-show + Follow-up */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TemplateConfigCard
                  icon={Users2}
                  title="No-Show Recovery"
                  description="Re-engage patients who missed their slot"
                  enabled={Boolean(snapshot.automations.no_show_recovery?.enabled)}
                  onToggle={(checked) => toggleAutomation("no_show_recovery", checked)}
                  selectLabel="Send recovery message after"
                  selectOptions={[
                    { value: "24", label: "24 hours after" },
                    { value: "48", label: "48 hours after" },
                    { value: "72", label: "72 hours after" },
                  ]}
                  selectValue={String(
                    snapshot.automations.no_show_recovery?.config.delay_hours ?? 24,
                  )}
                  onSelectChange={(value) =>
                    saveAutomationConfig("no_show_recovery", { delay_hours: Number(value) })
                  }
                  templateText={snapshot.templates.no_show_recovery?.templateText ?? ""}
                  onSaveTemplate={(text) => saveTemplate("no_show_recovery", text)}
                  variables={["patient_name", "doctor_name", "clinic_name"]}
                  disabled={!snapshot.canWrite}
                />
                <TemplateConfigCard
                  icon={RefreshCcw}
                  title="Auto Follow-Up"
                  description="Post-visit check-in that builds trust"
                  enabled={Boolean(snapshot.automations.auto_follow_up?.enabled)}
                  onToggle={(checked) => toggleAutomation("auto_follow_up", checked)}
                  selectLabel="Follow up after"
                  selectOptions={[
                    { value: "3", label: "3 days after" },
                    { value: "7", label: "7 days after" },
                    { value: "14", label: "14 days after" },
                  ]}
                  selectValue={String(
                    snapshot.automations.auto_follow_up?.config.days_after ?? 3,
                  )}
                  onSelectChange={(value) =>
                    saveAutomationConfig("auto_follow_up", { days_after: Number(value) })
                  }
                  templateText={snapshot.templates.auto_follow_up?.templateText ?? ""}
                  onSaveTemplate={(text) => saveTemplate("auto_follow_up", text)}
                  variables={["patient_name", "doctor_name", "clinic_name"]}
                  disabled={!snapshot.canWrite}
                />
              </div>

              {/* General settings */}
              <GeneralSettingsCard
                timezone={snapshot.timezone}
                mapsLink={
                  typeof snapshot.automations.general?.config.maps_link === "string"
                    ? snapshot.automations.general.config.maps_link
                    : ""
                }
                onSave={saveGeneralSettings}
                disabled={!snapshot.canWrite}
              />

              {/* How it works */}
              <div className="rounded-card border border-hairline bg-surface p-4 shadow-card">
                <h3 className="text-sm font-semibold text-text-primary">
                  How Patient Automation Works
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {WORKFLOW_STEPS.map((step) => (
                    <div key={step.title} className="flex gap-3 rounded-control bg-app p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                        <step.icon className="size-4" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text-primary">{step.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right column — live preview + tips */}
        <div className="lg:sticky lg:top-6 lg:col-span-4">
          <WhatsappPreview
            message={previewText}
            clinicName={snapshot.clinicName}
          />
        </div>
      </div>

      {/* Log review dialog */}
      {snapshot.canWrite && (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          onSave={saveReview}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-pill px-4 py-2 text-sm font-medium shadow-dropdown",
            toast.tone === "success" ? "bg-secondary text-white" : "bg-status-destructive text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}