/**
 * Specialty-Based Doctor Workspace Engine — `docs/specialty-based workspace
 * routing.txt`.
 *
 * A doctor's clinical workspace is DERIVED from `doctors.specialty`, never
 * stored. General Physician → the existing General Medical workspace (untouched),
 * Clinical Psychologist / Psychiatry aliases → the Psychology workspace,
 * Dermatology → the Dermatology workspace; anything else falls back to General.
 *
 * THE RULE: `doctor.specialty → workspace configuration → clinical tabs`. Adding
 * a future specialty (Dentist, Physiotherapist, Gynaecologist, ENT, …) means
 * adding one map entry, not new admin setup or stored state.
 *
 * The general workspace reuses the record's existing `PATIENT_TABS`; the two new
 * workspaces carry their own URL `?tab=` ids, which the shared tab parameter
 * union (`PatientTabId`) admits so the record keeps one URL-driven tab system.
 */

export const WORKSPACE_KINDS = ["general", "psychology", "dermatology"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

/** The general medical workspace's tab ids — mirrors `PATIENT_TABS`. */
export const GENERAL_TAB_IDS = [
  "overview",
  "health_info",
  "vitals",
  "medications",
  "documents",
  "appointments",
] as const;
export type GeneralTabId = (typeof GENERAL_TAB_IDS)[number];

export const PSYCH_TAB_IDS = [
  "psy_overview",
  "psy_intake",
  "psy_mse",
  "psy_sessions",
  "psy_psychometrics",
  "psy_documents",
  "psy_care_plan",
] as const;
export type PsychTabId = (typeof PSYCH_TAB_IDS)[number];

export const DERM_TAB_IDS = [
  "derm_overview",
  "derm_exam",
  "derm_photos",
  "derm_procedures",
  "derm_rx",
  "derm_documents",
] as const;
export type DermTabId = (typeof DERM_TAB_IDS)[number];

export type SpecialtyTabId = PsychTabId | DermTabId;

/** Every `?tab=` id the record accepts, across workspaces. */
export type PatientTabId = GeneralTabId | SpecialtyTabId;

export const SPECIALTY_TAB_IDS: readonly SpecialtyTabId[] = [
  ...PSYCH_TAB_IDS,
  ...DERM_TAB_IDS,
];

export function isSpecialtyTabId(value: string): value is SpecialtyTabId {
  return (SPECIALTY_TAB_IDS as readonly string[]).includes(value);
}

/** Nav labels for the specialty tab sets (general labels live in PATIENT_TAB_LABELS). */
export const SPECIALTY_TAB_LABELS: Record<SpecialtyTabId, string> = {
  psy_overview: "Overview & Safety",
  psy_intake: "Intake & History",
  psy_mse: "Mental Status Exam",
  psy_sessions: "Session Notes",
  psy_psychometrics: "Psychometrics",
  psy_documents: "Documents",
  psy_care_plan: "Care Plan",
  derm_overview: "Overview & History",
  derm_exam: "Examination & Diagnosis",
  derm_photos: "Photos & Body Map",
  derm_procedures: "Procedures & Biopsy",
  derm_rx: "Prescriptions",
  derm_documents: "Documents",
};

/**
 * One workspace's clinical shape. `tabs` is the tab set for the specialty
 * workspaces; the general workspace's `tabs` is undefined because it reuses
 * the existing `PATIENT_TABS` rather than owning a parallel list.
 */
export type WorkspaceConfig = {
  kind: WorkspaceKind;
  /** e.g. "Clinical Psychology" — header + AI context copy. */
  name: string;
  description: string;
  tabs: readonly SpecialtyTabId[] | undefined;
  /** Tab the record opens when the param is missing or belongs to another set. */
  defaultTab: PatientTabId;
  /** The tab the banner's primary writing CTA opens. */
  writeTab: PatientTabId;
  /** Label for that CTA — psychology reads "Write session note", not Rx. */
  writeTabLabel: string;
  /** Copilot context the drawer labels itself with. */
  copilotContext: string;
  /** The patient rail's heading (spec: Patient Context / Patient Skin Profile). */
  contextHeading: string;
};

const PSYCHOLOGY_SPECIALTIES = new Set([
  "clinical psychologist",
  "psychology",
  "psychologist",
  "psychiatry",
  "psychiatrist",
  "mental health",
]);

const DERMATOLOGY_SPECIALTIES = new Set([
  "dermatology",
  "dermatologist",
  "skin specialist",
]);

/** Normalise a specialty string for the map lookup. */
function key(specialty: string | null | undefined): string {
  return (specialty ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The core of the engine: specialty text → workspace kind. Case/space
 * insensitive, null/empty → general, unknown → general (fail-safe: a clinic can
 * carry doctors whose specialty is free text, and none of them should lose the
 * existing workspace).
 */
export function resolveDoctorWorkspace(
  specialty: string | null | undefined,
): WorkspaceKind {
  const k = key(specialty);
  if (DERMATOLOGY_SPECIALTIES.has(k)) return "dermatology";
  if (PSYCHOLOGY_SPECIALTIES.has(k)) return "psychology";
  return "general";
}

export const GENERAL_WORKSPACE: WorkspaceConfig = {
  kind: "general",
  name: "General Medical",
  description: "Primary care record — history, vitals, prescriptions, documents.",
  tabs: undefined,
  defaultTab: "overview",
  writeTab: "medications",
  writeTabLabel: "Write Prescription",
  copilotContext:
    "General physician copilot: clinical summary and prescription assistance.",
  contextHeading: "Patient Context",
};

export const PSYCHOLOGY_WORKSPACE: WorkspaceConfig = {
  kind: "psychology",
  name: "Clinical Psychology",
  description:
    "Mental health record — safety, intake, examination, BIRP/DAP notes, psychometrics and care planning.",
  tabs: PSYCH_TAB_IDS,
  defaultTab: "psy_overview",
  writeTab: "psy_sessions",
  writeTabLabel: "Write session note",
  copilotContext:
    "Psychology copilot: session summary, BIRP/DAP draft and risk alerts.",
  contextHeading: "Patient Context",
};

export const DERMATOLOGY_WORKSPACE: WorkspaceConfig = {
  kind: "dermatology",
  name: "Dermatology",
  description:
    "Skin record — profile, examination, photo & body mapping, procedures and topical prescriptions.",
  tabs: DERM_TAB_IDS,
  defaultTab: "derm_overview",
  writeTab: "derm_rx",
  writeTabLabel: "Write prescription",
  copilotContext:
    "Dermatology copilot: clinical note assistance, photo observation summary and patient instructions.",
  contextHeading: "Patient Skin Profile",
};

export const PATIENT_WORKSPACES: Record<WorkspaceKind, WorkspaceConfig> = {
  general: GENERAL_WORKSPACE,
  psychology: PSYCHOLOGY_WORKSPACE,
  dermatology: DERMATOLOGY_WORKSPACE,
};

export function workspaceForKind(kind: WorkspaceKind): WorkspaceConfig {
  return PATIENT_WORKSPACES[kind];
}