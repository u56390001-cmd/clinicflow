"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clock,
  Eye,
  FlaskConical,
  MessageCircle,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Scissors,
  Stethoscope,
  X,
  Zap,
} from "lucide-react";

import { RxSafetyPanel } from "@/components/consultation/rx-safety-panel";
import { RecordSection } from "@/components/patients/record/record-primitives";
import {
  DermRxPrint,
  type DermRxLetterhead,
  type DermRxPrintToday,
} from "@/components/patients/record/workspaces/derm-rx-print";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getClinicLetterheadAction,
  getCurrentClinicianInfoAction,
  listDermCustomLabTestsAction,
  listDermRxPresetsAction,
  saveDermCustomLabTestAction,
  saveDermRxPresetAction,
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";
import { useMedicineCatalogueNames } from "@/lib/rx-reference";
import { cn } from "@/lib/utils";
import type { DermLesion } from "@/types/database";
import type { DermPrescription, LabOrder, MedicineEntry } from "@/types/database";
import type { DermRxPreset } from "@/types/database";

/* Shared field sub-structure of every Rx row (matches DRP jsonb shape). */

type PatientShareFields = {
  name: string;
  email: string | null;
  phone: string | null;
  patient_code: string | null;
  date_of_birth: string | null;
  gender: string | null;
};

/* ------------------------------------------------------------------------- */
/* Presets (built-in 0122-era regimens + clinic templates from migration      */
/* 0123) share one loadable shape so the picker + save-as-template flow on.  */
/* ------------------------------------------------------------------------- */

type LoadablePreset = {
  name: string;
  description: string;
  medicines: MedicineEntry[];
  labOrders: LabOrder[];
  application: string;
  skincareAm: string;
  skincarePm: string;
  education: string;
  followUp: string;
  source: "builtin" | "clinic";
};

const BUILTIN_PRESETS: LoadablePreset[] = [
  {
    name: "Acne Vulgaris — Mild",
    description: "Retinoid night + BP wash · sunscreen",
    source: "builtin",
    medicines: [
      {
        name: "Adapalene 0.1% gel",
        route: "Topical",
        form: "Gel",
        frequency: "0-0-1 (Night)",
        duration: "30 Days",
        unit: "Pea-sized",
        instructions: "Apply pea-sized amount over the whole face at night; moisturiser on top",
      },
      {
        name: "Benzoyl peroxide 2.5% wash",
        route: "Topical",
        form: "Gel",
        frequency: "1-0-0 (Morning)",
        duration: "30 Days",
        unit: "Thin layer",
        instructions: "Apply to wet skin for 2 minutes, then rinse; start 3x/week if stinging",
      },
      {
        name: "Non-comedogenic moisturiser",
        route: "Topical",
        form: "Cream",
        frequency: "1-0-1 (BD)",
        duration: "30 Days",
        unit: "Thin layer",
        instructions: "Apply after actives, morning and night",
      },
    ],
    labOrders: [],
    application: "Apply actives to the entire acne-prone area (not spot-only) — thin layer, moisturiser on top.",
    skincareAm: "Gentle cleanser → benzoyl peroxide wash → moisturiser → sunscreen SPF 50",
    skincarePm: "Cleanse → adapalene (pea-sized, whole face) → moisturiser",
    education:
      "Purging/redness in weeks 2–4 is expected. Daily sunscreen is mandatory — adapalene increases photosensitivity. Avoid picking and avoid scrubbing. Review at 6 weeks.",
    followUp: "6 Weeks",
  },
  {
    name: "Acne Vulgaris — Moderate",
    description: "Oral antibiotic + retinoid + BP combo",
    source: "builtin",
    medicines: [
      {
        name: "Doxycycline 100 mg",
        route: "Oral",
        form: "Capsule",
        frequency: "1-0-1 (BD)",
        duration: "45 Days",
        unit: "100 mg",
        instructions: "After meals · take with a full glass of water",
      },
      {
        name: "Adapalene 0.1% + Clindamycin 1% gel",
        route: "Topical",
        form: "Gel",
        frequency: "0-0-1 (Night)",
        duration: "45 Days",
        unit: "Pea-sized",
        instructions: "Over the whole face, moisturiser on top",
      },
      {
        name: "Benzoyl peroxide 2.5% wash",
        route: "Topical",
        form: "Gel",
        frequency: "1-0-0 (Morning)",
        duration: "45 Days",
        unit: "Thin layer",
        instructions: "Apply to wet skin 2 minutes then rinse",
      },
    ],
    labOrders: [],
    application: "Antibiotic course must be completed; topical retinoid continues after antibiotics finish.",
    skincareAm: "Gentle cleanser (or BP wash) → moisturiser → sunscreen SPF 50",
    skincarePm: "Cleanse → adapalene/clindamycin combo (pea-sized) → moisturiser",
    education:
      "Upper GI upset with doxycycline — take after meals. No antacids/iron within 2 hours. Expect 4–6 weeks to visible change; continue topicals after antibiotic course.",
    followUp: "6 Weeks",
  },
  {
    name: "Acne Vulgaris — Severe (Isotretinoin)",
    description: "Isotretinoin course + retinoid baseline labs",
    source: "builtin",
    medicines: [
      {
        name: "Isotretinoin 10 mg",
        route: "Oral",
        form: "Capsule",
        frequency: "1-0-0 (Morning)",
        duration: "30 Days",
        unit: "10 mg",
        instructions: "With the fattiest meal of the day (absorption)",
      },
      {
        name: "Lip balm / occlusive moisturiser",
        route: "Topical",
        form: "Ointment",
        frequency: "1-0-1 (BD)",
        duration: "30 Days",
        unit: "Thin layer",
        instructions: "For cheilitis — apply liberally",
      },
    ],
    labOrders: [
      { test_name: "CBC (complete blood count)", notes: "Isotretinoin baseline" },
      { test_name: "LFTs (ALT, AST, bilirubin)", notes: "Isotretinoin baseline" },
      { test_name: "Serum triglycerides / lipid profile", notes: "Repeat 4 Weeks" },
      { test_name: "Fasting blood sugar", notes: "Baseline Test · Fasting 12h" },
    ],
    application: "Avoid waxing and elective laser while on isotretinoin and for 6 months after.",
    skincareAm: "Soap-free cleanser → heavy moisturiser → bland sunscreen (no acid actives)",
    skincarePm: "Cleanse → moisturiser; lip balm overnight",
    education:
      "Strictly avoid pregnancy — double contraception required. Dryness/cheilitis expected. Report mood changes, unusual headache or visual symptoms immediately. Repeat lipids at 4 weeks.",
    followUp: "1 Month",
  },
  {
    name: "Atopic Dermatitis Flare",
    description: "TCS ointment burst + antihistamine + emollient",
    source: "builtin",
    medicines: [
      {
        name: "Mometasone furoate 0.1% ointment",
        route: "Topical",
        form: "Ointment",
        frequency: "1-0-1 (BD)",
        duration: "14 Days",
        unit: "1 FTU",
        instructions: "To flaring areas only (not the whole body); FTU covers 2 adult-palm areas",
      },
      {
        name: "Levocetirizine 5 mg",
        route: "Oral",
        form: "Tablet",
        frequency: "0-0-1 (Night)",
        duration: "14 Days",
        unit: "5 mg",
        instructions: "For nocturnal itch",
      },
      {
        name: "Ceramide-based emollient",
        route: "Topical",
        form: "Cream",
        frequency: "1-0-1 (BD)",
        duration: "Until Next Visit",
        unit: "Thin layer",
        instructions: "Apply within 3 minutes of bathing to damp skin (soak-and-seal)",
      },
    ],
    labOrders: [],
    application: "Steroid course is time-limited — do not reuse beyond 2 weeks without review. Then step down to twice-weekly corticosteroid maintenance if flares recur.",
    skincareAm: "Lukewarm 10-min bath/short shower → emollient on damp skin → bland sunscreen on exposed areas",
    skincarePm: "Emollient after any night bathing; reapply to itchy areas",
    education:
      "Soap/sanitiser substitutes only. Cotton clothing, keep nails short. Trigger diary: heat, sweat, wool, stress. Return if weeping/spreading occurs.",
    followUp: "2 Weeks",
  },
  {
    name: "Psoriasis Scalp Protocol",
    description: "Combi-analogue scalp gel + tar shampoo",
    source: "builtin",
    medicines: [
      {
        name: "Calcipotriol + Betamethasone dipropionate scalp gel",
        route: "Topical",
        form: "Gel",
        frequency: "0-0-1 (Night)",
        duration: "30 Days",
        unit: "Thin layer",
        instructions: "Apply to scalp plaques only; up to 15 g/day. Max 4 weeks, then review",
      },
      {
        name: "Ketoconazole 2% shampoo",
        route: "Topical",
        form: "Lotion",
        frequency: "Once Weekly",
        duration: "30 Days",
        unit: "Thin layer",
        instructions: "Lather, 5 minutes contact, then rinse; twice weekly if itching",
      },
      {
        name: "Emollient / keratolytic (urea 10%) for plaques",
        route: "Topical",
        form: "Cream",
        frequency: "1-0-1 (BD)",
        duration: "Until Next Visit",
        unit: "Thin layer",
        instructions: "Softens scale so the active penetrates",
      },
    ],
    labOrders: [],
    application: "Scalp gel only on plaques — do not apply to face or broken skin. Wash hands after use.",
    skincareAm: "Tar/medicated shampoo or plain rinse → light moisturiser on body plaques",
    skincarePm: "Combi gel to scalp plaques → moisturiser body",
    education:
      "Psoriasis course is chronic: maintenance moisturisers continue after gel taper. Stress & strep throat flares — report early. No abrupt steroid withdrawal.",
    followUp: "1 Month",
  },
  {
    name: "Androgenetic Alopecia",
    description: "Minoxidil BD + adjuvants · shadow shed warning",
    source: "builtin",
    medicines: [
      {
        name: "Minoxidil 5% solution/foam",
        route: "Topical",
        form: "Lotion",
        frequency: "1-0-1 (BD)",
        duration: "90 Days",
        unit: "1 FTU",
        instructions: "1 mL to dry scalp mid-scalp & crown, spread with fingertip; wash hands",
      },
      {
        name: "Saw-palmetto / multivitamin (iron if deficient)",
        route: "Oral",
        form: "Tablet",
        frequency: "1-0-0 (Morning)",
        duration: "90 Days",
        unit: "",
        instructions: "After meals",
      },
    ],
    labOrders: [
      { test_name: "Serum ferritin", notes: "Rule out iron deficiency" },
      { test_name: "TSH (thyroid stimulating hormone)", notes: "Baseline Test" },
    ],
    application: "Do not wash hair for 4 hours after minoxidil application. Foam preferred if solution irritates.",
    skincareAm: "Minoxidil 1 mL to dry scalp → style later (wait 20-30 min)",
    skincarePm: "Second minoxidil dose 8–12 hours after morning dose",
    education:
      "Early increased shedding (weeks 2–8) is a good sign — do not stop. Visible regrowth takes 3–6 months; continue indefinitely or loss resumes. Others may prefer oral finasteride — discuss at review.",
    followUp: "6 Weeks",
  },
];

