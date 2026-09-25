"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquareText,
  Stethoscope,
  User,
  Wallet,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { ConsultationModePicker } from "@/components/booking/consultation-mode-picker";
import { SlotEditor } from "@/components/booking/slot-editor";
import {
  PreConsultationEditor,
  type PreConsultationEditorValue,
} from "@/components/pre-consultation-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetailModalHero } from "@/components/ui/detail-modal-hero";
import { FormTabs } from "@/components/ui/form-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type {
  Doctor,
  PreConsultationQuestion,
  Service,
  ServiceSlotTemplate,
} from "@/types/database";

type ServiceAction = (
  _prevState: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

const SERVICE_CATEGORIES = [
  { value: "consultation", label: "Consultation" },
  { value: "service", label: "Service" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "lab_test", label: "Lab Test" },
  { value: "procedure", label: "Procedure" },
] as const;

/** Matches the schema's description cap so the counter is authoritative. */
const DESCRIPTION_LIMIT = 600;

/**
 * Add/Edit service experience (Phase 21). The old standalone Services page
 * keeps using this same form — it gains the detailed field set, writes to the
 * same `services` table, and persists slot templates + per-slot patient limits
 * via `SlotEditor` (reusing Phase 20's slot-generation pattern).
 */
export function ServiceForm({
  action,
  service,
  doctors,
  slotTemplates = [],
  preConsultQuestions = [],
  onDone,
}: {
  action: ServiceAction;
  service?: Service;
  /** Bookable doctors; empty list hides the optional doctor select. */
  doctors: Pick<Doctor, "id" | "name">[];
  /** Existing slot templates, preloaded by the caller for edit round-trips. */
  slotTemplates?: ServiceSlotTemplate[];
  /** Existing active questions scoped to this service (Phase 22). */
  preConsultQuestions?: PreConsultationQuestion[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );
  const [consultationMode, setConsultationMode] = useState<
    "single_slot" | "shared_window"
  >(service?.consultation_mode ?? "single_slot");
  const [description, setDescription] = useState(service?.description ?? "");

  // ---- Tabbed layout (Phase 22) -------------------------------------------
  const [activeTab, setActiveTab] = useState<
    "details" | "availability"
  >("details");

  // ---- Pre-consultation questions state (Phase 22) ------------------------
  const [preConsult, setPreConsult] = useState<PreConsultationEditorValue>(
    () => ({
      duringBooking: {
        enabled: preConsultQuestions.some(
          (question) => question.timing === "during_booking",
        ),
        rows: preConsultQuestions
          .filter((question) => question.timing === "during_booking")
          .map((question) => ({
            id: question.id,
            text: question.question_text,
          })),
      },
      afterBooking: {
        enabled: preConsultQuestions.some(
          (question) => question.timing === "after_booking",
        ),
        rows: preConsultQuestions
          .filter((question) => question.timing === "after_booking")
          .map((question) => ({
            id: question.id,
            text: question.question_text,
          })),
      },
    }),
  );

  const isEdit = Boolean(service);
  const submitted = state !== null;

  const preConsultationQuestionsJson = (() => {
    const duringRows = preConsult.duringBooking.enabled
      ? preConsult.duringBooking.rows
      : [];
    const afterRows = preConsult.afterBooking.enabled
      ? preConsult.afterBooking.rows
      : [];
    // display_order is unique per service in the DB (0-2). Renumber across BOTH
    // timing sets so a During question and an After question never collide on
    // the same order — the During set gets 0..n-1, After continues after it.
    return JSON.stringify({
      duringBooking: duringRows.map((row, index) => ({
        id: row.id,
        displayOrder: index,
        text: row.text,
      })),
      afterBooking: afterRows.map((row, index) => ({
        id: row.id,
        displayOrder: duringRows.length + index,
        text: row.text,
      })),
    });
  })();

  const tabs: Array<{
    id: "details" | "availability";
    label: string;
    icon: typeof User;
  }> = [
    { id: "details", label: "Details", icon: User },
    { id: "availability", label: "Availability & Slots", icon: CalendarClock },
  ];

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-secondary/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit service" : "Add new service"}
    >
      <form
        key={service?.id ?? "new"}
        action={formAction}
        noValidate
        className="relative my-8 flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-2xl"
      >
        {/* Header — teal gradient per design system */}
        <DetailModalHero onClose={onDone}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/30 bg-white/20">
            <Stethoscope className="h-8 w-8 text-white" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">
              {isEdit ? "Edit Service" : "Add New Service"}
            </h2>
            <p className="truncate text-xs text-white/80">
              {isEdit
                ? `Update ${service?.name}'s details and availability.`
                : "Create a new service or lab test."}
            </p>
          </div>
        </DetailModalHero>

        {/* Body — fills remaining card height; only it scrolls when content is long */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-app/40">
          <div className="space-y-4 px-5 pt-5">
            {submitted && !state.ok && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <input
              type="hidden"
              name="status"
              value={service?.status ?? "active"}
            />
            {service && (
              <input type="hidden" name="serviceId" value={service.id} />
            )}
            <input
              type="hidden"
              name="preConsultationQuestionsJson"
              value={preConsultationQuestionsJson}
            />
          </div>

          <FormTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* Details */}
          <div
            className={cn(
              "tab-fade-in space-y-5 px-5 py-5",
              activeTab !== "details" && "hidden",
            )}
          >
            <SectionCard title="Basic Information" icon={User} tone="primary">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="service-name">Service name</Label>
                  <Input
                    id="service-name"
                    name="name"
                    defaultValue={service?.name ?? ""}
                    placeholder="General Consultation"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="service-duration">Visit duration</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="service-duration"
                        name="durationMinutes"
                        type="number"
                        min={1}
                        max={1440}
                        step={1}
                        defaultValue={service?.duration_minutes ?? 30}
                        required
                      />
                      <span className="text-sm text-text-muted">min</span>
                    </div>
                    <p className="text-xs text-text-muted">
                      How long each booking lasts (used to build the calendar).
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="service-duration-info">
                      Duration / Report time
                    </Label>
                    <Input
                      id="service-duration-info"
                      name="durationOrReportTime"
                      defaultValue={service?.duration_or_report_time ?? ""}
                      placeholder="30 min, or 24 hrs for lab results"
                    />
                    <p className="text-xs text-text-muted">
                      Optional label shown to patients — e.g. &quot;30 min&quot;
                      for a visit, or a turnaround time for lab results.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="service-category">Category</Label>
                    <NativeSelect
                      id="service-category"
                      name="category"
                      defaultValue={service?.category ?? ""}
                    >
                      <option value="" disabled>
                        Choose a category
                      </option>
                      {SERVICE_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="service-doctor">Performed by doctor</Label>
                    <NativeSelect
                      id="service-doctor"
                      name="doctorId"
                      defaultValue={service?.doctor_id ?? ""}
                    >
                      <option value="">Any doctor / staff</option>
                      {doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <p className="text-xs text-text-muted">
                      Optional — a lab test may be performed by any technician.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-price">Price (Rs)</Label>
                  <Input
                    id="service-price"
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={service?.price ?? 0}
                    required
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Details & Preparation"
              icon={FileText}
              tone="slate"
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="service-description">Description</Label>
                  <textarea
                    id="service-description"
                    name="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What does this service include?"
                    rows={3}
                    maxLength={DESCRIPTION_LIMIT}
                    className="flex min-h-[80px] w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-text-muted">
                      This description will be shown to patients.
                    </p>
                    <p className="text-xs tabular-nums text-text-muted">
                      {description.length}/{DESCRIPTION_LIMIT}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="service-preparation">
                    Preparation instructions
                  </Label>
                  <textarea
                    id="service-preparation"
                    name="preparationInstructions"
                    defaultValue={service?.preparation_instructions ?? ""}
                    placeholder="Fast for 8 hours before this test…"
                    rows={2}
                    className="flex min-h-[60px] w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-text-muted">
                    Optional — shown to patients before they book.
                  </p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Fees & Follow-up" icon={Wallet} tone="amber">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="service-followup-fee">Follow-up fee (Rs)</Label>
                  <Input
                    id="service-followup-fee"
                    name="followUpFee"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={service?.follow_up_fee ?? ""}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="service-followup-valid">
                    Free follow-up within
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="service-followup-valid"
                      name="followUpValidFor"
                      type="number"
                      min={1}
                      max={730}
                      defaultValue={service?.follow_up_valid_for ?? ""}
                      placeholder="e.g. 7"
                      className="w-24"
                    />
                    <NativeSelect
                      name="followUpPeriod"
                      defaultValue={service?.follow_up_period ?? "days"}
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </NativeSelect>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Pre-Consultation Questions"
              icon={MessageSquareText}
              tone="violet"
            >
              <PreConsultationEditor value={preConsult} onChange={setPreConsult} />
            </SectionCard>
          </div>

          {/* Availability & Slots */}
          <div
            className={cn(
              "tab-fade-in space-y-5 px-5 py-5",
              activeTab !== "availability" && "hidden",
            )}
          >
            <SectionCard title="Booking Method" icon={Clock} tone="primary">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-text-primary">
                  How do you see patients?
                </p>
                <ConsultationModePicker
                  value={consultationMode}
                  onChange={setConsultationMode}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Weekly Schedule & Slots"
              icon={CalendarDays}
              tone="indigo"
            >
              <SlotEditor
                defaultSlots={slotTemplates.map((template) => ({
                  dayOfWeek: template.day_of_week,
                  slotName: template.slot_name ?? "",
                  start: template.start_time,
                  end: template.end_time,
                  patientLimit: template.patient_limit ?? null,
                }))}
                showPatients={consultationMode === "shared_window"}
              />
            </SectionCard>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-text-muted/15 bg-white px-6 py-4">
          <p className="hidden items-center gap-1.5 text-xs text-text-muted sm:flex">
            <CheckCircle2
              className="h-3.5 w-3.5 text-status-success"
              aria-hidden="true"
            />
            Changes will be saved automatically
          </p>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button variant="outline" type="button" onClick={onDone}>
              Cancel
            </Button>
            <SubmitButton loadingText="Saving…">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              {isEdit ? "Update Service" : "Add Service"}
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}