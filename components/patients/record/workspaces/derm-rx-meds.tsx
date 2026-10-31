"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Save,
  X,
} from "lucide-react";

import { RxSafetyPanel } from "@/components/consultation/rx-safety-panel";
import { RecordSection } from "@/components/patients/record/record-primitives";
import {
  DermRxPrint,
  type DermRxLetterhead,
  type DermRxPrintToday,
} from "@/components/patients/record/workspaces/derm-rx-print";
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
  saveDermRxAction,
} from "@/lib/actions/specialty-workspaces";
import { useMedicineCatalogueNames } from "@/lib/rx-reference";
import { cn } from "@/lib/utils";
import type { DermPrescription, LabOrder, MedicineEntry } from "@/types/database";

type PatientShareFields = {
  name: string;
  email: string | null;
  phone: string | null;
  patient_code: string | null;
  date_of_birth: string | null;
  gender: string | null;
};

/* ------------------------------------------------------------------------- */
/* Regimen templates (task §1) — real dermatology first-line regimens.        */
/* ------------------------------------------------------------------------- */

type RegimenTemplate = {
  name: string;
  blurb: string;
  topicalForm: DermPrescription["topical_form"];
  medicines: MedicineEntry[];
  labOrders: LabOrder[];
  application: string;
  skincareAm: string;
  skincarePm: string;
  education: string;
};

