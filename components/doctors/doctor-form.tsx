"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Pen,
  Phone,
  Plus,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";

import { ConsultationModePicker } from "@/components/booking/consultation-mode-picker";
import { SlotEditor } from "@/components/booking/slot-editor";
import {
  PreConsultationEditor,
  type PreConsultationEditorValue,
} from "@/components/pre-consultation-editor";
import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DetailModalHero } from "@/components/ui/detail-modal-hero";
import { FormTabs } from "@/components/ui/form-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DOCTOR_SPECIALTIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type {
  Doctor,
  DoctorSlotTemplate,
  DoctorVitalsConfig,
  PreConsultationQuestion,
} from "@/types/database";

type DoctorAction = (
  _prevState: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

function credentialsToText(credentials: string[] | null): string {
  return credentials?.join(", ") ?? "";
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type CustomVitalDraft = {
  id: string;
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  type: "numeric" | "text";
};

type StandardVitalGroupId = "basic" | "signs";

type StandardVitalDef = {
  key: string;
  label: string;
  unit: string;
  group: StandardVitalGroupId;
};

/** Standard vitals in canonical order, grouped per the Phase 20/22 design. */
const STANDARD_VITALS: StandardVitalDef[] = [
  { key: "height", label: "Height", unit: "cm", group: "basic" },
  { key: "weight", label: "Weight", unit: "kg", group: "basic" },
  { key: "bmi", label: "BMI", unit: "kg/m²", group: "basic" },
  {
    key: "blood_pressure",
    label: "Blood Pressure",
    unit: "mmHg",
    group: "signs",
  },
  { key: "pulse", label: "Pulse", unit: "bpm", group: "signs" },
  { key: "temperature", label: "Temperature", unit: "°F", group: "signs" },
  { key: "spo2", label: "SpO₂", unit: "%", group: "signs" },
  {
    key: "respiratory_rate",
    label: "Respiratory Rate",
    unit: "breaths/min",
    group: "signs",
  },
];

const STANDARD_VITAL_GROUPS: Array<{
  id: StandardVitalGroupId;
  label: string;
}> = [
  { id: "basic", label: "Basic Measurements" },
  { id: "signs", label: "Vital Signs" },
];

/**
 * Map pre-redesign configs (split systolic/diastolic BP) onto the single
 * Blood Pressure key so previously-saved selections still render correctly.
 */
function normalizeStandardKeys(keys: string[] | null): string[] {
  const seen = new Set<string>();
  for (const key of keys ?? []) {
    if (key === "systolic_bp" || key === "diastolic_bp") {
      seen.add("blood_pressure");
    } else {
      seen.add(key);
    }
  }
  return [...seen];
}

/** Clinical floor may upload photos/signatures; path is clinic-scoped by RLS. */
async function uploadDoctorMedia(
  clinicId: string,
  folder: "photo" | "signature",
  file: File,
): Promise<string> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const fileExt = file.name.split(".").pop() || "jpg";
  const fileName = `${clinicId}/${folder}-${Date.now()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage
    .from("website-images")
    .upload(fileName, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage
    .from("website-images")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

export function DoctorForm({
  action,
  doctor,
  clinicId,
  slotTemplates = [],
  vitalsConfig = null,
  preConsultQuestions = [],
  onDone,
}: {
  action: DoctorAction;
  doctor?: Doctor;
  clinicId: string;
  slotTemplates?: DoctorSlotTemplate[];
  vitalsConfig?: DoctorVitalsConfig | null;
  /** Existing active questions scoped to this doctor (Phase 22). */
  preConsultQuestions?: PreConsultationQuestion[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );
  const [photoUrl, setPhotoUrl] = useState(doctor?.photo_url ?? "");
  const [signatureUrl, setSignatureUrl] = useState(doctor?.signature_url ?? "");
  const [uploading, setUploading] = useState<"photo" | "signature" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // ---- Vitals configuration state ----------------------------------------
  const [standardVitals, setStandardVitals] = useState<string[]>(() => {
    const stored = vitalsConfig?.standard_vitals ?? null;
    return stored ? normalizeStandardKeys(stored) : STANDARD_VITALS.map((v) => v.key);
  });
  const [customVitals, setCustomVitals] = useState<CustomVitalDraft[]>(() =>
    (vitalsConfig?.custom_vitals ?? []).map((vital) => ({
      id: uid(),
      key: vital.key,
      label: vital.label,
      unit: vital.unit ?? "",
      placeholder: vital.placeholder ?? "",
      type: vital.type === "text" ? "text" : "numeric",
    })),
  );
  const [addingCustomVital, setAddingCustomVital] = useState(false);
  const [customVitalDraft, setCustomVitalDraft] = useState({
    label: "",
    unit: "",
    type: "numeric" as "numeric" | "text",
  });

  // ---- Tabbed layout (Phase 22) -------------------------------------------
  const [activeTab, setActiveTab] = useState<
    "details" | "availability" | "vitals"
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

  const [isVisible, setIsVisible] = useState(doctor?.is_visible ?? true);

  const isEdit = Boolean(doctor);
  const submitted = state !== null;
  const [consultationMode, setConsultationMode] = useState<
    "single_slot" | "shared_window"
  >(doctor?.consultation_mode ?? "single_slot");

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  async function handleUpload(
    kind: "photo" | "signature",
    file: File | undefined,
  ) {
    if (!file) return;
    setUploadError(null);
    setUploading(kind);
    try {
      const url = await uploadDoctorMedia(clinicId, kind, file);
      if (kind === "photo") setPhotoUrl(url);
      else setSignatureUrl(url);
    } catch {
      setUploadError("We couldn't upload that file. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  // ---- Vitals helpers ----------------------------------------------------
  function toggleStandard(key: string, checked: boolean) {
    setStandardVitals((prev) =>
      checked && !prev.includes(key)
        ? [...prev, key]
        : prev.filter((k) => k !== key),
    );
  }

  function openCustomVitalForm() {
    setCustomVitalDraft({ label: "", unit: "", type: "numeric" });
    setAddingCustomVital(true);
  }

  function addCustomVital() {
    const label = customVitalDraft.label.trim();
    if (!label) return;
    setCustomVitals((prev) => [
      ...prev,
      {
        id: uid(),
        key: label
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, ""),
        label,
        unit: customVitalDraft.unit.trim(),
        placeholder: "",
        type: customVitalDraft.type,
      },
    ]);
    setCustomVitalDraft({ label: "", unit: "", type: "numeric" });
    setAddingCustomVital(false);
  }

  function updateCustomVital(id: string, patch: Partial<CustomVitalDraft>) {
    setCustomVitals((prev) =>
      prev.map((vital) => (vital.id === id ? { ...vital, ...patch } : vital)),
    );
  }

  function removeCustomVital(id: string) {
    setCustomVitals((prev) => prev.filter((vital) => vital.id !== id));
  }

  const orderedStandard = STANDARD_VITALS.filter((vital) =>
    standardVitals.includes(vital.key),
  );
  const vitalsDisplayOrder = [
    ...orderedStandard.map((vital) => vital.key),
    ...customVitals.map((vital) => vital.key),
  ];
  const vitalsConfigJson = JSON.stringify([
    {
      standardVitals: orderedStandard.map((vital) => vital.key),
      customVitals: customVitals.map(
        ({ key, label, unit, placeholder, type }) => ({
          key,
          label,
          unit: unit || null,
          placeholder: placeholder || null,
          type,
        }),
      ),
      displayOrder: vitalsDisplayOrder,
    },
  ]);

  const preConsultationQuestionsJson = (() => {
    const duringRows = preConsult.duringBooking.enabled
      ? preConsult.duringBooking.rows
      : [];
    const afterRows = preConsult.afterBooking.enabled
      ? preConsult.afterBooking.rows
      : [];
    // display_order is unique per doctor in the DB (0-2). Renumber across BOTH
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
    id: "details" | "availability" | "vitals";
    label: string;
    icon: typeof User;
  }> = [
    { id: "details", label: "Details", icon: User },
    { id: "availability", label: "Availability & Slots", icon: CalendarClock },
    { id: "vitals", label: "Vitals Configuration", icon: Activity },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-secondary/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit doctor profile" : "Add a doctor"}
    >
      <form
        key={doctor?.id ?? "new"}
        action={formAction}
        noValidate
        className="relative my-8 flex max-h-[calc(100vh-4rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-2xl"
      >
        {/* Header — teal gradient with avatar + edit overlay per mockup */}
        <DetailModalHero onClose={onDone}>
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            aria-label="Upload doctor photo"
            className="group/avatar relative block h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-white/30 bg-white/20 transition-colors hover:bg-white/30"
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <User className="h-8 w-8 text-white" aria-hidden="true" />
              </span>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
              {uploading === "photo" ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-primary"
                  aria-hidden="true"
                />
              ) : (
                <Pen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              )}
            </span>
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">
              {isEdit ? "Edit Doctor Profile" : "Add a Doctor"}
            </h2>
            <p className="truncate text-xs text-white/80">
              {isEdit
                ? `Update ${doctor?.name}'s information and availability.`
                : "Set up profile, fees, slots and vitals in one place."}
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

            {doctor && <input type="hidden" name="doctorId" value={doctor.id} />}
            <input type="hidden" name="photoUrl" value={photoUrl} />
            <input type="hidden" name="signatureUrl" value={signatureUrl} />
            <input
              type="hidden"
              name="isVisible"
              value={isVisible ? "on" : "off"}
            />
            <input
              type="hidden"
              name="vitalsConfigJson"
              value={vitalsConfigJson}
            />
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-name">Doctor name</Label>
                  <Input
                    id="doctor-name"
                    name="name"
                    defaultValue={doctor?.name ?? ""}
                    placeholder="Dr. Amara Okafor"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-specialty">Specialty</Label>
                  <Input
                    id="doctor-specialty"
                    name="specialty"
                    list="doctor-specialties"
                    defaultValue={doctor?.specialty ?? ""}
                    placeholder="Pick or type a specialty"
                  />
                  <datalist id="doctor-specialties">
                    {DOCTOR_SPECIALTIES.map((specialty) => (
                      <option key={specialty} value={specialty} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-qualification">Qualification</Label>
                  <Input
                    id="doctor-qualification"
                    name="qualification"
                    defaultValue={doctor?.qualification ?? ""}
                    placeholder="MBBS, FCPS"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-experience">Years of experience</Label>
                  <Input
                    id="doctor-experience"
                    name="yearsOfExperience"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={doctor?.years_of_experience ?? ""}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Credentials & Description" icon={FileText} tone="slate">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-credentials">Credentials</Label>
                  <textarea
                    id="doctor-credentials"
                    name="credentialsText"
                    defaultValue={credentialsToText(doctor?.credentials ?? null)}
                    placeholder="MD, Board Certified — separate with commas or new lines"
                    rows={2}
                    className="flex min-h-[60px] w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-text-muted">
                    Shown on your website and booking surfaces.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="doctor-description">
                    Professional description
                  </Label>
                  <textarea
                    id="doctor-description"
                    name="professionalDescription"
                    defaultValue={doctor?.professional_description ?? ""}
                    placeholder="A short paragraph your patients will see on your website…"
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-control border border-text-muted/40 bg-surface px-3 py-2 text-sm text-text-primary transition-colors placeholder:text-text-muted hover:border-text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Contact & Registration" icon={Phone} tone="success">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-registration">
                    Medical registration no.
                  </Label>
                  <Input
                    id="doctor-registration"
                    name="registrationNumber"
                    defaultValue={doctor?.medical_registration_number ?? ""}
                    placeholder="PMDC / provincial number"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-phone">Phone</Label>
                  <Input
                    id="doctor-phone"
                    name="phone"
                    defaultValue={doctor?.phone ?? ""}
                    placeholder="+92 300 0000000"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="doctor-email">Email</Label>
                  <Input
                    id="doctor-email"
                    name="email"
                    type="email"
                    defaultValue={doctor?.email ?? ""}
                    placeholder="doctor@clinic.com"
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Photo & Signature" icon={ImagePlus} tone="indigo">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Photo</Label>
                  {photoUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl}
                        alt=""
                        className="h-14 w-14 rounded-full border border-primary/15 object-cover"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setPhotoUrl("")}
                      >
                        <X aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                          handleUpload("photo", event.target.files?.[0])
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={uploading !== null}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {uploading === "photo" ? (
                          <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                          <ImagePlus aria-hidden="true" />
                        )}
                        {uploading === "photo" ? "Uploading…" : "Upload photo"}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Signature (for prescriptions &amp; letters)</Label>
                  {signatureUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureUrl}
                        alt="Doctor's signature"
                        className="h-14 w-28 border border-primary/15 bg-white object-contain"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setSignatureUrl("")}
                      >
                        <X aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                          handleUpload("signature", event.target.files?.[0])
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={uploading !== null}
                        onClick={() => signatureInputRef.current?.click()}
                      >
                        {uploading === "signature" ? (
                          <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                          <ImagePlus aria-hidden="true" />
                        )}
                        {uploading === "signature"
                          ? "Uploading…"
                          : "Upload signature"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {uploadError && (
                <p className="mt-4 text-xs text-status-destructive">
                  {uploadError}
                </p>
              )}
            </SectionCard>

            <SectionCard title="Fees & Follow-up" icon={Wallet} tone="amber">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-fee">Consultation fee (Rs)</Label>
                  <Input
                    id="doctor-fee"
                    name="consultationFee"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={doctor?.consultation_fee ?? ""}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-followup-fee">Follow-up fee (Rs)</Label>
                  <Input
                    id="doctor-followup-fee"
                    name="followUpFee"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={doctor?.follow_up_fee ?? ""}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="doctor-followup-valid">
                    Free follow-up within
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="doctor-followup-valid"
                      name="followUpValidFor"
                      type="number"
                      min={1}
                      max={730}
                      defaultValue={doctor?.follow_up_valid_for ?? ""}
                      placeholder="e.g. 7"
                      className="w-24"
                    />
                    <NativeSelect
                      name="followUpPeriod"
                      defaultValue={doctor?.follow_up_period ?? "days"}
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-text-primary">
                    How do you see patients?
                  </p>
                  <ConsultationModePicker
                    value={consultationMode}
                    onChange={setConsultationMode}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="doctor-window-capacity">
                      Patients per window
                    </Label>
                    <Input
                      id="doctor-window-capacity"
                      name="maxPatientsPerWindow"
                      type="number"
                      min={1}
                      max={50}
                      defaultValue={doctor?.max_patients_per_window ?? 1}
                    />
                    <p className="text-xs text-text-muted">
                      Used when the doctor books shared time windows.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Delivery modes</Label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(["offline", "both", "online"] as const).map((mode) => (
                        <label
                          key={mode}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                            "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary",
                            "border-text-muted/40 text-text-secondary hover:border-primary/40",
                          )}
                        >
                          <input
                            type="radio"
                            name="doctorConsultationType"
                            value={mode}
                            defaultChecked={
                              doctor
                                ? doctor.consultation_type === mode
                                : mode === "offline"
                            }
                            className="hidden"
                          />
                          <span className="capitalize">{mode}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-control border border-primary/15 bg-surface px-4 py-3">
                  <span className="text-sm font-medium text-text-primary">
                    Offer this doctor for new bookings
                  </span>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={setIsVisible}
                    aria-label="Offer this doctor for new bookings"
                  />
                </div>
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

          {/* Vitals */}
          <div
            className={cn(
              "tab-fade-in space-y-5 px-5 py-5",
              activeTab !== "vitals" && "hidden",
            )}
          >
            <SectionCard title="Vitals Configuration" icon={Activity} tone="teal">
              <div className="space-y-5">
                <p className="text-sm text-text-secondary">
                  Choose the vitals recorded during check-in for this doctor.
                  Unchecked standard vitals and custom fields are hidden.
                </p>

                {STANDARD_VITAL_GROUPS.map((group) => (
                  <div key={group.id} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      {group.label}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {STANDARD_VITALS.filter((vital) => vital.group === group.id).map(
                        (vital) => (
                          <label
                            key={vital.key}
                            className="flex cursor-pointer items-center gap-3 rounded-control border border-primary/15 bg-surface px-3 py-2 transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                          >
                            <input
                              type="checkbox"
                              checked={standardVitals.includes(vital.key)}
                              onChange={(event) =>
                                toggleStandard(vital.key, event.target.checked)
                              }
                              className="peer sr-only"
                            />
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-text-muted/40 transition-colors peer-checked:border-primary peer-checked:bg-primary">
                              <Check
                                className="h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                                aria-hidden="true"
                              />
                            </span>
                            <span className="text-sm font-medium text-text-primary">
                              {vital.label}{" "}
                              <span className="font-normal text-text-muted">
                                ({vital.unit})
                              </span>
                            </span>
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                ))}

                <div className="space-y-3 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Custom Vitals
                  </p>

                  {customVitals.length === 0 ? (
                    <div className="rounded-control border border-dashed border-text-muted/30 bg-app/40 px-4 py-6 text-center">
                      <p className="text-sm text-text-secondary">
                        No custom vitals configured.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customVitals.map((vital) => (
                        <div
                          key={vital.id}
                          className="flex flex-wrap items-center gap-2 rounded-control border border-primary/15 bg-app/50 px-3 py-2"
                        >
                          <Input
                            value={vital.label}
                            onChange={(event) =>
                              updateCustomVital(vital.id, {
                                label: event.target.value,
                                key: event.target.value
                                  .toLowerCase()
                                  .trim()
                                  .replace(/[^a-z0-9]+/g, "_")
                                  .replace(/^_+|_+$/g, ""),
                              })
                            }
                            placeholder="Label (e.g. Grip Strength)"
                            className="w-44"
                          />
                          <Input
                            value={vital.unit}
                            onChange={(event) =>
                              updateCustomVital(vital.id, {
                                unit: event.target.value,
                              })
                            }
                            placeholder="Unit (kg, cm…)"
                            className="w-32"
                          />
                          <NativeSelect
                            value={vital.type}
                            onChange={(event) =>
                              updateCustomVital(vital.id, {
                                type: event.target.value as "numeric" | "text",
                              })
                            }
                            className="w-32"
                            aria-label="Custom vital value type"
                          >
                            <option value="numeric">Numeric</option>
                            <option value="text">Text</option>
                          </NativeSelect>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => removeCustomVital(vital.id)}
                            aria-label={`Remove ${vital.label || "custom vital"}`}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!addingCustomVital ? (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={openCustomVitalForm}
                    >
                      <Plus aria-hidden="true" />
                      Add Custom Vital
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-control border border-primary/20 bg-surface p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Custom Vitals
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="custom-vital-label">Field Name</Label>
                        <Input
                          id="custom-vital-label"
                          value={customVitalDraft.label}
                          onChange={(event) =>
                            setCustomVitalDraft((prev) => ({
                              ...prev,
                              label: event.target.value,
                            }))
                          }
                          placeholder="e.g. Grip Strength"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="custom-vital-unit">Unit</Label>
                        <Input
                          id="custom-vital-unit"
                          value={customVitalDraft.unit}
                          onChange={(event) =>
                            setCustomVitalDraft((prev) => ({
                              ...prev,
                              unit: event.target.value,
                            }))
                          }
                          placeholder="kg, cm…"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="custom-vital-type">Type</Label>
                        <NativeSelect
                          id="custom-vital-type"
                          value={customVitalDraft.type}
                          onChange={(event) =>
                            setCustomVitalDraft((prev) => ({
                              ...prev,
                              type: event.target.value as "numeric" | "text",
                            }))
                          }
                        >
                          <option value="numeric">Numeric</option>
                          <option value="text">Text</option>
                        </NativeSelect>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={addCustomVital}
                          disabled={!customVitalDraft.label.trim()}
                        >
                          <Plus aria-hidden="true" />
                          Add Custom Vital
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => setAddingCustomVital(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
              {isEdit ? "Update Doctor" : "Add Doctor"}
            </SubmitButton>
          </div>
        </div>
      </form>
    </div>
  );
}