/* ------------------------------------------------------------------------- */
/* 1-tap chip sets (§2) — values mirror the Rx draft fields one-to-one so a   */
/* loaded preset highlights the matching pill automatically.                  */
/* ------------------------------------------------------------------------- */

const FREQUENCY_CHIPS: { value: string; short: string }[] = [
  { value: "1-0-0 (Morning)", short: "1-0-0" },
  { value: "0-0-1 (Night)", short: "0-0-1" },
  { value: "1-0-1 (BD)", short: "1-0-1" },
  { value: "Once Weekly", short: "Weekly" },
];

const DURATION_CHIPS = [
  "7 Days",
  "14 Days",
  "30 Days",
  "45 Days",
  "90 Days",
  "Until Next Visit",
] as const;

/** Topical vehicle chips write into the row's dosage-form field. */
const VEHICLE_CHIPS = ["Cream", "Ointment", "Gel", "Lotion", "Foam"] as const;

/** Fingertip-unit / amount chips write into the row's unit field. */
const AMOUNT_CHIPS = [
  "0.5 FTU",
  "1 FTU",
  "2 FTU",
  "Pea-sized",
  "Thin layer",
] as const;

/** Oral rows: strength chips write into the unit field, food timing apps. */
const STRENGTH_CHIPS = ["5 mg", "10 mg", "25 mg", "50 mg", "100 mg"] as const;

const LAB_NOTE_CHIPS = [
  "Fasting 12h",
  "Baseline Test",
  "Repeat 4 Weeks",
  "Urgent",
  "Day 2-5 Cycle",
] as const;

const FOLLOW_UP_CHIPS = [
  "1 Week",
  "2 Weeks",
  "1 Month",
  "6 Weeks",
  "SOS / As Needed",
  "Post-Biopsy 10 Days",
] as const;

/** Multi-test bundles behind the ⚡ Lab Panels modal. */
const LAB_PANELS: { name: string; tests: { name: string; notes: string }[] }[] = [
  {
    name: "Retinoid Baseline Panel",
    tests: [
      { name: "CBC (complete blood count)", notes: "Isotretinoin baseline" },
      { name: "LFTs (ALT, AST, bilirubin)", notes: "Isotretinoin baseline" },
      { name: "Serum triglycerides / lipid profile", notes: "Repeat 4 Weeks" },
      { name: "Fasting blood sugar", notes: "Fasting 12h" },
    ],
  },
  {
    name: "Fungal Workup",
    tests: [
      { name: "KOH mount (skin scraping)", notes: "Direct microscopy" },
      { name: "Fungal culture & sensitivity", notes: "Identify species" },
    ],
  },
  {
    name: "Hormonal / PCOS Panel",
    tests: [
      { name: "Free testosterone", notes: "Day 2-5 Cycle" },
      { name: "DHEA-S", notes: "Day 2-5 Cycle" },
      { name: "LH : FSH ratio", notes: "Day 2-5 Cycle" },
    ],
  },
];