const REGIMEN_TEMPLATES: RegimenTemplate[] = [
  {
    name: "Acne Vulgaris — Mild",
    blurb: "Retinoid night + BP wash · sunscreen",
    topicalForm: "gel",
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
  },
  {
    name: "Acne Vulgaris — Moderate",
    blurb: "Oral antibiotic + retinoid + BP combo",
    topicalForm: "gel",
    medicines: [
      {
        name: "Doxycycline 100 mg",
        route: "Oral",
        form: "Capsule",
        frequency: "1-0-1 (BD)",
        duration: "42 Days",
        unit: "",
        instructions: "Take after food with a full glass of water",
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
    application: "Antibiotic course must be completed; topical retinoid continues after antibiotics finish (re-treatment behaviour control).",
    skincareAm: "Gentle cleanser (or BP wash) → moisturiser → sunscreen SPF 50",
    skincarePm: "Cleanse → adapalene/clindamycin combo (pea-sized) → moisturiser",
    education:
      "Upper GI upset with doxycycline — take after meals. No antacids/iron within 2 hours. Expect 4–6 weeks to visible change; continue topicals after antibiotic course.",
  },
  {
    name: "Acne Vulgaris — Severe (Isotretinoin)",
    blurb: "Isotretinoin course + retinoid baseline labs",
    topicalForm: null,
    medicines: [
      {
        name: "Isotretinoin 10 mg",
        route: "Oral",
        form: "Capsule",
        frequency: "1-0-0 (Morning)",
        duration: "30 Days",
        unit: "",
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
      { test_name: "CBC (complete blood count)", notes: "Retinoid baseline panel" },
      { test_name: "LFTs (ALT, AST, bilirubin)", notes: "Retinoid baseline panel" },
      { test_name: "Serum triglycerides / lipid profile", notes: "Retinoid baseline panel; repeat at 4 weeks" },
      { test_name: "Fasting blood sugar", notes: "Retinoid baseline panel" },
    ],
    application: "Avoid waxing and elective laser while on isotretinoin and for 6 months after.",
    skincareAm: "Soap-free cleanser → heavy moisturiser → bland sunscreen (no acid actives)",
    skincarePm: "Cleanse → moisturiser; lip balm overnight",
    education:
      "Strictly avoid pregnancy — double contraception required. Dryness/cheilitis expected. Report mood changes, unusual headache or visual symptoms immediately. Repeat lipids at 4 weeks.",
  },
  {
    name: "Atopic Dermatitis Flare",
    blurb: "TCS ointment burst + antihistamine + emollient",
    topicalForm: "ointment",
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
        unit: "",
        instructions: "For nocturnal itch",
      },
      {
        name: "Ceramide-based emollient",
        route: "Topical",
        form: "Cream",
        frequency: "1-0-1 (BD)",
        duration: "Until Next Visit",
        unit: "",
        instructions: "Apply within 3 minutes of bathing to damp skin (soak-and-seal)",
      },
    ],
    labOrders: [],
    application: "Steroid course is time-limited — do not reuse beyond 2 weeks without review. Then step down to twice-weekly corticosteroid maintenance if flares recur.",
    skincareAm: "Lukewarm 10-min bath/short shower → emollient on damp skin → bland sunscreen on exposed areas",
    skincarePm: "Emollient after any night bathing; reapply to itchy areas",
    education:
      "Soap/sanitiser substitutes only. Cotton clothing, keep nails short. Trigger diary: heat, sweat, wool, stress. Return if weeping/spreading occurs.",
  },
  {
    name: "Psoriasis Scalp Protocol",
    blurb: "Combi-analogue scalp gel + tar shampoo",
    topicalForm: "gel",
    medicines: [
      {
        name: "Calcipotriol + Betamethasone dipropionate scalp gel",
        route: "Topical",
        form: "Gel",
        frequency: "0-0-1 (Night)",
        duration: "30 Days",
        unit: "",
        instructions: "Apply to scalp plaques only; up to 15 g/day. Max 4 weeks, then review",
      },
      {
        name: "Ketoconazole 2% shampoo",
        route: "Topical",
        form: "Lotion",
        frequency: "Once Weekly",
        duration: "30 Days",
        unit: "",
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
  },
  {
    name: "Androgenetic Alopecia",
    blurb: "Minoxidil BD + adjuvants · shadow shed warning",
    topicalForm: "lotion",
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
        instructions: "After breakfast",
      },
    ],
    labOrders: [
      { test_name: "Serum ferritin", notes: "Rule out iron deficiency (common confounder)" },
      { test_name: "TSH", notes: "Thyroid screening" },
    ],
    application: "Do not wash hair for 4 hours after minoxidil application. Foam preferred if solution irritates.",
    skincareAm: "Minoxidil 1 mL to dry scalp → style later (wait 20-30 min)",
    skincarePm: "Second minoxidil dose 8–12 hours after morning dose",
    education:
      "Early increased shedding (weeks 2–8) is a good sign — do not stop. Visible regrowth takes 3–6 months; continue indefinitely or loss resumes. Others may prefer oral finasteride — discuss at review.",
  },
];

/* ------------------------------------------------------------------------- */
/* 1-tap chips (task §2) and quick lab panels (task §3).                      */
/* ------------------------------------------------------------------------- */

const FREQUENCY_CHIPS = [
  "1-0-0 (Morning)",
  "0-0-1 (Night)",
  "1-0-1 (BD)",
  "Once Weekly",
] as const;

const DURATION_CHIPS = ["7 Days", "14 Days", "30 Days", "Until Next Visit"] as const;

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

const LAB_PANELS: { label: string; tests: { name: string; notes: string }[] }[] = [
  {
    label: "Retinoid Baseline Panel",
    tests: [
      { name: "CBC (complete blood count)", notes: "Isotretinoin baseline" },
      { name: "LFTs (ALT, AST, bilirubin)", notes: "Isotretinoin baseline" },
      { name: "Serum triglycerides / lipid profile", notes: "Repeat at 4 weeks" },
      { name: "Fasting blood sugar", notes: "Baseline" },
    ],
  },
  {
    label: "Fungal Panel",
    tests: [
      { name: "KOH mount (skin scraping)", notes: "Direct microscopy" },
      { name: "Fungal culture & sensitivity", notes: "Identify species" },
    ],
  },
  {
    label: "Hormonal / PCOS Panel",
    tests: [
      { name: "Free testosterone", notes: "" },
      { name: "DHEA-S", notes: "" },
      { name: "LH : FSH ratio", notes: "Day 2–3 of cycle" },
    ],
  },
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

const ROUTE_OPTIONS = ["Oral", "Topical", "Subcutaneous", "Intralesional"] as const;

/** Empty draft row — no hardcoded sample drugs (task §2, clean default). */
const EMPTY_MEDICINE: MedicineEntry = {
  name: "",
  route: "",
  form: "",
  frequency: "",
  duration: "",
  unit: "",
  instructions: "",
};

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

/* ------------------------------------------------------------------------- */
/* Lab test search — typing filters a dropdown of the in-app test menu;      */
/* clicking a row selects it, free-text typing still allowed.                */
/* ------------------------------------------------------------------------- */

function LabTestCombobox({
  index,
  value,
  onChange,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const matches = query
    ? COMMON_LAB_TESTS.filter((test) => test.name.toLowerCase().includes(query))
    : COMMON_LAB_TESTS;
  return (
    <div className="relative">
      <Input
        id={`derm-lab-test-${index}`}
        value={value}
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        placeholder="Search or type a test…"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-52 w-[min(24rem,100%)] overflow-y-auto rounded-card border border-hairline bg-surface py-1 shadow-dropdown">
          {matches.map((test) => (
            <li key={test.name}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
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
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Editor row — label-per-field + 1-tap chips (Design System V2 pattern).     */
/* ------------------------------------------------------------------------- */

function DermMedicineRow({
  index,
  medicine,
  onChange,
  onRemove,
  canManage,
}: {
  index: number;
  medicine: MedicineEntry;
  onChange: (index: number, field: keyof MedicineEntry, value: string) => void;
  onRemove: (index: number) => void;
  canManage: boolean;
}) {
  const catalogueNames = useMedicineCatalogueNames();
  const topical = isTopicalRow(medicine);
  return (
    <div className="rounded-card border border-hairline p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-1">
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
        <div>
          <label
            htmlFor={`derm-med-route-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            Route
          </label>
          <NativeSelect
            id={`derm-med-route-${index}`}
            value={medicine.route}
            onChange={(event) => onChange(index, "route", event.target.value)}
          >
            <option value="">Select route</option>
            {ROUTE_OPTIONS.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label
            htmlFor={`derm-med-form-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            {topical ? "Vehicle / form" : "Dosage form"}
          </label>
          <Input
            id={`derm-med-form-${index}`}
            value={medicine.form}
            onChange={(event) => onChange(index, "form", event.target.value)}
            placeholder={topical ? "e.g. Cream" : "e.g. Tablet"}
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor={`derm-med-frequency-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            Frequency
          </label>
          <Input
            id={`derm-med-frequency-${index}`}
            value={medicine.frequency}
            onChange={(event) =>
              onChange(index, "frequency", event.target.value)
            }
            placeholder="e.g. 1-0-1"
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor={`derm-med-duration-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            Duration
          </label>
          <Input
            id={`derm-med-duration-${index}`}
            value={medicine.duration}
            onChange={(event) =>
              onChange(index, "duration", event.target.value)
            }
            placeholder="e.g. 14 days"
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor={`derm-med-unit-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            {topical ? "Amount / FTU" : "Unit"}
          </label>
          <Input
            id={`derm-med-unit-${index}`}
            value={medicine.unit}
            onChange={(event) => onChange(index, "unit", event.target.value)}
            placeholder={topical ? "e.g. 1 FTU" : "e.g. 100 mg"}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label
            htmlFor={`derm-med-instructions-${index}`}
            className="text-ink mb-1 block text-[11.5px] font-bold"
          >
            Instructions
          </label>
          <Input
            id={`derm-med-instructions-${index}`}
            value={medicine.instructions}
            onChange={(event) =>
              onChange(index, "instructions", event.target.value)
            }
            placeholder="e.g. After meals; moisturiser on top"
            autoComplete="off"
          />
        </div>
      </div>

      {/* 1-tap chips */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink text-[11px] font-bold uppercase tracking-wide">
            Freq:
          </span>
          {FREQUENCY_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChange(index, "frequency", chip)}
              aria-pressed={medicine.frequency === chip}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                medicine.frequency === chip
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
              )}
            >
              {chip}
            </button>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink text-[11px] font-bold uppercase tracking-wide">
            Dur:
          </span>
          {DURATION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChange(index, "duration", chip)}
              aria-pressed={medicine.duration === chip}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                medicine.duration === chip
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
              )}
            >
              {chip}
            </button>
          ))}
        </span>
        {topical && (
          <>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink text-[11px] font-bold uppercase tracking-wide">
                Vehicle:
              </span>
              {VEHICLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChange(index, "form", chip)}
                  aria-pressed={medicine.form === chip}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    medicine.form === chip
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {chip}
                </button>
              ))}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink text-[11px] font-bold uppercase tracking-wide">
                Amount:
              </span>
              {AMOUNT_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChange(index, "unit", chip)}
                  aria-pressed={medicine.unit === chip}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    medicine.unit === chip
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {chip}
                </button>
              ))}
            </span>
          </>
        )}
      </div>

      {canManage && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:border-status-destructive hover:text-status-destructive"
          >
            <X aria-hidden="true" className="size-3" />
            Remove medicine
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Root builder — owns the whole draft + the single unified CTA (task §5).    */
/* ------------------------------------------------------------------------- */

export function DermRxMeds({
  patientId,
  patient,
  prescription,
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
  const [topicalForm, setTopicalForm] = useState<NonNullable<DermPrescription["topical_form"]>>(
    prescription?.topical_form ?? "cream",
  );
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<DermPrescription | null>(
    null,
  );
  const [printDraft, setPrintDraft] = useState<DermPrescription | null>(null);
  const [letterhead, setLetterhead] = useState<DermRxLetterhead | null>(null);
  const [clinician, setClinician] = useState("");

  useEffect(() => {
    void getClinicLetterheadAction().then((result) => {
      if (result.ok) setLetterhead(result.data);
    });
    void getCurrentClinicianInfoAction().then((result) => {
      if (result.ok) setClinician(result.data.name);
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

  /** Load a 1-click regimen template — replaces the draft with the protocol. */
  function loadRegimen(template: RegimenTemplate) {
    setItems(template.medicines.map((m) => ({ ...m })));
    setLabs(template.labOrders.map((l) => ({ ...l })));
    if (template.topicalForm) setTopicalForm(template.topicalForm);
    setApplication(template.application);
    setSkincareAm(template.skincareAm);
    setSkincarePm(template.skincarePm);
    setEducation(template.education);
    toast.success(
      `Loaded "${template.name}" — ${template.medicines.length} medicines${
        template.labOrders.length > 0 ? `, ${template.labOrders.length} labs` : ""
      } and advice filled. Review, then save.`,
    );
  }

  /** 1-tap lab panels (§3): append missing tests, keep whatever exists. */
  function applyLabPanel(
    panel: (typeof LAB_PANELS)[number],
  ) {
    setLabs((current) => {
      const existing = new Set(
        current.map((order) => order.test_name.trim().toLowerCase()),
      );
      const additions = panel.tests
        .filter((test) => !existing.has(test.name.toLowerCase()))
        .map((test) => ({ test_name: test.name, notes: test.notes }));
      if (additions.length === 0) {
        toast.info(`${panel.label} — all tests already on the list.`);
        return current;
      }
      toast.success(
        `${panel.label}: ${additions.length} test(s) added.`,
      );
      return [...current, ...additions];
    });
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

  /** The draft as it would save, for print + share. */
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
      topical_form: topicalForm,
      application_instructions: application.trim() || null,
      skincare_routine_am: skincareAm.trim() || null,
      skincare_routine_pm: skincarePm.trim() || null,
      patient_education: education.trim() || null,
      medicines,
      lab_orders,
      created_at: prescription?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /** One save for the whole draft. Printing always runs via the preview. */
  async function save() {
    if (!canManage) return;
    setPending(true);
    const result = await saveDermRxAction(
      patientId,
      {
        id: prescription?.id ?? null,
        topical_form: topicalForm,
        application_instructions: application.trim() || null,
        skincare_routine_am: skincareAm.trim() || null,
        skincare_routine_pm: skincarePm.trim() || null,
        patient_education: education.trim() || null,
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
      return;
    }
    toast.success("Prescription saved");
    router.refresh();
  }

  /** Stamp the current draft into the preview dialog (review → edit or print). */
  function openPreview() {
    setPreviewDraft(buildDraft());
    setPreviewOpen(true);
  }

  /** Print: close the dialog, then stamp the root auto-print sheet. */
  function printNow() {
    const draft = previewDraft ?? buildDraft();
    setPreviewOpen(false);
    setPrintDraft(draft);
  }

  /** Plain-text summary for WhatsApp / e-mail sharing. */
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

  function shareEmail() {
    if (!patient.email) {
      toast.error("Add an e-mail address to the patient profile first.");
      return;
    }
    const subject = `Dermatology prescription — ${patient.name}`;
    window.location.href = `mailto:${patient.email}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(shareText())}`;
  }

  const am = routineSteps(items, "am");
  const pm = routineSteps(items, "pm");

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
          today={today}
        />
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-3">
          {/* Quick regimens (§1) — simple name, chips only. */}
          <RecordSection
            title="Quick Regimens"
            meta="One tap fills medicines, labs & advice"
          >
            <div className="flex flex-wrap gap-1.5">
              {REGIMEN_TEMPLATES.map((template) => (
                <button
                  key={template.name}
                  type="button"
                  title={template.blurb}
                  onClick={() => loadRegimen(template)}
                  disabled={!canManage}
                  className="rounded-full border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {template.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-text-muted">
              Loading a regimen replaces the medicine, lab and advice draft
              with the protocol&apos;s first-line regimen — review before saving.
            </p>
          </RecordSection>

          {/* Medicines (§2) */}
          <RecordSection
            title="Medicines"
            meta={items.length > 0 ? `${items.length} item(s)` : "None yet"}
          >
            {items.length === 0 ? (
              <p className="text-[13px] text-text-muted">
                No medicines on the draft. Add rows, or load a regimen template
                above.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((medicine, index) => (
                  <DermMedicineRow
                    key={index}
                    index={index}
                    medicine={medicine}
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
          <RecordSection title="Investigations & labs" meta={labs.length > 0 ? `${labs.length} ordered` : "None yet"}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <span className="text-ink self-center text-[11px] font-bold uppercase tracking-wide">
                Quick panel:
              </span>
              {LAB_PANELS.map((panel) => (
                <button
                  key={panel.label}
                  type="button"
                  onClick={() => applyLabPanel(panel)}
                  disabled={!canManage}
                  className="rounded-full border border-hairline bg-app px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {panel.label}
                </button>
              ))}
            </div>
            {labs.length === 0 ? (
              <p className="text-[13px] text-text-muted">
                No investigations ordered yet — rows also accept manual typing.
              </p>
            ) : (
              <div className="space-y-2">
                {labs.map((order, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 items-end gap-2 rounded-card border border-hairline p-3 sm:grid-cols-[2fr_3fr_auto]"
                  >
                    <div className="relative">
                      <label
                        htmlFor={`derm-lab-test-${index}`}
                        className="text-ink mb-1 block text-[11.5px] font-bold"
                      >
                        Test
                      </label>
                      <LabTestCombobox
                        index={index}
                        value={order.test_name}
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

        {/* Column 3: routine preview + safety — recomputed live (spec §8.4) */}
        <div className="flex min-w-0 flex-col gap-3">
          <RecordSection title="Topical form" meta="One per prescription">
            <div className="flex flex-wrap gap-1.5">
              {(
                ["cream", "ointment", "gel", "lotion"] as const
              ).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTopicalForm(option)}
                  aria-pressed={topicalForm === option}
                  disabled={!canManage}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors disabled:opacity-50",
                    topicalForm === option
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-hairline bg-app text-text-secondary hover:border-primary/40 hover:text-primary",
                  )}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </RecordSection>

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

          <RecordSection title="Patient AM/PM routine" meta="From the current draft">
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
              <p className="text-[11px] leading-relaxed text-text-muted">
                Medicines whose frequency names a time of day (AM/PM,
                morning/night) are previewed under the matching routine.
              </p>
            </div>
          </RecordSection>

          <RecordSection title="Safety & interaction checks" meta="Live draft">
            <RxSafetyPanel medicines={items} allergies={allergies} />
          </RecordSection>
        </div>
      </div>

      {/* Unified action bar (§5): save / preview primary, share secondary. */}
      {canManage && (
        <div className="sticky bottom-0 z-10 -mx-1 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface/95 px-1 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? (
                <Save aria-hidden="true" className="size-3.5 animate-pulse" />
              ) : (
                <Save aria-hidden="true" className="size-3.5" />
              )}
              Save Prescription
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPreview}
              className="gap-1.5"
            >
              <Eye aria-hidden="true" className="size-3.5" />
              Preview & Print
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={shareWhatsApp}
              className="gap-1.5"
            >
              <MessageCircle aria-hidden="true" className="size-3.5" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={shareEmail}
              className="gap-1.5"
            >
              <Mail aria-hidden="true" className="size-3.5" />
              Email
            </Button>
          </div>
        </div>
      )}

      {/* Print preview dialog: review the sheet, edit the draft, or print. */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent size="wide" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Prescription preview</DialogTitle>
            <DialogDescription>
              The sheet prints exactly as shown. Edit anything, then preview
              again, or print now.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-card bg-app p-3">
            {previewDraft && (
              <DermRxPrint
                rx={previewDraft}
                patient={{
                  name: patient.name,
                  patient_code: patient.patient_code,
                  date_of_birth: patient.date_of_birth,
                  gender: patient.gender,
                }}
                letterhead={letterhead}
                clinician={clinician}
                today={today}
                variant="preview"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(false)}
              className="gap-1.5"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              Edit prescription
            </Button>
            <Button type="button" size="sm" onClick={printNow} className="gap-1.5">
              <Printer aria-hidden="true" className="size-3.5" />
              Print now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
