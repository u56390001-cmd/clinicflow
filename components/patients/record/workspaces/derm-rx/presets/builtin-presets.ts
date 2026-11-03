/**
 * Built-in derma protocol presets + clinic template shape. Moved verbatim
 * from the legacy builder (derm-rx-meds.tsx) during the Phase 6 cutover so
 * the templates keep identical medicines/chip strings the parser accepts.
 */

import type { LegacyMedicineEntry } from "../schema/rx-item";

export type PresetLabOrder = { test_name: string; notes: string };

export type LoadablePreset = {
  name: string;
  description: string;
  medicines: LegacyMedicineEntry[];
  labOrders: PresetLabOrder[];
  application: string;
  skincareAm: string;
  skincarePm: string;
  education: string;
  followUp: string;
  source: "builtin" | "clinic";
};

export const BUILTIN_PRESETS: LoadablePreset[] = [
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