const ROUTE_OPTIONS: { value: string; label: string }[] = [
  { value: "Topical", label: "Topical" },
  { value: "Oral", label: "Oral" },
  { value: "Intralesional", label: "Intralesional" },
];

/** Dermatology-relevant lab menu for the test-search dropdown; manual typing stays allowed. */
const COMMON_LAB_TESTS: { name: string; group: string }[] = [
  { name: "CBC (complete blood count)", group: "Blood" },
  { name: "ESR (erythrocyte sedimentation rate)", group: "Blood" },
  { name: "CRP (C-reactive protein)", group: "Blood" },
  { name: "LFTs (ALT, AST, bilirubin)", group: "Blood" },
  { name: "RFTs (serum creatinine, urea)", group: "Blood" },
  { name: "Fasting blood sugar", group: "Blood" },
  { name: "HbA1c (glycated haemoglobin)", group: "Blood" },
  { name: "Serum triglycerides / lipid profile", group: "Blood" },
  { name: "Serum ferritin", group: "Blood" },
  { name: "Vitamin D (25-OH)", group: "Blood" },
  { name: "Vitamin B12", group: "Blood" },
  { name: "Serum zinc", group: "Blood" },
  { name: "TSH (thyroid stimulating hormone)", group: "Hormonal" },
  { name: "Free testosterone", group: "Hormonal" },
  { name: "DHEA-S", group: "Hormonal" },
  { name: "LH : FSH ratio", group: "Hormonal" },
  { name: "Prolactin", group: "Hormonal" },
  { name: "ANA (antinuclear antibody)", group: "Immune" },
  { name: "KOH mount (skin scraping)", group: "Infection" },
  { name: "Fungal culture & sensitivity", group: "Infection" },
  { name: "VDRL (syphilis serology)", group: "Infection" },
  { name: "HIV 1 & 2 (rapid)", group: "Infection" },
  { name: "HBsAg (hepatitis B surface antigen)", group: "Infection" },
  { name: "Anti-HCV (hepatitis C antibody)", group: "Infection" },
  { name: "Urine routine examination", group: "Urine" },
  { name: "Skin biopsy (histopathology)", group: "Skin" },
];

/** Empty draft row — no hardcoded sample drugs (clean default). */
const EMPTY_MEDICINE: MedicineEntry = {
  name: "",
  route: "",
  form: "",
  frequency: "",
  duration: "",
  unit: "",
  instructions: "",
};

const FOOD_PHRASE = /(^|·)\s*(take\s+)?(after|before)\s+(food|meals|meal)\b[.,]?\s*/i;

/** Food-timing toggle: strips any existing phrase, then appends the new one. */
function applyFoodTiming(
  instructions: string,
  timing: "after" | "before" | null,
): string {
  const stripped = instructions
    .replace(FOOD_PHRASE, "$1")
    .replace(/\s*·\s*$/, "")
    .trimEnd();
  if (!timing) return stripped;
  const phrase = timing === "after" ? "After meals" : "Before meals";
  return stripped ? `${stripped} · ${phrase}` : phrase;
}

function foodTimingOf(instructions: string): "after" | "before" | null {
  if (/\bafter\s+(food|meals|meal)\b/i.test(instructions)) return "after";
  if (/\bbefore\s+(food|meals|meal)\b/i.test(instructions)) return "before";
  return null;
}

/** A medicine whose frequency names a time of day lands in that AM/PM list. */
function routineSteps(medicines: MedicineEntry[], period: "am" | "pm"): string[] {
  const pattern = period === "am" ? /\bam\b|morning/i : /\bpm\b|night|evening/i;
  return medicines
    .filter((medicine) => pattern.test(medicine.frequency))
    .map((medicine) => {
      const parts = [medicine.name.trim()];
      if (medicine.frequency.trim()) parts.push(medicine.frequency.trim());
      if (medicine.instructions.trim())
        parts.push(medicine.instructions.trim());
      return parts.join(" — ");
    })
    .filter((line) => line.length > 0);
}

function isTopicalRow(medicine: MedicineEntry): boolean {
  return (
    /top/i.test(medicine.route) ||
    VEHICLE_CHIPS.some(
      (vehicle) => vehicle.toLowerCase() === medicine.form.toLowerCase(),
    )
  );
}

/** Lab notes quick chips: toggle a " · "-joined tag list in the row's notes. */
function toggleLabNote(notes: string, chip: string): string {
  const parts = notes
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === chip.toLowerCase())) {
    return parts
      .filter((part) => part.toLowerCase() !== chip.toLowerCase())
      .join(" · ");
  }
  return [...parts, chip].join(" · ");
}

function labNoteOn(notes: string, chip: string): boolean {
  return notes
    .split(" · ")
    .some((part) => part.trim().toLowerCase() === chip.toLowerCase());
}

/* Body-site pin phrases: "Apply to Pin #1 — Face" inside the instructions. */

