"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  Save,
  Users,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ReminderModalMode = "reminder" | "confirmation";

export type ReminderFormValue = {
  templateName: string;
  templateHeader: string;
  headerType: "text" | "image" | "none";
  headerImage: string;
  templateText: string;
  trigger: "before" | "after";
  delayValue: number;
  delayUnit: "hours" | "days";
  doctorScope: "all" | "specific";
  doctorId: string;
};

type ReminderModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ReminderModalMode;
  clinicId: string;
  clinicName: string;
  doctors: { id: string; name: string }[];
  templateText: string;
  config: Record<string, unknown>;
  disabled?: boolean;
  onSave: (form: ReminderFormValue) => Promise<boolean>;
};

/** Variable chips the reference draws under the template textarea. */
const REMINDER_VARIABLES = [
  "patient_name",
  "doctor_name",
  "appointment_time",
  "appointment_date",
  "slot_name",
  "clinic_name",
] as const;

const QUICK_PRESETS = [
  { label: "1 hour", value: 1, unit: "hours" as const },
  { label: "2 hours", value: 2, unit: "hours" as const },
  { label: "1 day", value: 1, unit: "days" as const },
  { label: "3 days", value: 3, unit: "days" as const },
  { label: "1 week", value: 7, unit: "days" as const },
  { label: "1 month", value: 30, unit: "days" as const },
];

const HEADLINE: Record<ReminderModalMode, { title: string; subtitle: string }> = {
  reminder: {
    title: "Create New Reminder",
    subtitle: "Set up an automated appointment reminder",
  },
  confirmation: {
    title: "Edit Confirmation Message",
    subtitle: "Sent as soon as a patient books on WhatsApp",
  },
};

const SAMPLE = {
  patientName: "Rahul Sharma",
  doctorName: "Dr. Sarah Jenkins",
  slotName: "General Consultation",
  date: "Tue, Sep 1",
  time: "9:30 AM",
};

const HEADER_IMAGE_BUCKET = "reminder-header-images";
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MIN_IMAGE_BYTES = 20 * 1024;
const MAX_IMAGE_BYTES = 300 * 1024;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function interpolate(text: string, clinicName: string): string {
  return text
    .replace(/\{patient_name\}/g, SAMPLE.patientName)
    .replace(/\{doctor_name\}/g, SAMPLE.doctorName)
    .replace(/\{clinic_name\}/g, clinicName)
    .replace(/\{clinic_location\}/g, clinicName)
    .replace(/\{appointment_date\}/g, SAMPLE.date)
    .replace(/\{appointment_time\}/g, SAMPLE.time)
    .replace(/\{slot_name\}/g, SAMPLE.slotName)
    .replace(/\{service\}/g, SAMPLE.slotName);
}

/**
 * The Reminders-tab popup, rebuilt to match the reference HTML/CSS exactly but
 * with the system primary teal replacing the reference's indigo accent. In
 * `reminder` mode it's the full "Create New Reminder" form (name, header,
 * template + variables, trigger + quick presets, doctor scope); `confirmation`
 * mode drops the trigger/scope sections and edits the confirmation copy.
 */
