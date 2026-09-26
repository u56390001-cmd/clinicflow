"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { SubmitButton } from "@/components/auth/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/types";
import type { Patient } from "@/types/database";

type PatientAction = (
  _prevState: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

const GENDER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** Shared input chrome (no padding: Age/DOB use a tighter padding). */
const inputBase = cn(
  "w-full rounded-xl border border-gray-300 bg-white text-gray-800",
  "placeholder-gray-400 transition-all duration-200",
  "focus:border-[#4E5DB5] focus:outline-none focus:ring-2 focus:ring-[#4E5DB5]/20",
);

function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function TagInput({
  name,
  initial,
  placeholder,
  hint,
  containerClassName,
  inputClassName,
  chipClassName,
}: {
  name: string;
  initial: string | null | undefined;
  placeholder: string;
  hint: string;
  containerClassName: string;
  inputClassName: string;
  chipClassName: string;
}) {
  const [tags, setTags] = useState<string[]>(() => splitTags(initial));
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setDraft("");
  }

  function removeTag(index: number) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <>
      <input type="hidden" name={name} value={tags.join(", ")} />
      <div className={cn("rounded-[10px] p-[10px_12px]", containerClassName)}>
        <div className="mb-0 flex flex-wrap gap-1.5">
          {tags.map((tag, index) => (
            <button
              key={tag}
              type="button"
              onClick={() => removeTag(index)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white transition-opacity hover:opacity-80",
                chipClassName,
              )}
            >
              {tag}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(draft);
              } else if (e.key === "Backspace" && !draft && tags.length > 0) {
                removeTag(tags.length - 1);
              }
            }}
            onBlur={() => addTag(draft)}
            placeholder={placeholder}
            className={cn(
              "w-full rounded-lg px-[10px] py-[7px] text-[12.5px] outline-none",
              inputClassName,
            )}
          />
          <div className="mt-1 text-[11px] text-gray-400">{hint}</div>
        </div>
      </div>
    </>
  );
}

