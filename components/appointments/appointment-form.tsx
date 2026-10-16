"use client";

import { useActionState, useCallback, useEffect, useMemo, useOptimistic, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  GitMerge,
  Loader2,
  MapPin,
  Phone,
  Shield,
  Siren,
  UserPlus,
  Users,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { MergePatientModal } from "@/components/patients/merge-patient-modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { createAppointmentAction, fetchAvailableSlots, updateAppointmentAction } from "@/lib/actions/appointments";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { Doctor, Patient, Service } from "@/types/database";

function formatSlotTime(naive: string): string {
  const time = naive.split("T")[1];
  if (!time) return naive;
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * The booking the user just submitted, shown immediately while the server action
 * is in flight (React's `useOptimistic`). It is a receipt of intent, not of
 * success: it clears automatically when the action settles, so a rejection
 * replaces it with the error alert and a success closes the modal.
 */
type OptimisticBooking = {
  patientName: string;
  serviceName: string;
  when: string | null;
};

export function AppointmentForm({
  patients,
  services,
  doctors,
  emergency: initialEmergency,
  initialServiceId,
  initialValues,
  canMerge,
  onClose,
}: {
  patients: Patient[];
  services: Service[];
  doctors: Pick<Doctor, "id" | "name">[];
  emergency?: boolean;
  initialServiceId?: string;
  /**
   * Renders the duplicate-merge entry point beside the existing-patient picker.
   * The front desk books walk-ins from this modal, and that is exactly where a
   * duplicate surfaces — the phone number already belongs to someone else, or
   * the search turns up two profiles for one person. Gated by the caller, which
   * passes the same role boolean the server action enforces.
   */
  canMerge?: boolean;
  initialValues?: {
    appointmentId: string;
    patientId: string;
    patientName: string;
    patientPhone: string | null;
    patientAge: string;
    patientGender: "male" | "female" | "other" | "unknown" | "";
    patientCity: string | null;
    whatsapp: string | null;
    allergies: string | null;
    conditions: string | null;
    serviceId: string;
    doctorId: string | null;
    startNaive: string;
    consultationType: "in_clinic" | "online" | "video";
    notes: string | null;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const isEditing = !!initialValues;

  // Optimistic booking receipt — populated inside the create action below and
  // discarded automatically when that action settles.
  const [optimisticBooking, addOptimisticBooking] =
    useOptimistic<OptimisticBooking | null>(null);

  // Form state
  const [patientMode, setPatientMode] = useState<"existing" | "new">(
    initialValues ? "existing" : "new",
  );
  const [selectedPatientId, setSelectedPatientId] = useState(
    initialValues?.patientId ?? "",
  );
  const [phone, setPhone] = useState(initialValues?.patientPhone ?? "");
  const [name, setName] = useState(initialValues?.patientName ?? "");
  const [age, setAge] = useState(initialValues?.patientAge ?? "");
  const [gender, setGender] = useState<"male" | "female" | "other" | "unknown" | "">(
    initialValues?.patientGender ?? "",
  );
  const [city, setCity] = useState(initialValues?.patientCity ?? "");
  const [whatsapp, setWhatsapp] = useState(initialValues?.whatsapp ?? "");
  const [allergies, setAllergies] = useState(initialValues?.allergies ?? "");
  const [conditions, setConditions] = useState(
    initialValues?.conditions ?? "",
  );
  const [bookingSource, setBookingSource] = useState<"dashboard" | "phone_call">("dashboard");

  const [serviceId, setServiceId] = useState(
    initialValues?.serviceId ?? initialServiceId ?? "",
  );
  const [doctorId, setDoctorId] = useState(initialValues?.doctorId ?? "");
  const [selectedDate, setSelectedDate] = useState(
    initialValues?.startNaive?.slice(0, 10) ?? "",
  );
  const [consultationType, setConsultationType] = useState<"in_clinic" | "online" | "video">(
    initialValues?.consultationType ?? "in_clinic",
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [emergency, setEmergency] = useState(initialEmergency ?? false);

  // The merge overlay opened from the patient picker. `null` = closed; the
  // object carries the record the user pointed at, which becomes the surviving
  // profile unless they use the modal's swap control.
  const [mergePrimary, setMergePrimary] = useState<{
    id: string;
    name: string;
    patient_code: string | null;
  } | null>(null);

  // Time slot state
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(
    initialValues?.startNaive ?? "",
  );
  const [slotError, setSlotError] = useState("");

  // The create action is wrapped so the optimistic receipt is registered inside
  // the same transition as the server call. `useActionState` keeps the original
  // pending/error/success contract; only the create path gains the receipt.
  const runCreateAppointment = async (
    prev: ActionResult<string> | null,
    formData: FormData,
  ) => {
    const service = services.find((s) => s.id === serviceId);
    const timeLabel = selectedSlot ? formatSlotTime(selectedSlot) : "";
    const when = [selectedDate, timeLabel].filter(Boolean).join(" · ") || null;
    addOptimisticBooking({
      patientName: name.trim() || "New patient",
      serviceName: service?.name ?? "Consultation",
      when,
    });
    return createAppointmentAction(prev, formData);
  };

  const [state, formAction] = useActionState<ActionResult<string> | null, FormData>(
    isEditing ? updateAppointmentAction : runCreateAppointment,
    null,
  );

  const submitted = state !== null;

  // Close modal on success
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  // Phone analysis — live 11-digit validation + existing-patient lookup.
  const phoneDigits = phone.replace(/\D/g, "");
  const phoneHasValue = phone.trim().length > 0;
  const phoneComplete = phoneDigits.length === 11;
  const phoneTooLong = phoneDigits.length > 11;
  const phoneMatch = useMemo(
    () =>
      patients.find(
        (p) => p.phone && p.phone.replace(/\D/g, "") === phoneDigits,
      ) ?? null,
    [patients, phoneDigits],
  );
  const phoneInvalid = phoneHasValue && (!phoneComplete || phoneTooLong);

  type PhoneHint =
    | { tone: "error"; text: string }
    | { tone: "info"; text: string }
    | { tone: "success"; text: string };
  const phoneHint: PhoneHint | null =
    !phoneHasValue
      ? null
      : !phoneComplete
        ? {
            tone: "error",
            text: `Please enter 11 digit mobile number (${phoneDigits.length}/11)`,
          }
        : phoneTooLong
          ? {
              tone: "error",
              text: "Invalid mobile number — must be exactly 11 digits",
            }
          : phoneMatch
            ? {
                tone: "success",
                text: `Existing patient: ${phoneMatch.name}`,
              }
            : {
                tone: "info",
                text: "New patient — details will be saved on booking",
              };

  // Live attach: while in new-patient mode, a full 11-digit number that
  // matches a known patient links that patient and prefills their details.
  useEffect(() => {
    if (patientMode !== "new") return;
    if (phoneComplete && phoneMatch) {
      setSelectedPatientId(phoneMatch.id);
      setPatientMode("existing");
      setName(phoneMatch.name);
      setAge(phoneMatch.age?.toString() ?? "");
      setGender(phoneMatch.gender ?? "");
      setCity(phoneMatch.city ?? "");
      setWhatsapp(phoneMatch.whatsapp_number ?? "");
      setAllergies(phoneMatch.known_allergies ?? "");
      setConditions(phoneMatch.medical_conditions ?? "");
    }
  }, [patientMode, phoneComplete, phoneMatch]);

  // Auto-fill age from DOB when selecting existing patient
  const handlePatientSelect = useCallback(
    (patientId: string) => {
      setSelectedPatientId(patientId);
      const patient = patients.find((p) => p.id === patientId);
      if (patient) {
        setPhone(patient.phone ?? "");
        setName(patient.name);
        setAge(patient.age?.toString() ?? "");
        setGender(patient.gender ?? "");
        setCity(patient.city ?? "");
        setWhatsapp(patient.whatsapp_number ?? "");
        setAllergies(patient.known_allergies ?? "");
        setConditions(patient.medical_conditions ?? "");
      }
    },
    [patients],
  );

  // A merge rewrites identities: the record this form had selected can turn out
  // to be the one that was archived. Re-point at the survivor and re-prefill
  // from it, so the booking goes through against a live profile instead of
  // failing on an id that just left the directory.
  const handleMerged = useCallback(
    (survivingPatientId: string) => {
      setSelectedPatientId(survivingPatientId);
      setPatientMode("existing");
      const survivor = patients.find((p) => p.id === survivingPatientId);
      if (!survivor) return;
      setPhone(survivor.phone ?? "");
      setName(survivor.name);
      setAge(survivor.age?.toString() ?? "");
      setGender(survivor.gender ?? "");
      setCity(survivor.city ?? "");
      setWhatsapp(survivor.whatsapp_number ?? "");
      setAllergies(survivor.known_allergies ?? "");
      setConditions(survivor.medical_conditions ?? "");
    },
    [patients],
  );

  // Auto-select doctor when there's exactly one
  const effectiveDoctorId =
    doctorId || (doctors.length === 1 ? doctors[0].id : "");

  // Auto-select the service's dedicated doctor (services.doctor_id) whenever
  // the chosen service is tied to one, so the required Doctor field is always
  // pre-filled. The user can still switch to any other doctor — any doctor in
  // the clinic can cover a service.
  useEffect(() => {
    if (isEditing) return;
    const service = services.find((s) => s.id === serviceId);
    if (service?.doctor_id) {
      setDoctorId(service.doctor_id);
    }
  }, [isEditing, serviceId, services]);

  // Fetch available slots when doctor + date + service are all selected
  useEffect(() => {
    if (!serviceId || !selectedDate || !effectiveDoctorId) {
      setSlots([]);
      setSelectedSlot("");
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlotError("");
    fetchAvailableSlots(serviceId, selectedDate, effectiveDoctorId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setSlots(result.slots);
          setSelectedSlot("");
        } else {
          setSlots([]);
          setSlotError(result.message ?? "Could not load available slots.");
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [serviceId, selectedDate, effectiveDoctorId]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={formAction}
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        // Set the hidden start field from the selected slot
        if (selectedSlot) {
          const startInput = e.currentTarget.querySelector<HTMLInputElement>(
            'input[name="start"]',
          );
          if (startInput) startInput.value = selectedSlot;
        }
      }}
    >
      {submitted && !state.ok && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {/* Optimistic receipt — the booking the user just submitted, shown
          immediately while the server confirms. Clears on settle. */}
      {!isEditing && optimisticBooking && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-control border border-brand-sage bg-brand-wash px-3 py-2 text-xs text-brand-ink"
        >
          <Loader2
            className="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-brand-cta"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold">Booking {optimisticBooking.patientName}</span>
            {" — "}
            {optimisticBooking.serviceName}
            {optimisticBooking.when ? ` · ${optimisticBooking.when}` : ""}
            <span className="text-brand-muted"> · confirming…</span>
          </span>
        </div>
      )}

      {/* Hidden start field — populated from selected slot */}
      <input type="hidden" name="start" value={selectedSlot} />
      {isEditing && (
        <input type="hidden" name="appointmentId" value={initialValues!.appointmentId} />
      )}
      <input type="hidden" name="patientId" value={selectedPatientId} />
      <input type="hidden" name="doctorId" value={effectiveDoctorId} />
      <input type="hidden" name="consultationType" value={consultationType} />
      <input type="hidden" name="bookingSource" value={bookingSource} />
      {emergency && <input type="hidden" name="emergencyMode" value="true" />}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: Patient Information ──────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-brand-line pb-2">
            <Users className="h-4 w-4 text-brand-cta" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-brand-ink">
              Patient Information
            </h3>
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-phone" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Phone Number <span className="text-brand-danger">*</span>
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-faint" aria-hidden="true" />
              <Input
                id="appt-phone"
                name="patientPhone"
                type="tel"
                placeholder="11-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required={patientMode === "new"}
                className="pl-9 aria-[invalid=true]:focus:border-status-destructive aria-[invalid=true]:focus:ring-status-destructive/30"
                aria-invalid={phoneInvalid || undefined}
                autoComplete="tel"
              />
            </div>
            {phoneHint ? (
              <p
                className={cn(
                  "flex items-start gap-1.5 text-xs font-medium",
                  phoneHint.tone === "error" && "text-status-destructive",
                  phoneHint.tone === "info" && "text-status-info",
                  phoneHint.tone === "success" && "text-status-success",
                )}
                role={phoneHint.tone === "error" ? "alert" : "status"}
              >
                {phoneHint.tone === "error" ? (
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : phoneHint.tone === "success" ? (
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <UserPlus className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{phoneHint.text}</span>
              </p>
            ) : (
              <p className="text-xs text-brand-faint">
                Used to look up existing patients
              </p>
            )}
            {phoneHint?.tone === "success" && phoneMatch && (
              <div className="flex items-center gap-2 rounded-control border border-status-success/30 bg-status-success/5 px-3 py-2">
                <div className="min-w-0 flex-1 text-xs text-brand-ink">
                  <span className="font-semibold">{phoneMatch.name}</span>
                  {phoneMatch.age != null && (
                    <span className="text-brand-muted"> · {phoneMatch.age}</span>
                  )}
                  {phoneMatch.gender && (
                    <span className="text-brand-muted"> · {phoneMatch.gender}</span>
                  )}
                  <span className="block text-brand-muted">
                    Linked to this patient — details filled in above
                  </span>
                </div>
                <Users className="h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-name" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Full Name <span className="text-brand-danger">*</span>
            </Label>
            <Input
              id="appt-name"
              name="patientName"
              placeholder="Patient full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          {/* Age + Gender */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="appt-age" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
                Patient Age <span className="text-brand-danger">*</span>
              </Label>
              <Input
                id="appt-age"
                name="patientAge"
                type="number"
                min={0}
                max={150}
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
                Gender <span className="text-brand-danger">*</span>
              </Label>
              <input type="hidden" name="patientGender" value={gender} />
              <div className="flex gap-1">
                {(["male", "female", "other", "unknown"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={cn(
                      "flex-1 rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors",
                      gender === g
                        ? "border-brand-cta bg-brand-wash text-brand-cta"
                        : "border-brand-line bg-surface text-brand-muted hover:border-brand-sage",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-city" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              City
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-faint" aria-hidden="true" />
              <Input
                id="appt-city"
                name="patientCity"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* WhatsApp Number */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-whatsapp" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              WhatsApp Number
            </Label>
            <Input
              id="appt-whatsapp"
              name="whatsappNumber"
              type="tel"
              placeholder="Optional"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
            <p className="text-xs text-brand-faint">
              Leave empty to use phone number for WhatsApp
            </p>
          </div>

          {/* Known Allergies */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-allergies" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Known Allergies
            </Label>
            <textarea
              id="appt-allergies"
              name="knownAllergies"
              placeholder="e.g. Penicillin, Peanuts (optional)"
              rows={2}
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              className="flex w-full rounded-lg border border-brand-line bg-surface px-3 py-2 text-sm text-brand-ink placeholder:text-brand-faint transition-colors hover:border-brand-sage focus:border-brand-cta focus:outline-none focus:ring-2 focus:ring-brand-sage"
            />
          </div>

          {/* Medical Conditions */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-conditions" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Medical Conditions
            </Label>
            <textarea
              id="appt-conditions"
              name="medicalConditions"
              placeholder="e.g. Diabetes, Hypertension (optional)"
              rows={2}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              className="flex w-full rounded-lg border border-brand-line bg-surface px-3 py-2 text-sm text-brand-ink placeholder:text-brand-faint transition-colors hover:border-brand-sage focus:border-brand-cta focus:outline-none focus:ring-2 focus:ring-brand-sage"
            />
          </div>

          {/* Booking Source */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Booking Source
            </Label>
            <div className="flex gap-1">
              {[
                { value: "dashboard" as const, label: "Dashboard" },
                { value: "phone_call" as const, label: "Phone Call" },
              ].map((src) => (
                <button
                  key={src.value}
                  type="button"
                  onClick={() => setBookingSource(src.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    bookingSource === src.value
                      ? "border-brand-cta bg-brand-wash text-brand-cta"
                      : "border-brand-line bg-surface text-brand-muted hover:border-brand-sage",
                  )}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Mode Toggle */}
          <button
            type="button"
            onClick={() =>
              setPatientMode((m) => (m === "existing" ? "new" : "existing"))
            }
            className="flex items-center gap-1.5 text-xs font-medium text-brand-cta hover:text-brand-cta transition-colors"
          >
            {patientMode === "existing" ? (
              <>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Enter as new patient
              </>
            ) : (
              <>
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Select existing patient
              </>
            )}
          </button>

          {patientMode === "existing" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="appt-patient-select" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
                  Select Patient
                </Label>
                {/* Duplicate repair, at the counter. Opens above this modal so
                    a half-filled booking survives the detour. */}
                {canMerge && (
                  <button
                    type="button"
                    onClick={() => {
                      const picked = patients.find(
                        (p) => p.id === selectedPatientId,
                      );
                      if (!picked) return;
                      setMergePrimary({
                        id: picked.id,
                        name: picked.name,
                        patient_code: picked.patient_code,
                      });
                    }}
                    disabled={!selectedPatientId}
                    title={
                      selectedPatientId
                        ? "Merge this record with a duplicate"
                        : "Pick a patient first, then merge a duplicate into them"
                    }
                    className="inline-flex items-center gap-1.5 rounded-control border border-brand-line px-2.5 py-1.5 text-[11.5px] font-semibold text-brand-cta transition-colors hover:border-brand-sage hover:bg-brand-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sage disabled:pointer-events-none disabled:opacity-40"
                  >
                    <GitMerge aria-hidden="true" className="size-3.5" />
                    Merge Duplicate
                  </button>
                )}
              </div>
              <NativeSelect
                id="appt-patient-select"
                name="patientId"
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  handlePatientSelect(e.target.value);
                }}
              >
                <option value="">Choose a patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {/* New-patient mode has no picker, but a duplicate is *most* likely to
              be noticed here: the moment a full phone number matches someone,
              this is the receptionist's chance to fold the two profiles together
              before booking a third. */}
          {canMerge && patientMode === "new" && (
            <button
              type="button"
              onClick={() => {
                const seed = phoneMatch ?? patients[0] ?? null;
                if (!seed) return;
                setMergePrimary({
                  id: seed.id,
                  name: seed.name,
                  patient_code: seed.patient_code,
                });
              }}
              disabled={patients.length === 0}
              title={
                phoneMatch
                  ? `Merge ${phoneMatch.name} with a duplicate`
                  : "Find two records for the same person and merge them"
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-cta transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sage disabled:pointer-events-none disabled:opacity-40"
            >
              <GitMerge aria-hidden="true" className="size-3.5" />
              {phoneMatch
                ? `Duplicate record? Merge “${phoneMatch.name}”`
                : "Merge a duplicate patient record"}
            </button>
          )}
        </div>

        {/* ── Right: Appointment Details ──────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-brand-line pb-2">
            <Calendar className="h-4 w-4 text-brand-cta" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-brand-ink">
              Appointment Details
            </h3>
          </div>

          {/* Select Service */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-service" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Service <span className="text-brand-danger">*</span>
            </Label>
            <NativeSelect
              id="appt-service"
              name="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required={!emergency}
            >
              <option value="">Choose a service…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_minutes} min
                  {s.price > 0 ? ` · $${s.price}` : ""}
                </option>
              ))}
            </NativeSelect>
            {emergency && !serviceId && (
              <p className="text-xs text-brand-faint">
                Left empty — booked as walk-in consultation
              </p>
            )}
          </div>

          {/* Select Doctor — always shown */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-doctor" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Select Doctor <span className="text-brand-danger">*</span>
            </Label>
            <NativeSelect
              id="appt-doctor"
              name="doctorId"
              value={effectiveDoctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              required={!emergency}
            >
              <option value="">Choose a doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Appointment Date */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-date" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Appointment Date <span className="text-brand-danger">*</span>
            </Label>
            <Input
              id="appt-date"
              type="date"
              min={today}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
            />
          </div>

          {/* Time Slot — Dropdown */}
          <div className="space-y-1.5">
            <Label htmlFor="appt-slot" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Time Slot <span className="text-brand-danger">*</span>
            </Label>
            <NativeSelect
              id="appt-slot"
              name="slot"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={slotsLoading}
              required={!emergency}
            >
              <option value="">
                {slotsLoading
                  ? "Loading available slots…"
                  : !serviceId || !selectedDate || !effectiveDoctorId
                    ? "Select service, doctor and date to see slots"
                    : slots.length === 0
                      ? "No available slots"
                      : "Choose a time slot…"}
              </option>
              {!slotsLoading &&
                slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {formatSlotTime(slot)}
                  </option>
                ))}
            </NativeSelect>
            {slotError && (
              <p className="text-xs text-status-destructive">{slotError}</p>
            )}
          </div>

          {/* Consultation Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
              Consultation Type <span className="text-brand-danger">*</span>
            </Label>
            <div className="flex gap-1">
              {([
                { value: "in_clinic" as const, label: "In-Clinic Visit" },
                { value: "online" as const, label: "Online" },
                { value: "video" as const, label: "Video" },
              ]).map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => setConsultationType(ct.value)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                    consultationType === ct.value
                      ? "border-brand-cta bg-brand-wash text-brand-cta"
                      : "border-brand-line bg-surface text-brand-muted hover:border-brand-sage",
                  )}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="appt-notes" className="text-xs font-semibold uppercase tracking-wider text-brand-faint">
                Additional Notes
              </Label>
              <span className="text-xs text-brand-faint">
                {notes.length}/1000
              </span>
            </div>
            <textarea
              id="appt-notes"
              name="notes"
              placeholder="This information will help the doctor prepare for the appointment."
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-lg border border-brand-line bg-surface px-3 py-2 text-sm text-brand-ink placeholder:text-brand-faint transition-colors hover:border-brand-sage focus:border-brand-cta focus:outline-none focus:ring-2 focus:ring-brand-sage"
            />
          </div>

          {/* Emergency Toggle */}
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              emergency
                ? "border-brand-danger bg-brand-danger-soft"
                : "border-brand-line hover:border-brand-sage",
            )}
          >
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => setEmergency(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            <span className="flex items-start gap-1.5">
              <Siren
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-danger"
              />
              <span>
                <span className="block text-sm font-medium text-brand-ink">
                  Emergency Mode
                </span>
                <span className="block text-xs text-brand-muted">
                  Rapid walk-in intake: only the patient is required. Service,
                  doctor and details can be filled in later.
                </span>
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-brand-line pt-4">
        <div className="flex items-center gap-2 text-xs text-brand-faint">
          <Shield className="h-3.5 w-3.5 text-brand-cta" aria-hidden="true" />
          Your data is secure and encrypted
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <SubmitButton loadingText={isEditing ? "Saving…" : "Booking…"}>
            {isEditing ? "Save Changes" : "Book Consultation"}
          </SubmitButton>
        </div>
      </div>

      {/* Rendered as this form's last child so it stacks above it; it captures
          Escape before the surrounding BookingModal can, so only the merge step
          closes and the half-filled booking stays put. */}
      {mergePrimary && (
        <MergePatientModal
          primary={mergePrimary}
          onClose={() => setMergePrimary(null)}
          onMerged={handleMerged}
        />
      )}
    </form>
  );
}