export function ReminderModal({
  open,
  onOpenChange,
  mode,
  clinicId,
  clinicName,
  doctors,
  templateText,
  config,
  disabled = false,
  onSave,
}: ReminderModalProps) {
  const headline = HEADLINE[mode];
  const reminderMode = mode === "reminder";

  const [templateName, setTemplateName] = useState("");
  const [templateHeader, setTemplateHeader] = useState("");
  const [headerType, setHeaderType] = useState<"text" | "image" | "none">("text");
  const [headerImage, setHeaderImage] = useState("");
  const [templateBody, setTemplateBody] = useState("");
  const [trigger, setTrigger] = useState<"before" | "after">("before");
  const [delayValue, setDelayValue] = useState(1);
  const [delayUnit, setDelayUnit] = useState<"hours" | "days">("hours");
  const [doctorScope, setDoctorScope] = useState<"all" | "specific">("all");
  const [doctorId, setDoctorId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Validates and uploads a header image to storage, then stores its URL. */
  async function handleHeaderImageUpload(file: File | undefined) {
    if (!file) return;
    setImageError("");
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError("Use a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size < MIN_IMAGE_BYTES || file.size > MAX_IMAGE_BYTES) {
      setImageError("Keep the image between 20KB and 300KB.");
      return;
    }
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${clinicId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    setUploadingImage(true);
    try {
      const { error } = await supabase.storage.from(HEADER_IMAGE_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw new Error(error.message);
      const { data: urlData } = supabase.storage
        .from(HEADER_IMAGE_BUCKET)
        .getPublicUrl(path);
      setHeaderImage(urlData.publicUrl);
    } catch {
      setImageError("Upload failed. Try pasting the image URL instead.");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!open) return;
    const unit =
      config.delay_unit === "days" || config.delay_unit === "hours"
        ? config.delay_unit
        : typeof config.delay_hours === "number" && config.delay_hours > 0
        ? config.delay_hours % 24 === 0
          ? "days"
          : "hours"
        : "hours";
    const rawDelay =
      typeof config.delay_value === "number" && config.delay_value > 0
        ? config.delay_value
        : typeof config.delay_hours === "number" && config.delay_hours > 0
        ? unit === "days"
          ? Math.round(config.delay_hours / 24)
          : config.delay_hours
        : 1;

    setTemplateName(
      typeof config.template_name === "string"
        ? config.template_name
        : reminderMode
        ? "24-Hour Pre-Appointment Reminder"
        : "Appointment Confirmation",
    );
    setTemplateHeader(
      typeof config.template_header === "string"
        ? config.template_header
        : reminderMode
        ? "🔔 Appointment Reminder"
        : "✅ Appointment Confirmation",
    );
    setHeaderType(
      config.template_header_type === "image" || config.template_header_type === "none"
        ? config.template_header_type
        : config.template_header
        ? "text"
        : "none",
    );
    setHeaderImage(
      typeof config.template_header_image === "string"
        ? config.template_header_image
        : "",
    );
    setTemplateBody(templateText);
    setTrigger(config.trigger === "after" ? "after" : "before");
    setDelayValue(rawDelay);
    setDelayUnit(unit);
    setDoctorScope(config.doctor_scope === "specific" ? "specific" : "all");
    setDoctorId(typeof config.doctor_id === "string" ? config.doctor_id : "");
    setSaving(false);
  }, [open, mode, config, templateText, reminderMode]);

  const canSave =
    !disabled &&
    !saving &&
    templateName.trim().length > 0 &&
    templateBody.trim().length > 0 &&
    (headerType !== "image" || headerImage.trim().length > 0) &&
    (doctorScope === "all" || doctorId !== "" || doctors.length === 0);

  /** Rendered message: text header includes the input, none/image types ride on the body only. */
  const hasHeader = headerType === "text" && templateHeader.trim().length > 0;
  const previewBody = interpolate(templateBody, clinicName);

  async function handleSave() {
    setSaving(true);
    const ok = await onSave({
      templateName,
      templateHeader,
      headerType,
      headerImage,
      templateText: templateBody,
      trigger,
      delayValue,
      delayUnit,
      doctorScope,
      doctorId: doctorScope === "specific" ? doctorId : "",
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  const delayHours =
    delayUnit === "hours" ? delayValue : Math.round(delayValue * 24);
  const scopeName =
    doctorScope === "all"
      ? "All Doctors"
      : (doctors.find((doctor) => doctor.id === doctorId)?.name ?? "a specific doctor");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-5xl gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl"
      >
        {/* Gradient header — primary instead of the reference indigo */}
        <div className="relative bg-gradient-to-r from-primary to-[#0F766E] p-6 text-white">
          <div className="absolute inset-0 bg-black/5" aria-hidden="true" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-sm">
                <Bell className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold leading-tight text-white">
                  {headline.title}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-blue-50/90">
                  {headline.subtitle}
                </DialogDescription>
              </div>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                className="group flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-all duration-200 hover:bg-white/20"
                aria-label="Close"
              >
                <X className="size-5 transition-transform duration-200 group-hover:rotate-90" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
          {/* Left column */}
          <div className="space-y-5">
            {/* Template Name */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Template Name<span className="ml-1 text-status-destructive">*</span>
              </label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                disabled={disabled || saving}
                placeholder="e.g., 24-Hour Pre-Appointment Reminder"
                className="h-auto rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Choose a descriptive name to easily identify this reminder
              </p>
            </div>

            {/* Message Header */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Message Header
              </label>
              <div className="relative">
                <NativeSelect
                  aria-label="Message header type"
                  value={headerType}
                  onChange={(event) =>
                    setHeaderType(event.target.value as "text" | "image" | "none")
                  }
                  disabled={disabled || saving}
                  className="h-auto w-full appearance-none rounded-xl border-2 border-gray-200 bg-white px-4 pr-10 py-3 text-[15px] font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="text">Text Header</option>
                  <option value="image">Image Header</option>
                  <option value="none">No Header</option>
                </NativeSelect>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </div>

              {headerType === "text" ? (
                <div className="mt-3">
                  <Input
                    value={templateHeader}
                    onChange={(event) => setTemplateHeader(event.target.value)}
                    disabled={disabled || saving}
                    placeholder="e.g., 🔔 Appointment Reminder"
                    className="h-auto rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/40"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    You can use variables like {"{patient_name}"}, {"{doctor_name}"}
                  </p>
                </div>
              ) : headerType === "image" ? (
                <div className="mt-3">
                  <div className="relative">
                    <Input
                      value={headerImage}
                      onChange={(event) => {
                        setHeaderImage(event.target.value);
                        setImageError("");
                      }}
                      disabled={disabled || saving || uploadingImage}
                      placeholder="https://example.com/image.jpg"
                      className="h-auto rounded-xl border-2 border-gray-200 px-4 py-3 pr-32 focus:border-primary focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      disabled={disabled || saving || uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingImage ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <ImagePlus className="size-3.5" aria-hidden="true" />
                      )}
                      Upload Image
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => handleHeaderImageUpload(event.target.files?.[0])}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    Upload Image or paste URL above — Enter a valid image URL (JPEG, PNG, or
                    WEBP) · Size: 20KB – 300KB
                  </p>
                  {imageError ? (
                    <p className="mt-1 text-xs font-medium text-status-destructive">
                      {imageError}
                    </p>
                  ) : null}
                  {headerImage.trim() ? (
                    <div className="mt-3 overflow-hidden rounded-xl border-2 border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={headerImage.trim()}
                        alt="Header preview"
                        className="h-32 w-full object-cover"
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500">
                  No header — the message starts with your template body.
                </p>
              )}
            </div>

            {/* Message Template */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Message Template<span className="ml-1 text-status-destructive">*</span>
              </label>
              <Textarea
                value={templateBody}
                onChange={(event) => setTemplateBody(event.target.value)}
                disabled={disabled || saving}
                placeholder="Enter your reminder message with variables like {patient_name}, {doctor_name}..."
                rows={6}
                className="h-auto resize-none rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/40"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {REMINDER_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    disabled={disabled || saving}
                    onClick={() => setTemplateBody((body) => `${body}{${variable}}`)}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {"{"}
                    {variable}
                    {"}"}
                  </button>
                ))}
              </div>
            </div>

            {reminderMode ? (
              <>
                {/* Trigger Time */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Trigger Time
                  </label>
                  <div className="relative">
                    <NativeSelect
                      aria-label="Trigger time"
                      value={trigger}
                      onChange={(event) =>
                        setTrigger(event.target.value as "before" | "after")
                      }
                      disabled={disabled || saving}
                      className="h-auto w-full appearance-none rounded-xl border-2 border-gray-200 bg-white px-4 pr-10 py-3 text-[15px] font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="before">Before appointment</option>
                      <option value="after">After appointment</option>
                    </NativeSelect>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Send reminder after */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Send reminder after
                  </label>
                  <div className="flex gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={delayValue}
                      onChange={(event) =>
                        setDelayValue(
                          Math.max(1, Math.min(365, Number(event.target.value) || 1)),
                        )
                      }
                      disabled={disabled || saving}
                      className="h-auto w-24 rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/40"
                    />
                    <div className="flex-1">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                          <Clock className="size-4" aria-hidden="true" />
                        </span>
                        <NativeSelect
                          value={delayUnit}
                          onChange={(event) =>
                            setDelayUnit(event.target.value as "hours" | "days")
                          }
                          disabled={disabled || saving}
                          className="h-auto w-full appearance-none rounded-xl border-2 border-gray-200 bg-white pl-10 pr-10 py-3 text-[15px] font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </NativeSelect>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-gray-600">Quick presets:</p>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PRESETS.map((preset) => {
                        const active =
                          delayValue === preset.value && delayUnit === preset.unit;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={disabled || saving}
                            onClick={() => {
                              setDelayValue(preset.value);
                              setDelayUnit(preset.unit);
                            }}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                              active
                                ? "bg-primary text-white"
                                : "bg-gray-100 text-text-primary hover:bg-primary hover:text-white",
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Apply to */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Apply this reminder to:
                  </label>
                  <div className="space-y-3">
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all",
                        doctorScope === "all"
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                    >
                      <input
                        type="radio"
                        checked={doctorScope === "all"}
                        onChange={() => setDoctorScope("all")}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <Users className="size-4 text-gray-600" aria-hidden="true" />
                          <p className="font-semibold text-gray-900">All Doctors</p>
                        </div>
                        <p className="text-xs text-gray-500">
                          Send for appointments with any doctor in your Organization
                        </p>
                      </div>
                    </label>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-all",
                        doctorScope === "specific"
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                    >
                      <input
                        type="radio"
                        checked={doctorScope === "specific"}
                        onChange={() => setDoctorScope("specific")}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <User className="size-4 text-gray-600" aria-hidden="true" />
                          <p className="font-semibold text-gray-900">Specific Doctor</p>
                        </div>
                        <p className="mb-3 text-xs text-gray-500">
                          Send only for appointments with a selected doctor
                        </p>
                        {doctorScope === "specific" && (
                          <NativeSelect
                            value={doctorId}
                            onChange={(event) => setDoctorId(event.target.value)}
                            disabled={disabled || saving || doctors.length === 0}
                            className="h-auto rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary focus:ring-2 focus:ring-primary/40"
                          >
                            <option value="">Select a doctor…</option>
                            {doctors.map((doctor) => (
                              <option key={doctor.id} value={doctor.id}>
                                {doctor.name}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              </>
            ) : null}

            {/* Schedule summary — the trigger/scope/timing this reminder uses */}
            {reminderMode ? (
              <div className="rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Current schedule
                </p>
                <p className="mt-1.5 text-sm font-medium text-gray-800">
                  Sends {delayValue} {delayUnit === "hours" ? "hour" : "day"}
                  {delayValue === 1 ? "" : "s"} {trigger === "before" ? "before" : "after"} appointments
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  To {scopeName} — {delayHours} {trigger === "before" ? "before" : "after"} the start time
                </p>
              </div>
            ) : null}
          </div>

          {/* Right column — Live Preview */}
          <div>
            <div className="rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-5">
              <div className="mb-4 flex items-center gap-2">
                <svg className="size-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <h3 className="text-sm font-semibold text-gray-800">Live Preview</h3>
              </div>

              <div className="flex justify-center">
                <div className="relative w-[280px]">
                  <div className="rounded-[40px] bg-black p-2.5 shadow-2xl">
                    <div className="relative flex h-[500px] flex-col overflow-hidden rounded-[32px] bg-white">
                      {/* Status bar */}
                      <div className="flex-shrink-0 bg-[#1f1f1f] px-4 pb-1.5 pt-2">
                        <div className="flex items-center justify-between text-white" style={{ fontSize: 11 }}>
                          <span
                            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontWeight: 600 }}
                          >
                            9:41
                          </span>
                          <div className="flex items-center gap-1">
                            <svg className="h-2.5 w-3.5" viewBox="0 0 16 12" fill="white" aria-hidden="true">
                              <rect width="1.5" height="6" x="1" y="3" rx="0.5" />
                              <rect width="1.5" height="8" x="4" y="2" rx="0.5" />
                              <rect width="1.5" height="10" x="7" y="1" rx="0.5" />
                              <rect width="1.5" height="11" x="10" y="0.5" rx="0.5" />
                            </svg>
                            <svg className="h-3 w-3.5" viewBox="0 0 16 12" fill="white" aria-hidden="true">
                              <path d="M1 5.5C1 4.67 1.67 4 2.5 4h11c.83 0 1.5.67 1.5 1.5v3c0 .83-.67 1.5-1.5 1.5h-11C1.67 10 1 9.33 1 8.5v-3z" />
                              <rect x="14" y="5.5" width="1.5" height="3" rx="0.3" fill="white" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp header */}
                      <div className="flex flex-shrink-0 items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white">
                        <svg className="size-5" fill="white" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                        </svg>
                        <div
                          className="flex size-9 items-center justify-center rounded-full shadow-sm"
                          style={{ background: "linear-gradient(135deg, #0D9488 0%, #0F766E 100%)" }}
                        >
                          <span className="text-sm font-bold text-white">{initialsOf(clinicName)}</span>
                        </div>
                        <div className="flex-1">
                          <p
                            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 15, fontWeight: 500 }}
                          >
                            {clinicName}
                          </p>
                          <p style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
                            online
                          </p>
                        </div>
                        <svg className="size-5" fill="white" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                        </svg>
                      </div>

                      {/* Chat area */}
                      <div className="relative min-h-full flex-1 overflow-y-auto" style={{ backgroundColor: "#E5DDD5" }}>
                        <div
                          className="absolute inset-0"
                          aria-hidden="true"
                          style={{
                            backgroundImage:
                              "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
                            backgroundRepeat: "repeat",
                            backgroundSize: "270px auto",
                          }}
                        />
                        <div className="relative space-y-2 px-2.5 py-3">
                          <div className="flex justify-center">
                            <span
                              className="rounded-md bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur-sm"
                              style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                            >
                              TODAY
                            </span>
                          </div>
                          <div className="flex justify-start">
                            <div className="relative max-w-[85%]">
                              <div className="overflow-hidden rounded-lg rounded-tl-sm bg-white shadow-sm">
                                {headerType === "image" && headerImage.trim() && (
                                  <div className="border-b border-gray-100 bg-gray-50">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={headerImage.trim()}
                                      alt="Reminder header"
                                      className="h-36 w-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="px-2.5 py-2">
                                  <p
                                    style={{
                                      fontSize: 13.5,
                                      lineHeight: 1.45,
                                      color: "#111B21",
                                      fontFamily:
                                        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
                                      whiteSpace: "pre-wrap",
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    {hasHeader ? (
                                      <>
                                        <span className="font-semibold text-primary">
                                          {interpolate(templateHeader.trim(), clinicName)}
                                        </span>
                                        {"\n\n"}
                                        {previewBody}
                                      </>
                                    ) : (
                                      previewBody
                                    )}
                                  </p>
                                  <div className="mt-0.5 flex items-center justify-end gap-1">
                                    <span style={{ fontSize: 10, color: "#667781", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                                      9:41
                                    </span>
                                  </div>
                                </div>
                                <div className="border-t border-gray-100 bg-white px-2.5 py-2">
                                  <button
                                    type="button"
                                    className="flex w-full items-center justify-center gap-2 rounded-lg py-2 transition-all hover:bg-gray-50"
                                  >
                                    <svg className="size-4" fill="#00a884" viewBox="0 0 24 24" aria-hidden="true">
                                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                                    </svg>
                                    <span
                                      style={{ fontSize: 14, fontWeight: 500, color: "#00a884", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                                    >
                                      Directions
                                    </span>
                                  </button>
                                </div>
                              </div>
                              <svg className="absolute -left-1 top-0 h-4 w-2.5 text-white" viewBox="0 0 8 13" fill="currentColor" style={{ transform: "scaleX(-1)" }} aria-hidden="true">
                                <path d="M1.533 3.568L8.417.716c.428-.177.867.326.6.755L.6 13.097c-.282.45-.917.296-.977-.237L0 10.5c-.047-.41.155-.798.493-1.037L4.444 6c.287-.203.274-.633-.028-.809L1.534 3.568z" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex justify-center pt-1">
                            <span
                              className="max-w-[85%] rounded-md bg-white/90 px-2.5 py-1.5 text-center text-[10px] text-gray-600 shadow-sm backdrop-blur-sm"
                              style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                            >
                              Preview updates in real-time
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Input bar */}
                      <div className="flex flex-shrink-0 items-center gap-2 border-t border-gray-200 bg-[#f0f2f5] px-2 py-2">
                        <span className="rounded-full p-1.5 text-[#54656f]">
                          <svg className="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z" />
                          </svg>
                        </span>
                        <div
                          className="flex-1 rounded-full bg-white px-3 py-2 text-[14px] text-[#667781]"
                          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
                        >
                          Message
                        </div>
                        <span className="rounded-full p-1.5 text-[#54656f]">
                          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        </span>
                        <span className="flex size-9 items-center justify-center rounded-full" style={{ backgroundColor: "#00a884" }}>
                          <svg className="size-5 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885h-2z" />
                          </svg>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <p className="flex items-center text-xs text-gray-500">
            <CheckCircle2 className="mr-1.5 size-4 text-status-success" aria-hidden="true" />
            Changes preview in real-time
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-2 border-gray-200 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[#0F766E] px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:from-[#0C7A6F] hover:to-[#115E59] hover:shadow-xl"
            >
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <Save className="size-4" aria-hidden="true" />
                  {reminderMode ? "Save Reminder" : "Save Message"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}