/**
 * One render pipeline for the Rx. Everything the editor preview, WhatsApp
 * share text and A4 print show is built ONCE here from the typed model and
 * the i18n module — no component re-writes the prescription.
 */

import type { RxItem } from "../schema/rx-item";
import {
  localeDirection,
  itemText,
  type RxLocale,
  type TextDirection,
} from "./i18n";

export type RxLine = {
  /** 1-based item number on the sheet. */
  index: number;
  /** Brand/custom name (identical glyphs in all locales). */
  title: string;
  /** The rendered instruction sentence for the current locale. */
  detail: string;
  /** True when the doctor wrote a custom instruction (badge on print). */
  isCustomNote: boolean;
};

export type RxSection = {
  kind: "medicines" | "routine" | "labs" | "advice" | "followUp";
  heading: string;
  lines: RxLine[];
  /** Two-column AM/PM routine (heading is the column label). */
  columns?: { heading: string; lines: string[] }[];
};

export type RxDocument = {
  direction: TextDirection;
  locale: RxLocale;
  rxId: string | null;
  version: number;
  /** Issued date (ISO date) shown under the letterhead + in the QR payload. */
  issuedOn: string;
  patient: {
    name: string;
    code: string | null;
    age: string | null;
    gender: string | null;
  };
  clinician: string;
  diagnosis: string | null;
  icdCode: string | null;
  procedures: string[];
  lines: RxLine[];
  sections: RxSection[];
  followUp: string | null;
  meta: {
    application: string;
    education: string;
    skincareAm: string[];
    skincarePm: string[];
  };
};

export type RxDocumentInput = {
  locale: RxLocale;
  items: RxItem[];
  rxId?: string | null;
  version?: number;
  /** ISO date the Rx is issued (row created/updated date). */
  issuedOn?: string;
  patient: { name: string; code?: string | null; age?: string | null; gender?: string | null };
  clinician: string;
  diagnosis?: string | null;
  icdCode?: string | null;
  procedures?: string[];
  meta?: {
    application?: string;
    education?: string;
    skincareAm?: string[];
    skincarePm?: string[];
  };
  labs?: { test_name: string; notes: string }[];
  followUp?: string | null;
};

const H: Record<RxLocale, Record<string, string>> = {
  en: {
    medicines: "Medicines",
    routine: "AM / PM routine",
    subah: "Morning",
    raat: "Night",
    otherSchedule: "Other schedule",
    labs: "Investigations",
    advice: "Advice & instructions",
    application: "Application",
    education: "Patient education",
    skincare: "Skincare steps",
    followUp: "Follow-up",
    diagnosis: "Diagnosis",
    procedure: "Procedures",
  },
  roman: {
    medicines: "Dawaiyan",
    routine: "Subah / Raat routine",
    subah: "Subah",
    raat: "Raat",
    otherSchedule: "Other schedule",
    labs: "Investigations",
    advice: "Advice & hidayat",
    application: "Istemaal ka tareeqa",
    education: "Patient hidayat",
    skincare: "Skincare steps",
    followUp: "Follow-up",
    diagnosis: "Diagnosis",
    procedure: "Procedures",
  },
  urdu: {
    medicines: "دوائیں",
    routine: "صبح / رات روٹین",
    subah: "صبح",
    raat: "رات",
    otherSchedule: "دیگر شیڈول",
    labs: "ٹیسٹ",
    advice: "مشورے و ہدایات",
    application: "استعمال کا طریقہ",
    education: "مریض کے لیے ہدایات",
    skincare: "اسکن کیئر مراحل",
    followUp: "فالو اپ",
    diagnosis: "تشخیص",
    procedure: "تدابیر",
  },
};

export function sectionHeadings(locale: RxLocale) {
  return H[locale];
}

/** The medicine lines + doc sections in one deterministic call. */
export function buildRxViewModel(input: RxDocumentInput): RxDocument {
  const locale = input.locale;
  const headings = H[locale];
  const meta = input.meta ?? {};

  const lines: RxLine[] = input.items.map((item, index) => ({
    index: index + 1,
    title: item.brand,
    detail: itemText(item, locale),
    isCustomNote: item.instruction.mode === "custom",
  }));

  const routineColumns = [
    { heading: headings.subah, lines: meta.skincareAm ?? [] },
    { heading: headings.raat, lines: meta.skincarePm ?? [] },
  ];

  const sections: RxSection[] = [];
  if ((meta.skincareAm?.length ?? 0) + (meta.skincarePm?.length ?? 0) > 0) {
    sections.push({
      kind: "routine",
      heading: headings.routine,
      lines: [],
      columns: routineColumns,
    });
  }
  if (meta.application?.trim()) {
    sections.push({
      kind: "advice",
      heading: headings.application,
      lines: [
        {
          index: 0,
          title: headings.application,
          detail: meta.application.trim(),
          isCustomNote: false,
        },
      ],
    });
  }
  if (meta.education?.trim()) {
    sections.push({
      kind: "advice",
      heading: headings.education,
      lines: [
        {
          index: 0,
          title: headings.education,
          detail: meta.education.trim(),
          isCustomNote: false,
        },
      ],
    });
  }
  const labs = (input.labs ?? []).filter((l) => l.test_name.trim());
  if (labs.length > 0) {
    sections.push({
      kind: "labs",
      heading: headings.labs,
      lines: labs.map((row, index) => ({
        index: index + 1,
        title: row.test_name,
        detail: row.notes.trim(),
        isCustomNote: false,
      })),
    });
  }

  return {
    direction: localeDirection(locale),
    locale,
    rxId: input.rxId ?? null,
    version: input.version ?? 1,
    issuedOn: input.issuedOn ?? new Date().toISOString().slice(0, 10),
    patient: {
      name: input.patient.name,
      code: input.patient.code ?? null,
      age: input.patient.age ?? null,
      gender: input.patient.gender ?? null,
    },
    clinician: input.clinician,
    diagnosis: input.diagnosis ?? null,
    icdCode: input.icdCode ?? null,
    procedures: input.procedures ?? [],
    lines,
    sections,
    followUp: input.followUp ?? null,
    meta: {
      application: meta.application ?? "",
      education: meta.education ?? "",
      skincareAm: meta.skincareAm ?? [],
      skincarePm: meta.skincarePm ?? [],
    },
  };
}

/** Share text (WhatsApp) — mirrors exactly what the print sheet shows. */
export function documentToShareText(doc: RxDocument): string {
  const title = doc.patient.name;
  const head = `${title} — ${doc.issuedOn}`;
  const body = doc.lines
    .map((line) => `${line.index}. ${line.title}: ${line.detail}`)
    .join("\n");
  const extras = doc.sections
    .map((section) => {
      if (section.columns) {
        return section.columns
          .map((column) =>
            [section.heading + " — " + column.heading, ...column.lines].join("\n"),
          )
          .join("\n");
      }
      return [section.heading, ...section.lines.map((l) => ` • ${l.detail}`)].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  const followUp = doc.followUp ? `\n\n${H[doc.locale].followUp}: ${doc.followUp}` : "";
  const sign = `\n— ${doc.clinician}`;
  return [head, body, extras ? `\n${extras}` : "", followUp, sign]
    .filter(Boolean)
    .join("\n");
}
