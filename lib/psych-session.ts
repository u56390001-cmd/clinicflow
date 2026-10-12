/**
 * Session-note vocabulary shared by the Psychology workspace tab, its server
 * actions and the AI note writers — one source of truth for the note formats
 * (BIRP / SOAP / DAP), the sections each format shows, and the columns that
 * back them. Server-agnostic on purpose: imported by client components too.
 */

import type { PsychSession } from "@/types/database";

export const NOTE_FORMATS = ["BIRP", "SOAP", "DAP"] as const;
export type SessionNoteFormat = (typeof NOTE_FORMATS)[number];

export const SESSION_TYPES = [
  "initial",
  "individual",
  "follow_up",
  "crisis",
  "group",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_DEFAULT_FORMAT: SessionNoteFormat = "BIRP";

export const SESSION_TYPE_META: Record<SessionType, string> = {
  initial: "Initial assessment",
  individual: "Individual therapy",
  follow_up: "Follow-up",
  crisis: "Crisis",
  group: "Group",
};

/** One-line descriptions shown in the format selector's options. */
export const NOTE_FORMAT_META: Record<SessionNoteFormat, string> = {
  BIRP: "Behavior, Intervention, Response, Plan",
  SOAP: "Subjective, Objective, Assessment, Plan",
  DAP: "Data, Assessment, Plan",
};

/** Every section a session note can hold, in a stable order. */
export const SESSION_SECTION_KEYS = [
  "behavior",
  "intervention",
  "response",
  "subjective",
  "objective",
  "observation_data",
  "assessment",
  "plan",
] as const;
export type SessionSectionKey = (typeof SESSION_SECTION_KEYS)[number];

export const SESSION_SECTION_LABELS: Record<SessionSectionKey, string> = {
  behavior: "Behavior",
  intervention: "Intervention",
  response: "Response",
  subjective: "Subjective",
  objective: "Objective",
  observation_data: "Data",
  assessment: "Assessment",
  plan: "Plan",
};

/** Which sections a format shows, in the order a clinician reads them. */
export const SESSION_SECTIONS: Record<
  SessionNoteFormat,
  ReadonlyArray<{ key: SessionSectionKey; label: string }>
> = {
  BIRP: [
    { key: "behavior", label: "Behavior" },
    { key: "intervention", label: "Intervention" },
    { key: "response", label: "Response" },
    { key: "plan", label: "Plan" },
  ],
  SOAP: [
    { key: "subjective", label: "Subjective" },
    { key: "objective", label: "Objective" },
    { key: "assessment", label: "Assessment" },
    { key: "plan", label: "Plan" },
  ],
  DAP: [
    { key: "observation_data", label: "Data" },
    { key: "assessment", label: "Assessment" },
    { key: "plan", label: "Plan" },
  ],
};

/**
 * Sections of a persisted note with content, in the format's reading order.
 * Used by the history rows and the print preview so both stay in sync.
 */
export function sessionSectionEntries(
  session: PsychSession,
): Array<{ key: SessionSectionKey; label: string; value: string }> {
  const entries: Array<{ key: SessionSectionKey; label: string; value: string }> = [];
  for (const { key, label } of SESSION_SECTIONS[session.format] ?? []) {
    const value = session[key];
    if (value?.trim()) entries.push({ key, label, value: value.trim() });
  }
  return entries;
}

/** Changes a row's section texts into the flat `{ key: text }` shape the editor drafts with. */
export function sessionToDraftFields(
  session: PsychSession,
): Record<SessionSectionKey, string> {
  const fields = {} as Record<SessionSectionKey, string>;
  for (const key of SESSION_SECTION_KEYS) {
    fields[key] = session[key]?.trim() ?? "";
  }
  return fields;
}