export function PatientForm({
  action,
  patient,
  onDone,
}: {
  action: PatientAction;
  patient?: Patient;
  onDone: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  );

  const isEdit = Boolean(patient);
  const submitted = state !== null;

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form
      key={patient?.id ?? "new"}
      action={formAction}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      {submitted && !state.ok && (
        <div className="p-5">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      )}

      {patient && <input type="hidden" name="patientId" value={patient.id} />}
      {/* Email + notes aren't in the reference layout but are still part of the
          schema; carry them through untouched on edit. */}
      <input type="hidden" name="email" value={patient?.email ?? ""} />
      <input type="hidden" name="notes" value={patient?.notes ?? ""} />

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
        <div className="p-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ── Basic Information ─────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-2">
                <h3 className="mb-0 flex items-center text-lg font-semibold text-gray-900">
                  <div className="mr-3 rounded-lg bg-[#5260B5]/10 p-2">
                    <UserRound aria-hidden="true" className="h-5 w-5 text-[#5260B5]" strokeWidth={2} />
                  </div>
                  Basic Information
                </h3>
              </div>

              <div className="space-y-5">
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-name">
                    Full Name <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <UserRound aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={2} />
                    <input
                      id="patient-name"
                      name="name"
                      type="text"
                      defaultValue={patient?.name ?? ""}
                      placeholder="Enter patient's full name"
                      required
                      autoComplete="off"
                      className={cn(inputBase, "px-4 py-3.5 pl-12")}
                    />
                  </div>
                </div>

                {/* Age — or — Date of birth */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="mb-1.5 block text-sm font-semibold text-gray-800" htmlFor="patient-age">
                      Age <span className="text-red-500">*</span>
                    </Label>
                    <input
                      id="patient-age"
                      name="age"
                      type="number"
                      defaultValue={patient?.age?.toString() ?? ""}
                      placeholder="e.g. 32"
                      required
                      min={0}
                      max={150}
                      className={cn(
                        inputBase,
                        "px-3 py-2.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                      )}
                    />
                  </div>

                  <div className="flex flex-col items-center pt-4">
                    <div className="h-3 w-px bg-gray-200" />
                    <span className="my-0.5 text-xs font-medium text-gray-400">or</span>
                    <div className="h-3 w-px bg-gray-200" />
                  </div>

                  <div className="flex-1">
                    <Label className="mb-1.5 block text-[13px] font-semibold text-gray-800" htmlFor="patient-dob">
                      Date of Birth{" "}
                      <span className="text-[11px] font-normal text-gray-400">(Optional)</span>
                    </Label>
                    <DateOfBirthInput defaultValue={patient?.date_of_birth ?? ""} />
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-phone">
                    Phone Number <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Phone aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.6} />
                    <input
                      id="patient-phone"
                      name="phone"
                      type="tel"
                      defaultValue={patient?.phone ?? ""}
                      placeholder="10-digit mobile number"
                      required
                      maxLength={10}
                      autoComplete="off"
                      className={cn(inputBase, "px-4 py-3.5 pl-12")}
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-gender">
                    Gender <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <select
                      id="patient-gender"
                      name="gender"
                      defaultValue={patient?.gender ?? ""}
                      className={cn(inputBase, "cursor-pointer appearance-none px-4 py-3.5 pr-10")}
                    >
                      <option value="" disabled>
                        Select gender
                      </option>
                      {GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.4} />
                  </div>
                </div>

                {/* City */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-city">
                    City{" "}
                    <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                  </Label>
                  <div className="relative">
                    <MapPin aria-hidden="true" className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={2} />
                    <input
                      id="patient-city"
                      name="city"
                      type="text"
                      defaultValue={patient?.city ?? ""}
                      placeholder="e.g. Mumbai, Delhi, Kolkata"
                      autoComplete="off"
                      className={cn(inputBase, "px-4 py-3.5 pl-12")}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Health Details ────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="border-b border-gray-200 pb-2">
                <h3 className="mb-0 flex items-center text-lg font-semibold text-gray-900">
                  <div className="mr-3 rounded-lg bg-[#5260B5]/10 p-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5260B5" strokeWidth="2" strokeLinecap="round">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                  </div>
                  Health Details
                </h3>
              </div>

              <div className="space-y-5">
                {/* Blood group */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-blood-group">
                    Blood Group{" "}
                    <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                  </Label>
                  <div className="relative">
                    <select
                      id="patient-blood-group"
                      name="bloodGroup"
                      defaultValue={patient?.blood_group ?? ""}
                      className={cn(inputBase, "cursor-pointer appearance-none px-4 py-3.5 pr-10")}
                    >
                      <option value="" disabled>
                        Select blood group
                      </option>
                      {BLOOD_GROUP_OPTIONS.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.4} />
                  </div>
                </div>

                {/* Allergies */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800">
                    Allergies{" "}
                    <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                  </Label>
                  <TagInput
                    name="knownAllergies"
                    initial={patient?.known_allergies}
                    placeholder="Search or type allergen and press Enter..."
                    hint="Search or press Enter to add"
                    containerClassName="border border-[#fca5a5] bg-[#fff1f1]"
                    inputClassName="border border-[#fca5a5] bg-white"
                    chipClassName="bg-[#ef4444]"
                  />
                </div>

                {/* Known conditions */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800">
                    Known Conditions{" "}
                    <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                  </Label>
                  <TagInput
                    name="medicalConditions"
                    initial={patient?.medical_conditions}
                    placeholder="Search or type condition and press Enter..."
                    hint="Search or press Enter to add"
                    containerClassName="border border-[#fed7aa] bg-[#fff7ed]"
                    inputClassName="border border-[#e5e3db] bg-white"
                    chipClassName="bg-[#f97316]"
                  />
                </div>

                {/* Height / Weight */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-height">
                      Height{" "}
                      <span className="text-xs font-normal text-gray-500">(Optional)</span>
                    </Label>
                    <input
                      id="patient-height"
                      name="height"
                      type="number"
                      inputMode="decimal"
                      defaultValue={patient?.height?.toString() ?? ""}
                      placeholder="e.g. 172"
                      min={0}
                      className={cn(inputBase, "px-4 py-3.5")}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-weight">
                      Weight{" "}
                      <span className="text-xs font-normal text-gray-500">(Optional)</span>
                    </Label>
                    <input
                      id="patient-weight"
                      name="weight"
                      type="number"
                      inputMode="decimal"
                      defaultValue={patient?.weight?.toString() ?? ""}
                      placeholder="e.g. 70"
                      min={0}
                      className={cn(inputBase, "px-4 py-3.5")}
                    />
                  </div>
                </div>

                {/* Current medications */}
                <div>
                  <Label className="mb-2 block text-sm font-semibold text-gray-800" htmlFor="patient-meds">
                    Current Medications{" "}
                    <span className="ml-1 text-xs font-normal text-gray-500">(Optional)</span>
                  </Label>
                  <textarea
                    id="patient-meds"
                    name="currentMeds"
                    rows={3}
                    defaultValue={patient?.current_medications ?? ""}
                    placeholder="e.g. Amlodipine 5mg daily, Metformin 500mg"
                    autoComplete="off"
                    className={cn(inputBase, "resize-none px-4 py-3.5")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 bg-white px-6 py-3">
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 text-green-500" />
          Your data is secure and encrypted
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={onDone}
            className="rounded-xl border-2 border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <SubmitButton
            loadingText="Saving…"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-light px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:from-primary/90 hover:to-primary-light/90 hover:shadow-xl"
          >
            <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
            {isEdit ? "Save Changes" : "Add Patient"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

/**
 * Date-of-birth field: the user types in `DD/MM/YYYY` (the reference UI's
 * format) but the schema/DB store `YYYY-MM-DD`. A hidden input carries the
 * converted ISO value for the server action.
 */
function DateOfBirthInput({ defaultValue }: { defaultValue: string }) {
  // `defaultValue` is the DB's YYYY-MM-DD.
  const initialIso = /^\d{4}-\d{2}-\d{2}/.test(defaultValue) ? defaultValue : "";
  const [display, setDisplay] = useState(
    initialIso ? `${initialIso.slice(8, 10)}/${initialIso.slice(5, 7)}/${initialIso.slice(0, 4)}` : "",
  );
  const [iso, setIso] = useState(initialIso);

  function handleChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const parts = [
      digits.slice(0, 2),
      digits.slice(2, 4),
      digits.slice(4, 8),
    ].filter(Boolean);
    const formatted = parts.join("/");
    setDisplay(formatted);

    if (formatted.length === 10) {
      setIso(`${formatted.slice(6, 10)}-${formatted.slice(3, 5)}-${formatted.slice(0, 2)}`);
    } else {
      setIso("");
    }
  }

  return (
    <>
      <input
        id="patient-dob"
        name="dateOfBirthDisplay"
        type="text"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => handleChange(e.target.value)}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        autoComplete="off"
        className={cn(inputBase, "px-3 py-2.5")}
      />
      <input id="patient-dob-iso" type="hidden" name="dateOfBirth" value={iso} />
    </>
  );
}