const PIN_PHRASE = /\s*(Apply to Pin #\d+[^,;.]*[,.]?)/i;

function withSite(instructions: string, site: string | null): string {
  const cleaned = instructions.replace(PIN_PHRASE, "").trim();
  const rest = cleaned.replace(/^[,;\-–]\s*/, "");
  if (!site) return rest;
  return rest ? `Apply to ${site} — ${rest}` : `Apply to ${site}`;
}

function siteOf(instructions: string): string | null {
  const match = instructions.match(/Apply to (Pin #\d+[^,;.])/i);
  return match ? match[1].trim().replace(/[–-]\s*$/, "") : null;
}

/** The clinic's whole-Rx topical form, derived from the first topical row. */
function deriveTopicalForm(
  items: MedicineEntry[],
): DermPrescription["topical_form"] {
  const form = items
    .find((item) => isTopicalRow(item))
    ?.form.trim()
    .toLowerCase();
  return form === "cream" || form === "ointment" || form === "gel" || form === "lotion"
    ? form
    : null;
}

const TOPICAL_LABEL: Record<string, string> = {
  cream: "Cream",
  ointment: "Ointment",
  gel: "Gel",
  lotion: "Lotion",
};

/** Chip / pill button — the one interactive row per field (§2). */
function ChipButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50",
        selected
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

/* A small labelled pill row — exactly one per field, no text inputs. */
function PillRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink shrink-0 text-[10.5px] font-bold uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Editor row — pure pill rows (§2): route pills drive topical/oral variants. */
/* ------------------------------------------------------------------------- */

function DermMedicineRow({
  index,
  medicine,
  lesions,
  onChange,
  onRemove,
  canManage,
}: {
  index: number;
  medicine: MedicineEntry;
  lesions: DermLesion[];
  onChange: (index: number, field: keyof MedicineEntry, value: string) => void;
  onRemove: (index: number) => void;
  canManage: boolean;
}) {
  const catalogueNames = useMedicineCatalogueNames();
  const topical = isTopicalRow(medicine);
  const oral = /oral/i.test(medicine.route);

  return (
    <div className="rounded-card border border-hairline p-3">
      {/* Row 1: medicine name (the one text field) + remove */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`derm-med-name-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            Medicine
          </label>
          <Input
            id={`derm-med-name-${index}`}
            list={`derm-med-catalogue-${index}`}
            value={medicine.name}
            onChange={(event) => onChange(index, "name", event.target.value)}
            placeholder="e.g. Adapalene 0.1% gel"
            autoComplete="off"
          />
          {catalogueNames.length > 0 && (
            <datalist id={`derm-med-catalogue-${index}`}>
              {catalogueNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove medicine ${index + 1}`}
            className="mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>

      {/* Single interactive pill rows (§2) — the ONLY field controls. */}
      <div className="mt-2.5 space-y-1.5">
        <PillRow label="Route">
          {ROUTE_OPTIONS.map((route) => (
            <ChipButton
              key={route.value}
              selected={medicine.route === route.value}
              disabled={!canManage}
              onClick={() =>
                onChange(
                  index,
                  "route",
                  medicine.route === route.value ? "" : route.value,
                )
              }
            >
              {route.label}
            </ChipButton>
          ))}
        </PillRow>

        {topical && (
          <>
            <PillRow label="Vehicle">
              {VEHICLE_CHIPS.map((chip) => (
                <ChipButton
                  key={chip}
                  selected={medicine.form === chip}
                  disabled={!canManage}
                  onClick={() =>
                    onChange(
                      index,
                      "form",
                      medicine.form === chip ? "" : chip,
                    )
                  }
                >
                  {chip}
                </ChipButton>
              ))}
            </PillRow>
            <PillRow label="Amount">
              {AMOUNT_CHIPS.map((chip) => (
                <ChipButton
                  key={chip}
                  selected={medicine.unit === chip}
                  disabled={!canManage}
                  onClick={() =>
                    onChange(index, "unit", medicine.unit === chip ? "" : chip)
                  }
                >
                  {chip}
                </ChipButton>
              ))}
              {lesions.length > 0 && (
                <NativeSelect
                  aria-label="Body site link"
                  className="h-7 w-auto py-0 text-[11px]"
                  value={siteOf(medicine.instructions) ?? ""}
                  onChange={(event) =>
                    onChange(
                      index,
                      "instructions",
                      withSite(medicine.instructions, event.target.value || null),
                    )
                  }
                  disabled={!canManage}
                >
                  <option value="">No site</option>
                  {lesions.map((lesion) => {
                    const site = `Pin #${lesion.pin_number} — ${lesion.body_region}${
                      lesion.laterality ? ` (${lesion.laterality})` : ""
                    }`;
                    return (
                      <option key={lesion.id} value={site}>
                        {site}
                      </option>
                    );
                  })}
                </NativeSelect>
              )}
            </PillRow>
          </>
        )}

        {oral && (
          <>
            <PillRow label="Strength">
              {STRENGTH_CHIPS.map((chip) => (
                <ChipButton
                  key={chip}
                  selected={medicine.unit === chip}
                  disabled={!canManage}
                  onClick={() =>
                    onChange(index, "unit", medicine.unit === chip ? "" : chip)
                  }
                >
                  {chip}
                </ChipButton>
              ))}
            </PillRow>
            <PillRow label="Timing">
              {(
                [
                  { key: "after", label: "After Meals" },
                  { key: "before", label: "Before Meals" },
                ] as const
              ).map((timing) => (
                <ChipButton
                  key={timing.key}
                  selected={foodTimingOf(medicine.instructions) === timing.key}
                  disabled={!canManage}
                  onClick={() =>
                    onChange(
                      index,
                      "instructions",
                      applyFoodTiming(
                        medicine.instructions,
                        foodTimingOf(medicine.instructions) === timing.key
                          ? null
                          : timing.key,
                      ),
                    )
                  }
                >
                  {timing.label}
                </ChipButton>
              ))}
            </PillRow>
          </>
        )}

        <PillRow label="Freq">
          {FREQUENCY_CHIPS.map((chip) => (
            <ChipButton
              key={chip.value}
              selected={medicine.frequency === chip.value}
              disabled={!canManage}
              onClick={() =>
                onChange(
                  index,
                  "frequency",
                  medicine.frequency === chip.value ? "" : chip.value,
                )
              }
            >
              {chip.short}
            </ChipButton>
          ))}
        </PillRow>
        <PillRow label="Dur">
          {DURATION_CHIPS.map((chip) => (
            <ChipButton
              key={chip}
              selected={medicine.duration === chip}
              disabled={!canManage}
              onClick={() =>
                onChange(
                  index,
                  "duration",
                  medicine.duration === chip ? "" : chip,
                )
              }
            >
              {chip}
            </ChipButton>
          ))}
        </PillRow>
      </div>

      {/* Notes / site phrase — free text carved by the pills above. */}
      <div className="mt-2.5">
        <label
          htmlFor={`derm-med-instructions-${index}`}
          className="text-ink mb-1 block text-[11px] font-bold uppercase tracking-wide"
        >
          Instructions
        </label>
        <Input
          id={`derm-med-instructions-${index}`}
          value={medicine.instructions}
          onChange={(event) =>
            onChange(index, "instructions", event.target.value)
          }
          placeholder="e.g. Apply to affected area; moisturiser on top"
          autoComplete="off"
          disabled={!canManage}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Lab test search — typing filters a dropdown of the in-app menu plus the   */
/* clinic's saved custom tests; a missing test can be registered in-place.   */
/* ------------------------------------------------------------------------- */

function LabTestCombobox({
  index,
  value,
  existingNames,
  customTests,
  onAddCustom,
  onChange,
  disabled,
}: {
  index: number;
  value: string;
  /** Test names already on this Rx — selecting them is blocked (dedupe). */
  existingNames: string[];
  customTests: string[];
  onAddCustom: (name: string) => Promise<boolean>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const query = value.trim();
  const lowerQuery = query.toLowerCase();
  const all = [...COMMON_LAB_TESTS.map((t) => ({ name: t.name, group: t.group })), ...customTests.map((name) => ({ name, group: "Custom" }))];
  const matches = lowerQuery
    ? all.filter((test) => test.name.toLowerCase().includes(lowerQuery))
    : all;
  const alreadyOrdered = existingNames.some(
    (name) => name.trim().toLowerCase() === lowerQuery,
  );
  const noExactMenuMatch =
    query.length > 0 &&
    !all.some((test) => test.name.toLowerCase() === lowerQuery) &&
    !alreadyOrdered;

  return (
    <div className="relative">
      <Input
        id={`derm-lab-test-${index}`}
        value={value}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        placeholder="Search or type a test…"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-56 w-[min(26rem,100%)] overflow-y-auto rounded-card border border-hairline bg-surface py-1 shadow-dropdown">
          {matches.map((test) => (
            <li key={test.name}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (existingNames.some((n) => n.toLowerCase() === test.name.toLowerCase())) {
                    toast.info(`"${test.name}" is already ordered.`);
                    setOpen(false);
                    return;
                  }
                  onChange(test.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-text-secondary transition-colors hover:bg-app hover:text-primary"
              >
                <span className="truncate">{test.name}</span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                  {test.group}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-1.5 text-[12px] text-text-muted">
              No saved test matches “{query}”.
            </li>
          )}
          {noExactMenuMatch && (
            <li className="border-t border-hairline">
              <button
                type="button"
                disabled={adding || disabled}
                onMouseDown={async (event) => {
                  event.preventDefault();
                  setAdding(true);
                  const okFlag = await onAddCustom(query);
                  setAdding(false);
                  if (okFlag) {
                    setOpen(false);
                  }
                }}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Plus aria-hidden="true" className="size-3.5" />
                {adding ? `Saving "${query}"…` : `Add “${query}” as a custom test (clinic registry)`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Root builder — header actions bar (§1), pill-only rows (§2), labs (§3),   */
/* follow-up picker (§5), history timeline with view/repeat (§4).            */
/* ------------------------------------------------------------------------- */

export function DermRxMeds({
  patientId,
  patient,
  prescription,
  history,
  lesions,
  today,
  allergies,
  canManage,
  visitId,
}: {
  patientId: string;
  /** Contact & ID fields print/share needs. */
  patient: PatientShareFields;
  /** Latest (active) prescription row the draft edits in-place. */
  prescription: DermPrescription | null;
  /** All earlier prescription rows (deduped by id inside). */
  history: DermPrescription[];
  /** Body-map lesion pins for topical body-site linking. */
  lesions: DermLesion[];
  /** Live context from today's encounter (diagnosis, procedures). */
  today: DermRxPrintToday;
  allergies?: Array<string | null | undefined>;
  canManage: boolean;
  visitId?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [items, setItems] = useState<MedicineEntry[]>(prescription?.medicines ?? []);
  const [labs, setLabs] = useState<LabOrder[]>(prescription?.lab_orders ?? []);
  const [application, setApplication] = useState(
    prescription?.application_instructions ?? "",
  );
  const [education, setEducation] = useState(
    prescription?.patient_education ?? "",
  );
  const [skincareAm, setSkincareAm] = useState(
    prescription?.skincare_routine_am ?? "",
  );
  const [skincarePm, setSkincarePm] = useState(
    prescription?.skincare_routine_pm ?? "",
  );
  const [followUp, setFollowUp] = useState(prescription?.follow_up ?? "");
  const [printDraft, setPrintDraft] = useState<DermPrescription | null>(null);
  /** Encounter context printed on the sheet — empty for history reprints. */
  const [printToday, setPrintToday] = useState<DermRxPrintToday>(today);
  const [letterhead, setLetterhead] = useState<DermRxLetterhead | null>(null);
  const [clinician, setClinician] = useState("");
  const [customLabTests, setCustomLabTests] = useState<string[]>([]);
  const [rxPresets, setRxPresets] = useState<DermRxPreset[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [saveTemplatePending, setSaveTemplatePending] = useState(false);
  const [viewRx, setViewRx] = useState<DermPrescription | null>(null);

  useEffect(() => {
    void getClinicLetterheadAction().then((result) => {
      if (result.ok) setLetterhead(result.data);
    });
    void getCurrentClinicianInfoAction().then((result) => {
      if (result.ok) setClinician(result.data.name);
    });
    void listDermRxPresetsAction().then((result) => {
      if (result.ok) setRxPresets(result.data);
    });
    void listDermCustomLabTestsAction().then((result) => {
      if (result.ok) setCustomLabTests(result.data);
    });
  }, []);

  function updateMedicine(index: number, field: keyof MedicineEntry, value: string) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addMedicine() {
    setItems((current) => [...current, { ...EMPTY_MEDICINE }]);
  }

  function removeMedicine(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  /** Load a preset (built-in regimen or clinic template) into the draft. */
  function loadPreset(preset: LoadablePreset) {
    setItems(preset.medicines.map((m) => ({ ...m })));
    setLabs(preset.labOrders.map((l) => ({ ...l })));
    setApplication(preset.application);
    setSkincareAm(preset.skincareAm);
    setSkincarePm(preset.skincarePm);
    setEducation(preset.education);
    if (preset.followUp) setFollowUp(preset.followUp);
    toast.success(
      `Loaded "${preset.name}" — ${preset.medicines.length} medicines${
        preset.labOrders.length > 0 ? `, ${preset.labOrders.length} labs` : ""
      } and advice filled. Review, then save.`,
    );
  }

  /** 1-tap lab panels: append missing tests, keep whatever exists (dedupe). */
  function applyLabPanel(panel: (typeof LAB_PANELS)[number]) {
    setLabs((current) => {
      const existing = new Set(
        current.map((order) => order.test_name.trim().toLowerCase()),
      );
      const additions = panel.tests
        .filter((test) => !existing.has(test.name.toLowerCase()))
        .map((test) => ({ test_name: test.name, notes: test.notes }));
      if (additions.length === 0) {
        toast.info(`${panel.name} — all tests already on the list.`);
        return current;
      }
      toast.success(`${panel.name}: ${additions.length} test(s) added.`);
      return [...current, ...additions];
    });
  }

  /** Register a custom lab test into the clinic database registry. */
  async function addCustomLabTest(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const result = await saveDermCustomLabTestAction({ name: trimmed });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    setCustomLabTests((current) =>
      current.some((t) => t.toLowerCase() === trimmed.toLowerCase())
        ? current
        : [...current, trimmed],
    );
    toast.success(`"${trimmed}" saved to the clinic lab registry.`);
    return true;
  }

  function updateLab(index: number, field: keyof LabOrder, value: string) {
    setLabs((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addLab() {
    setLabs((current) => [...current, { test_name: "", notes: "" }]);
  }

  function removeLab(index: number) {
    setLabs((current) => current.filter((_, i) => i !== index));
  }

  /** The draft as it would save, for print + share + template stamping. */
  function buildDraft(): DermPrescription {
    const medicines = items.filter(
      (m) => m.name.trim() || m.route.trim() || m.frequency.trim(),
    );
    const lab_orders = labs.filter((l) => l.test_name.trim() || l.notes.trim());
    return {
      id: prescription?.id ?? "",
      clinic_id: prescription?.clinic_id ?? "",
      patient_id: patientId,
      doctor_id: prescription?.doctor_id ?? null,
      visit_id: prescription?.visit_id ?? visitId ?? null,
      topical_form: deriveTopicalForm(items),
      application_instructions: application.trim() || null,
      skincare_routine_am: skincareAm.trim() || null,
      skincare_routine_pm: skincarePm.trim() || null,
      patient_education: education.trim() || null,
      follow_up: followUp.trim() || null,
      medicines,
      lab_orders,
      created_at: prescription?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** One save for the whole draft (§1 header primary does save+print). */
  async function save(): Promise<boolean> {
    if (!canManage) return false;
    setPending(true);
    const result = await saveDermRxAction(
      patientId,
      {
        id: prescription?.id ?? null,
        topical_form: deriveTopicalForm(items),
        application_instructions: application.trim() || null,
        skincare_routine_am: skincareAm.trim() || null,
        skincare_routine_pm: skincarePm.trim() || null,
        patient_education: education.trim() || null,
        follow_up: followUp.trim() || null,
        medicines: items.filter(
          (m) => m.name.trim() || m.route.trim() || m.frequency.trim(),
        ),
        lab_orders: labs.filter(
          (l) => l.test_name.trim() || l.notes.trim(),
        ),
      },
      visitId,
    );
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success("Prescription saved");
    router.refresh();
    return true;
  }

  /** Header primary: save, then stamp the auto-print sheet (today's context). */
  async function saveAndPrint() {
    const saved = await save();
    if (saved) {
      setPrintToday(today);
      setPrintDraft(buildDraft());
    }
  }

  /** Save the current draft as a reusable clinic Rx template (0123). */
  async function saveDraftAsTemplate() {
    const name = templateName.trim();
    if (!name) {
      toast.error("Give the template a name.");
      return;
    }
    const medicines = items.filter(
      (m) => m.name.trim() || m.route.trim() || m.frequency.trim(),
    );
    if (medicines.length === 0) {
      toast.error("Add at least one medicine before saving a template.");
      return;
    }
    setSaveTemplatePending(true);
    const result = await saveDermRxPresetAction({
      name,
      description: `${medicines.length} medicines, ${
        labs.filter((l) => l.test_name.trim()).length
      } labs`,
      medicines,
      lab_orders: labs.filter((l) => l.test_name.trim() || l.notes.trim()),
      application_instructions: application.trim() || null,
      skincare_routine_am: skincareAm.trim() || null,
      skincare_routine_pm: skincarePm.trim() || null,
      patient_education: education.trim() || null,
      follow_up: followUp.trim() || null,
    });
    setSaveTemplatePending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Template "${name}" saved for this clinic.`);
    setSaveTemplateOpen(false);
    setTemplateName("");
    void listDermRxPresetsAction().then((refresh) => {
      if (refresh.ok) setRxPresets(refresh.data);
    });
  }

  /** Plain-text summary for WhatsApp sharing. */
  function shareText(): string {
    const draft = buildDraft();
    const lines: string[] = [];
    lines.push(`${patient.name} — Dermatology prescription`);
    if (today.diagnosis) {
      lines.push(
        `Diagnosis: ${today.diagnosis}${today.icdCode ? ` (ICD-10 ${today.icdCode})` : ""}`,
      );
    }
    if (draft.medicines.length > 0) {
      lines.push("", "Rx:");
      draft.medicines.forEach((m, index) => {
        lines.push(
          `${index + 1}. ${m.name}${m.frequency ? ` — ${m.frequency}` : ""}${
            m.duration ? ` × ${m.duration}` : ""
          }${m.instructions ? ` (${m.instructions})` : ""}`,
        );
      });
    }
    if (draft.lab_orders.length > 0) {
      lines.push("", "Advised tests:");
      draft.lab_orders.forEach((l) => lines.push(`• ${l.test_name}`));
    }
    if (draft.application_instructions)
      lines.push("", `Application: ${draft.application_instructions}`);
    if (draft.skincare_routine_am)
      lines.push(`AM routine: ${draft.skincare_routine_am}`);
    if (draft.skincare_routine_pm)
      lines.push(`PM routine: ${draft.skincare_routine_pm}`);
    if (draft.patient_education)
      lines.push("", `Advice: ${draft.patient_education}`);
    if (draft.follow_up) lines.push("", `Follow-up: ${draft.follow_up}`);
    return lines.join("\n");
  }

  function shareWhatsApp() {
    const phone = patient.phone?.replace(/[^\d]/g, "") ?? "";
    if (!phone) {
      toast.error(
        "Add a WhatsApp phone number to the patient profile first.",
      );
      return;
    }
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(shareText())}`,
      "_blank",
      "noopener",
    );
  }

  /** History: deduped by id (strictly one card per prescription row). */
  const historyRows = Object.values(
    history.reduce<Record<string, DermPrescription>>((acc, rx) => {
      if (rx.id && !acc[rx.id]) acc[rx.id] = rx;
      return acc;
    }, {}),
  )
    .filter((rx) => rx.id !== prescription?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  /** Fuzzy title: a built-in protocol whose medicines are all present. */
  function protocolTitleOf(rx: DermPrescription): string {
    const names = new Set(
      rx.medicines.map((m) => m.name.trim().toLowerCase()).filter(Boolean),
    );
    if (names.size > 0) {
      const match = BUILTIN_PRESETS.find((preset) =>
        preset.medicines.every((m) => names.has(m.name.trim().toLowerCase())),
      );
      if (match) return match.name;
    }
    return rx.topical_form
      ? `Topical ${TOPICAL_LABEL[rx.topical_form] ?? rx.topical_form} Rx`
      : "Prescription";
  }

  const am = routineSteps(items, "am");
  const pm = routineSteps(items, "pm");
  const existingTestNames = labs.map((l) => l.test_name);

  return (
    <>
      {printDraft && (
        <DermRxPrint
          rx={printDraft}
          patient={{
            name: patient.name,
            patient_code: patient.patient_code,
            date_of_birth: patient.date_of_birth,
            gender: patient.gender,
          }}
          letterhead={letterhead}
          clinician={clinician}
          today={printToday}
        />
      )}

      {/* §1 — compact header: context badges left, action buttons right. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {today.diagnosis ? (
            <Badge className="border-status-info/30 bg-status-info/10 text-status-info">
              <Stethoscope aria-hidden="true" className="size-3" />
              Diagnosis: {today.diagnosis}
              {today.icdCode ? ` (${today.icdCode})` : ""}
            </Badge>
          ) : (
            <span className="block text-[12px] text-text-muted">
              No diagnosis recorded today yet (Tab 2).
            </span>
          )}
          {today.procedures.map((procedure) => (
            <Badge
              key={procedure.name}
              className="border-violet-200 bg-violet-500/10 text-violet-600"
            >
              <Scissors aria-hidden="true" className="size-3" />
              Procedure: {procedure.name}
              {procedure.pin ? ` — Pin #${procedure.pin}` : ""}
            </Badge>
          ))}
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPresetsOpen(true)}
              className="gap-1.5"
            >
              <Zap aria-hidden="true" className="size-3.5 text-primary" />
              Presets &amp; Templates
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTemplateName("");
                setSaveTemplateOpen(true);
              }}
              className="gap-1.5"
            >
              <Save aria-hidden="true" className="size-3.5" />
              Save Draft as Template
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={shareWhatsApp}
              className="gap-1.5"
            >
              <MessageCircle aria-hidden="true" className="size-3.5" />
              Send WhatsApp
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveAndPrint}
              disabled={pending}
              className="gap-1.5"
            >
              <Printer aria-hidden="true" className="size-3.5" />
              {pending ? "Saving…" : "Save & Print Prescription"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-3">
          {/* Medicines (§2) — pill rows only. */}
          <RecordSection
            title="Medicines"
            meta={items.length > 0 ? `${items.length} item(s)` : "None yet"}
          >
            {items.length === 0 ? (
              <p className="text-[12.5px] text-text-muted">
                No medicines on the draft. Use Presets &amp; Templates, or add
                a row.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((medicine, index) => (
                  <DermMedicineRow
                    key={index}
                    index={index}
                    medicine={medicine}
                    lesions={lesions}
                    canManage={canManage}
                    onChange={updateMedicine}
                    onRemove={removeMedicine}
                  />
                ))}
              </div>
            )}
            {canManage && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMedicine}
                  className="gap-1.5"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add medicine
                </Button>
              </div>
            )}
          </RecordSection>

          {/* Investigations (§3) */}
          <RecordSection
            title="Investigations & labs"
            meta={labs.length > 0 ? `${labs.length} ordered` : "None yet"}
          >
            {canManage && (
              <div className="mb-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPanelsOpen(true)}
                  className="gap-1.5"
                >
                  <FlaskConical aria-hidden="true" className="size-3.5 text-primary" />
                  Lab Panels
                </Button>
              </div>
            )}
            {labs.length === 0 ? (
              <p className="text-[12.5px] text-text-muted">
                No investigations ordered yet — rows also accept manual typing.
              </p>
            ) : (
              <div className="space-y-2">
                {labs.map((order, index) => (
                  <div
                    key={index}
                    className="rounded-card border border-hairline p-3"
                  >
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[2fr_2fr_auto]">
                      <div>
                        <label
                          htmlFor={`derm-lab-test-${index}`}
                          className="text-ink mb-1 block text-[11.5px] font-bold"
                        >
                          Test
                        </label>
                        <LabTestCombobox
                          index={index}
                          value={order.test_name}
                          disabled={!canManage}
                          existingNames={existingTestNames.filter(
                            (name) => name !== order.test_name,
                          )}
                          customTests={customLabTests}
                          onAddCustom={addCustomLabTest}
                          onChange={(value) =>
                            updateLab(index, "test_name", value)
                          }
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`derm-lab-notes-${index}`}
                          className="text-ink mb-1 block text-[11.5px] font-bold"
                        >
                          Notes
                        </label>
                        <Input
                          id={`derm-lab-notes-${index}`}
                          value={order.notes}
                          disabled={!canManage}
                          onChange={(event) =>
                            updateLab(index, "notes", event.target.value)
                          }
                          placeholder="e.g. Baseline panel"
                          autoComplete="off"
                        />
                      </div>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removeLab(index)}
                          aria-label={`Remove investigation ${index + 1}`}
                          className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-app hover:text-status-destructive"
                        >
                          <X aria-hidden="true" className="size-3.5" />
                        </button>
                      )}
                    </div>
                    {/* 1-tap sample notes (§3) */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-ink text-[10.5px] font-bold uppercase tracking-wide">
                        Note:
                      </span>
                      {LAB_NOTE_CHIPS.map((chip) => (
                        <ChipButton
                          key={chip}
                          selected={labNoteOn(order.notes, chip)}
                          disabled={!canManage}
                          onClick={() =>
                            updateLab(index, "notes", toggleLabNote(order.notes, chip))
                          }
                        >
                          {chip}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {canManage && (
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLab}
                  className="gap-1.5"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add investigation
                </Button>
              </div>
            )}
          </RecordSection>
        </div>

        {/* Column 3: advice + routine preview + safety. */}
        <div className="flex min-w-0 flex-col gap-3">
          <RecordSection
            title="Application instructions & advice"
            meta="Included in print"
          >
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="derm-rx-application"
                  className="text-ink mb-1 block text-[11.5px] font-bold"
                >
                  Application instructions
                </label>
                <Textarea
                  id="derm-rx-application"
                  rows={3}
                  value={application}
                  onChange={(event) => setApplication(event.target.value)}
                  placeholder="e.g. Apply a thin layer twice daily to affected area"
                  disabled={!canManage}
                />
              </div>
              <div>
                <label
                  htmlFor="derm-rx-education"
                  className="text-ink mb-1 block text-[11.5px] font-bold"
                >
                  Patient education
                </label>
                <Textarea
                  id="derm-rx-education"
                  rows={3}
                  value={education}
                  onChange={(event) => setEducation(event.target.value)}
                  placeholder="e.g. Use sunscreen daily; avoid picking at lesions"
                  disabled={!canManage}
                />
              </div>
            </div>
          </RecordSection>

          <RecordSection title="Patient AM/PM routine" meta="Printed on the sheet">
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="derm-rx-am"
                  className="text-ink mb-1 block text-[11.5px] font-bold"
                >
                  Morning
                </label>
                <Textarea
                  id="derm-rx-am"
                  rows={2}
                  value={skincareAm}
                  onChange={(event) => setSkincareAm(event.target.value)}
                  placeholder="Cleanser → treatment → moisturiser → SPF"
                  disabled={!canManage}
                />
                {am.length > 0 && (
                  <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px] text-text-secondary">
                    {am.map((line, index) => (
                      <li key={`am-${index}`}>{line}</li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <label
                  htmlFor="derm-rx-pm"
                  className="text-ink mb-1 block text-[11.5px] font-bold"
                >
                  Night
                </label>
                <Textarea
                  id="derm-rx-pm"
                  rows={2}
                  value={skincarePm}
                  onChange={(event) => setSkincarePm(event.target.value)}
                  placeholder="Cleanser → treatment → night moisturiser"
                  disabled={!canManage}
                />
                {pm.length > 0 && (
                  <ol className="list-decimal space-y-0.5 pl-5 text-[12.5px] text-text-secondary">
                    {pm.map((line, index) => (
                      <li key={`pm-${index}`}>{line}</li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </RecordSection>

          <RecordSection title="Safety & interaction checks" meta="Live draft">
            <RxSafetyPanel medicines={items} allergies={allergies} />
          </RecordSection>
        </div>
      </div>

      {/* §5 — Follow-up / revisit picker before saving. */}
      <RecordSection
        title="Follow-up / revisit"
        meta={followUp ? <Badge className="bg-app text-text-secondary">{followUp}</Badge> : "Pick one"}
      >
        <div className="flex flex-wrap gap-1.5">
          {FOLLOW_UP_CHIPS.map((chip) => (
            <ChipButton
              key={chip}
              selected={followUp === chip}
              disabled={!canManage}
              onClick={() => setFollowUp(followUp === chip ? "" : chip)}
            >
              {chip}
            </ChipButton>
          ))}
        </div>
      </RecordSection>

      {/* §4 — Previous prescriptions: compact timeline (deduped by id). */}
      {historyRows.length > 0 && (
        <RecordSection
          title="Previous prescriptions"
          meta={`${historyRows.length} earlier`}
        >
          <div className="space-y-2">
            {historyRows.map((rx) => {
              const medicines = rx.medicines.filter((m) => m.name.trim());
              return (
                <div
                  key={rx.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hairline p-3"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-text-primary">
                      {rx.created_at.slice(0, 10)} · {protocolTitleOf(rx)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {medicines.slice(0, 3).map((m, i) => (
                        <Badge key={`${rx.id}-m-${i}`} className="bg-app text-[10.5px] text-text-secondary">
                          {m.name}
                        </Badge>
                      ))}
                      {medicines.length > 3 && (
                        <span className="text-[10.5px] text-text-muted">
                          +{medicines.length - 3} more
                        </span>
                      )}
                      {rx.follow_up && (
                        <Badge className="border-status-info/30 bg-status-info/10 text-status-info">
                          <Clock aria-hidden="true" className="size-3" />
                          Revisit: {rx.follow_up}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setViewRx(rx)}
                      className="gap-1.5"
                    >
                      <Eye aria-hidden="true" className="size-3.5" />
                      View Details
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const copies = (rx.medicines ?? []).map((m) => ({ ...m }));
                        if (copies.length === 0) {
                          toast.info("That prescription has no medicines to repeat.");
                          return;
                        }
                        setItems(copies);
                        toast.success(`Copied ${copies.length} medicines from ${rx.created_at.slice(0, 10)} into the draft.`);
                      }}
                      disabled={!canManage}
                      className="gap-1.5"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      Repeat Rx
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </RecordSection>
      )}

      {/* §1 — Preset picker modal (built-ins + clinic templates). */}
      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <DialogContent size="wide" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Presets &amp; Templates</DialogTitle>
            <DialogDescription>
              One tap loads a full regimen. Built-in protocols first, then this
              clinic&apos;s saved templates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {BUILTIN_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => {
                  loadPreset(preset);
                  setPresetsOpen(false);
                }}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-card border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">
                    {preset.name}
                  </p>
                  <p className="text-[11.5px] text-text-muted">{preset.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-app px-2 py-0.5 text-[10.5px] font-bold text-text-muted">
                  Built-in · {preset.medicines.length} meds
                  {preset.labOrders.length > 0 ? ` · ${preset.labOrders.length} labs` : ""}
                </span>
              </button>
            ))}
            {rxPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  loadPreset({
                    name: preset.name,
                    description: preset.description ?? "",
                    medicines: preset.medicines ?? [],
                    labOrders: preset.lab_orders ?? [],
                    application: preset.application_instructions ?? "",
                    skincareAm: preset.skincare_routine_am ?? "",
                    skincarePm: preset.skincare_routine_pm ?? "",
                    education: preset.patient_education ?? "",
                    followUp: preset.follow_up ?? "",
                    source: "clinic",
                  });
                  setPresetsOpen(false);
                }}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-card border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">{preset.name}</p>
                  <p className="text-[11.5px] text-text-muted">
                    {preset.description || "Clinic template"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold text-primary">
                  Clinic · {(preset.medicines ?? []).length} meds
                  {(preset.lab_orders ?? []).length > 0 ? ` · ${(preset.lab_orders ?? []).length} labs` : ""}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* §1 — Lab panels modal. */}
      <Dialog open={panelsOpen} onOpenChange={setPanelsOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>Lab Panels</DialogTitle>
            <DialogDescription>
              One tap adds the whole panel; tests already ordered are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {LAB_PANELS.map((panel) => (
              <button
                key={panel.name}
                type="button"
                onClick={() => applyLabPanel(panel)}
                disabled={!canManage}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-card border border-hairline p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-text-primary">{panel.name}</p>
                  <p className="truncate text-[11.5px] text-text-muted">
                    {panel.tests.map((t) => t.name).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-app px-2 py-0.5 text-[10.5px] font-bold text-text-muted">
                  {panel.tests.length} tests
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* §1 — Save draft as clinic template modal. */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent size="default">
          <DialogHeader>
            <DialogTitle>Save Draft as Template</DialogTitle>
            <DialogDescription>
              Stores the medicines, labs, advice and follow-up of this draft as
              a reusable clinic template.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="derm-template-name"
              className="text-ink mb-1 block text-[12.5px] font-bold"
            >
              Template name
            </label>
            <Input
              id="derm-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="e.g. Clinic-standard acne regimen"
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSaveTemplateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveDraftAsTemplate}
              disabled={saveTemplatePending}
              className="gap-1.5"
            >
              <Save aria-hidden="true" className="size-3.5" />
              {saveTemplatePending ? "Saving…" : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* §4 — Historical prescription full detail modal (+ reprint). */}
      <Dialog open={viewRx !== null} onOpenChange={(open) => { if (!open) setViewRx(null); }}>
        <DialogContent size="wide" className="max-h-[85vh] overflow-y-auto">
          {viewRx && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {viewRx.created_at.slice(0, 10)} · {protocolTitleOf(viewRx)}
                </DialogTitle>
                <DialogDescription>
                  Full prescription as recorded on that visit.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-[12.5px]">
                <div>
                  <p className="text-ink mb-1 text-[11px] font-bold uppercase tracking-wide">
                    Medicines ({viewRx.medicines?.length ?? 0})
                  </p>
                  <div className="space-y-1.5">
                    {(viewRx.medicines ?? [])
                      .filter((m) => m.name.trim())
                      .map((m, i) => (
                        <p key={`v-${i}`} className="leading-snug text-text-secondary">
                          <span className="font-bold text-text-primary">
                            {i + 1}. {m.name}
                          </span>
                          {m.route || m.form
                            ? ` — ${[m.route, m.form].filter(Boolean).join(" / ")}`
                            : ""}
                          {m.frequency ? ` · ${m.frequency}` : ""}
                          {m.duration ? ` · ${m.duration}` : ""}
                          {m.unit ? ` · ${m.unit}` : ""}
                          {m.instructions ? ` · ${m.instructions}` : ""}
                        </p>
                      ))}
                  </div>
                </div>
                {(viewRx.lab_orders ?? []).filter((l) => l.test_name.trim()).length > 0 && (
                  <div>
                    <p className="text-ink mb-1 text-[11px] font-bold uppercase tracking-wide">
                      Advised tests
                    </p>
                    {(viewRx.lab_orders ?? [])
                      .filter((l) => l.test_name.trim())
                      .map((l, i) => (
                        <p key={`vl-${i}`} className="text-text-secondary">
                          • {l.test_name}
                          {l.notes ? ` — ${l.notes}` : ""}
                        </p>
                      ))}
                  </div>
                )}
                {[
                  { label: "Application instructions", value: viewRx.application_instructions },
                  { label: "Patient advice", value: viewRx.patient_education },
                  { label: "AM routine", value: viewRx.skincare_routine_am },
                  { label: "PM routine", value: viewRx.skincare_routine_pm },
                  { label: "Follow-up", value: viewRx.follow_up },
                ]
                  .filter((row) => row.value?.trim())
                  .map((row) => (
                    <div key={row.label}>
                      <p className="text-ink mb-1 text-[11px] font-bold uppercase tracking-wide">
                        {row.label}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed text-text-secondary">
                        {row.value}
                      </p>
                    </div>
                  ))}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewRx(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setPrintToday({
                      diagnosis: null,
                      icdCode: null,
                      procedures: [],
                    });
                    setPrintDraft(viewRx);
                    setViewRx(null);
                  }}
                  className="gap-1.5"
                >
                  <Printer aria-hidden="true" className="size-3.5" />
                  Re-print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
