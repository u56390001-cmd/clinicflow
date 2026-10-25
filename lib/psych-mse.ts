/**
 * The Psychology Mental Status Examination model (0082).
 *
 * One source of truth for the MSE sections, their descriptor options and the
 * helpers that turn the stored `findings` JSON into (a) the live "Mental Status
 * Overview", (b) the legacy `risk_thoughts` string the read-only Overview &
 * Safety tab still reads, and (c) the digest handed to the assistant.
 *
 * Deliberately free of React and server imports so the client tab, the server
 * action and the AI summary share exactly one definition of the exam.
 */

/** A single MSE domain: the selected descriptors plus an observation note. */
export type MseFieldState = {
  options: string[];
  note: string;
};

/** The option-based MSE domains (everything except the free-text extras). */
export const MSE_FIELD_KEYS = [
  "appearance",
  "behavior",
  "consciousness",
  "orientation",
  "speech_rate",
  "speech_tone",
  "speech_quality",
  "mood",
  "affect",
  "thought_process",
  "thought_content",
  "perception",
  "cognition_orientation",
  "cognition_memory",
  "cognition_attention",
  "insight",
  "judgment",
  "risk",
  "functioning",
  "substance",
] as const;

export type MseFieldKey = (typeof MSE_FIELD_KEYS)[number];

/** Whole-exam state: one entry per domain, plus free-text extras. */
export type MseFindings = Partial<Record<MseFieldKey, MseFieldState>> & {
  /** Free clinical notes for the whole exam. */
  additional_notes?: string;
  /** MMSE total score, when the practitioner records one. */
  mmse?: string;
  /** MoCA total score, when the practitioner records one. */
  moca?: string;
};

/** Descriptor menu per domain. */
export const MSE_OPTIONS: Record<MseFieldKey, readonly string[]> = {
  appearance: ["Neat", "Disheveled", "Unkempt", "Poor hygiene", "Bizarre", "Appropriate dress"],
  behavior: [
    "Calm",
    "Cooperative",
    "Guarded",
    "Agitated",
    "Restless",
    "Withdrawn",
    "Hostile",
    "Suspicious",
    "Hyperactive",
  ],
  consciousness: ["Alert", "Drowsy", "Lethargic", "Stuporous", "Unresponsive"],
  orientation: ["Person", "Place", "Time", "Situation"],
  speech_rate: ["Normal", "Slow", "Rapid", "Pressured"],
  speech_tone: ["Normal", "Monotone", "Loud", "Soft"],
  speech_quality: ["Clear", "Slurred", "Incoherent", "Hesitant"],
  mood: ["Euthymic", "Depressed", "Anxious", "Irritable", "Elevated", "Angry", "Hopeless", "Fearful"],
  affect: ["Appropriate", "Congruent", "Restricted", "Blunted", "Flat", "Labile", "Incongruent"],
  thought_process: [
    "Logical",
    "Linear",
    "Circumstantial",
    "Tangential",
    "Flight of ideas",
    "Loose associations",
    "Thought blocking",
    "Perseverative",
  ],
  thought_content: [
    "Normal",
    "Worries",
    "Obsessions",
    "Delusions",
    "Paranoia",
    "Guilt",
    "Hopelessness",
    "Grandiosity",
    "Suicidal thoughts",
    "Homicidal thoughts",
  ],
  perception: [
    "Normal",
    "Auditory hallucination",
    "Visual hallucination",
    "Tactile",
    "Olfactory",
    "Illusions",
    "Derealization",
    "Depersonalization",
  ],
  cognition_orientation: ["Person", "Place", "Time", "Situation", "Fully oriented", "Disoriented"],
  cognition_memory: ["Intact", "Immediate intact", "Recent impaired", "Remote impaired", "Impaired"],
  cognition_attention: ["Intact", "Mild impairment", "Impaired"],
  insight: ["Good", "Partial", "Poor", "Absent"],
  judgment: ["Intact", "Good", "Fair", "Impaired", "Absent"],
  risk: ["No current risk", "Suicidal thoughts", "Suicide plan", "Self-harm", "Harm to others"],
  functioning: ["Independent", "Needs support", "Impaired"],
  substance: ["None", "Alcohol", "Tobacco", "Cannabis", "Stimulants", "Opioids", "Sedatives", "Other"],
};

/** Full accessible name for a domain (used as the field label / aria-label). */
export const MSE_FIELD_LABELS: Record<MseFieldKey, string> = {
  appearance: "Appearance",
  behavior: "Behavior & attitude",
  consciousness: "Consciousness",
  orientation: "Orientation",
  speech_rate: "Speech rate",
  speech_tone: "Speech tone",
  speech_quality: "Speech quality",
  mood: "Mood",
  affect: "Affect",
  thought_process: "Thought process",
  thought_content: "Thought content",
  perception: "Perception",
  cognition_orientation: "Orientation",
  cognition_memory: "Memory",
  cognition_attention: "Attention",
  insight: "Insight",
  judgment: "Judgment",
  risk: "Risk",
  functioning: "Functioning / ADLs",
  substance: "Substance use",
};

/** Short labels for domains that share a section (Speech, Cognition). */
export const MSE_FIELD_SHORT_LABELS: Partial<Record<MseFieldKey, string>> = {
  speech_rate: "Rate",
  speech_tone: "Tone",
  speech_quality: "Quality",
  cognition_orientation: "Orientation",
  cognition_memory: "Memory",
  cognition_attention: "Attention",
};

export type MseSectionDef = {
  id: string;
  title: string;
  description?: string;
  fields: MseFieldKey[];
  /** Note prompt; presence enables the per-section observation note. */
  noteLabel?: string;
  /** Render MMSE / MoCA score inputs. */
  scores?: boolean;
  /** A free-text-only section (Additional Notes). */
  kind?: "notes";
};

/** The examination, section by section, in the order a clinician expects. */
export const MSE_SECTIONS: MseSectionDef[] = [
  {
    id: "appearance",
    title: "Appearance",
    description: "Grooming, clothing, posture, physical appearance.",
    fields: ["appearance"],
    noteLabel: "Observation",
  },
  { id: "behavior", title: "Behavior & Attitude", fields: ["behavior"], noteLabel: "Observation" },
  { id: "consciousness", title: "Consciousness", fields: ["consciousness"], noteLabel: "Observation" },
  { id: "orientation", title: "Orientation", fields: ["orientation"], noteLabel: "Observation" },
  {
    id: "speech",
    title: "Speech",
    fields: ["speech_rate", "speech_tone", "speech_quality"],
    noteLabel: "Observation",
  },
  { id: "mood", title: "Mood", fields: ["mood"], noteLabel: "Patient's own words" },
  { id: "affect", title: "Affect", fields: ["affect"], noteLabel: "Observation" },
  { id: "thought_process", title: "Thought Process", fields: ["thought_process"], noteLabel: "Observation" },
  { id: "thought_content", title: "Thought Content", fields: ["thought_content"], noteLabel: "Observation" },
  { id: "perception", title: "Perception", fields: ["perception"], noteLabel: "Observation" },
  {
    id: "cognition",
    title: "Cognition",
    description: "Orientation, memory, attention and instrument scores.",
    fields: ["cognition_orientation", "cognition_memory", "cognition_attention"],
    noteLabel: "Observation",
    scores: true,
  },
  { id: "insight", title: "Insight", fields: ["insight"], noteLabel: "Observation" },
  { id: "judgment", title: "Judgment", fields: ["judgment"], noteLabel: "Observation" },
  {
    id: "risk",
    title: "Risk Assessment",
    description: "Intent, plan, means and protective factors.",
    fields: ["risk"],
    noteLabel: "Notes",
  },
  { id: "functioning", title: "Functioning / ADLs", fields: ["functioning"], noteLabel: "Observation" },
  {
    id: "substance",
    title: "Substance Use",
    description: "Frequency, quantity, duration, last use.",
    fields: ["substance"],
    noteLabel: "Details",
  },
  { id: "notes", title: "Additional Notes", kind: "notes", fields: [] },
];

/** Section lookup so card groupings can reference sections by id. */
export const MSE_SECTIONS_BY_ID: Record<string, MseSectionDef> = Object.fromEntries(
  MSE_SECTIONS.map((section) => [section.id, section]),
);

/** One permanently-open exam panel in the 2-column grid. */
export type MseCardGroupDef = {
  id: string;
  title: string;
  /** Icon hint, resolved by the workspace tab. */
  icon?: "user" | "message" | "brain" | "gauge";
  /** Section ids from `MSE_SECTIONS`, in render order. */
  sections: string[];
};

/** The four exam panels, visual order (left→right, row by row). */
export const MSE_CARD_GROUPS: MseCardGroupDef[] = [
  {
    id: "general",
    icon: "user",
    title: "General appearance, attitude & consciousness",
    sections: ["appearance", "behavior", "consciousness", "orientation", "functioning"],
  },
  {
    id: "speech",
    icon: "message",
    title: "Speech, mood & affect",
    sections: ["speech", "mood", "affect"],
  },
  {
    id: "thought",
    icon: "brain",
    title: "Thought, perception & notes",
    sections: ["thought_process", "thought_content", "perception", "notes"],
  },
  {
    id: "cognition",
    icon: "gauge",
    title: "Cognition, insight & safety risk",
    sections: ["cognition", "insight", "judgment", "risk", "substance"],
  },
];

/**
 * Standard unremarkable exam for the "Set normal baseline" quick action.
 * Tokens match `MSE_OPTIONS` exactly so chips render as selected. The baseline
 * only replaces chip selections — notes and score values are preserved by the
 * caller.
 */
export const MSE_NORMAL_BASELINE: Record<MseFieldKey, string[]> = {
  appearance: ["Neat", "Appropriate dress"],
  behavior: ["Calm", "Cooperative"],
  consciousness: ["Alert"],
  orientation: ["Person", "Place", "Time", "Situation"],
  speech_rate: ["Normal"],
  speech_tone: ["Normal"],
  speech_quality: ["Clear"],
  mood: ["Euthymic"],
  affect: ["Appropriate"],
  thought_process: ["Logical"],
  thought_content: ["Normal"],
  perception: ["Normal"],
  cognition_orientation: ["Fully oriented"],
  cognition_memory: ["Intact"],
  cognition_attention: ["Intact"],
  insight: ["Good"],
  judgment: ["Intact"],
  risk: ["No current risk"],
  functioning: ["Independent"],
  substance: ["None"],
};

export function emptyMseFinding(): MseFieldState {
  return { options: [], note: "" };
}

export function isMseFieldKey(value: string): value is MseFieldKey {
  return (MSE_FIELD_KEYS as readonly string[]).includes(value);
}

/**
 * Coerces stored JSON (or an untrusted payload) into a clean `MseFindings`.
 * Unknown keys are dropped, option lists are bounded and de-duplicated, and
 * text is trimmed — so a malformed row can never render junk or overflow.
 */
export function readMseFindings(raw: unknown): MseFindings {
  const out: MseFindings = {};
  if (!raw || typeof raw !== "object") return out;
  const record = raw as Record<string, unknown>;

  for (const key of MSE_FIELD_KEYS) {
    const value = record[key];
    if (!value || typeof value !== "object") continue;
    const entry = value as { options?: unknown; note?: unknown };
    const seen = new Set<string>();
    const options = Array.isArray(entry.options)
      ? entry.options
          .filter((option): option is string => typeof option === "string")
          .map((option) => option.trim())
          .filter((option) => {
            if (!option || seen.has(option)) return false;
            seen.add(option);
            return true;
          })
          .slice(0, 24)
      : [];
    const note = typeof entry.note === "string" ? entry.note.slice(0, 2000) : "";
    if (options.length > 0 || note.trim()) {
      out[key] = { options, note };
    }
  }

  for (const key of ["additional_notes", "mmse", "moca"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = value.slice(0, 4000);
    }
  }

  return out;
}

/** True when the exam holds at least one recorded finding or note. */
export function hasMseFindings(findings: MseFindings): boolean {
  for (const key of MSE_FIELD_KEYS) {
    const state = findings[key];
    if (state && (state.options.length > 0 || state.note.trim())) return true;
  }
  return Boolean(
    findings.additional_notes?.trim() || findings.mmse?.trim() || findings.moca?.trim(),
  );
}

/** How many findings a section holds (options + note), for the section badge. */
export function sectionFindingCount(findings: MseFindings, section: MseSectionDef): number {
  if (section.kind === "notes") {
    return findings.additional_notes?.trim() ? 1 : 0;
  }
  let count = 0;
  for (const field of section.fields) {
    const state = findings[field];
    if (!state) continue;
    count += state.options.length;
    if (state.note.trim()) count += 1;
  }
  if (section.scores) {
    if (findings.mmse?.trim()) count += 1;
    if (findings.moca?.trim()) count += 1;
  }
  return count;
}

function joinOptions(state: MseFieldState | undefined): string {
  return state ? state.options.join(", ") : "";
}

/** Risk severity for the overview + safety signal. */
export function mseRiskLevel(findings: MseFindings): "none" | "low" | "moderate" | "high" {
  const selected = findings.risk?.options ?? [];
  if (selected.length === 0) return "none";
  const high = selected.some(
    (option) =>
      option === "Suicide plan" ||
      option === "Self-harm" ||
      option === "Harm to others" ||
      /active/i.test(option),
  );
  if (high) return "high";
  const onlyNone = selected.length === 1 && selected[0] === "No current risk";
  if (onlyNone) return "low";
  return "moderate";
}

/**
 * The legacy `risk_thoughts` string, kept so the read-only Overview & Safety
 * tab (which infers risk from this column) keeps working unchanged. The leading
 * severity word is what its substring match reads.
 */
export function riskThoughtsFromFindings(findings: MseFindings): string {
  const selected = findings.risk?.options ?? [];
  if (selected.length === 0 || (selected.length === 1 && selected[0] === "No current risk")) {
    return "None";
  }
  const severity = mseRiskLevel(findings) === "high" ? "Active" : "Passive";
  return `${severity} · ${selected.join(", ")}`;
}

function cognitionSummary(findings: MseFindings): string {
  const parts = [
    joinOptions(findings.cognition_orientation),
    joinOptions(findings.cognition_memory),
    joinOptions(findings.cognition_attention),
  ].filter(Boolean);
  if (findings.mmse?.trim()) parts.push(`MMSE ${findings.mmse.trim()}`);
  if (findings.moca?.trim()) parts.push(`MoCA ${findings.moca.trim()}`);
  return parts.join(", ");
}

/** The final "Mental Status Overview" rows, in the reference's order. */
export function buildMseOverview(findings: MseFindings): Array<{ label: string; value: string }> {
  const speech = [
    joinOptions(findings.speech_rate),
    joinOptions(findings.speech_tone),
    joinOptions(findings.speech_quality),
  ].filter(Boolean);
  const speechValue =
    speech.length === 0
      ? ""
      : speech.every((part) => part === "Normal")
        ? "Normal"
        : speech.join(", ");

  const riskLevel = mseRiskLevel(findings);
  const riskValue =
    riskLevel === "none" ? "" : riskLevel[0].toUpperCase() + riskLevel.slice(1);

  const rows: Array<{ label: string; value: string }> = [
    { label: "Appearance", value: joinOptions(findings.appearance) },
    { label: "Behavior", value: joinOptions(findings.behavior) },
    { label: "Consciousness", value: joinOptions(findings.consciousness) },
    { label: "Speech", value: speechValue },
    { label: "Mood", value: joinOptions(findings.mood) },
    { label: "Affect", value: joinOptions(findings.affect) },
    { label: "Thought", value: joinOptions(findings.thought_process) },
    { label: "Perception", value: joinOptions(findings.perception) },
    { label: "Cognition", value: cognitionSummary(findings) },
    { label: "Insight", value: joinOptions(findings.insight) },
    { label: "Judgment", value: joinOptions(findings.judgment) },
    { label: "Risk", value: riskValue },
    { label: "Functioning", value: joinOptions(findings.functioning) },
    { label: "Substance", value: joinOptions(findings.substance) },
  ];

  return rows.filter((row) => row.value.trim().length > 0);
}

/** A concise one-line summary rendered live as the psychologist selects. */
export function mseSummarySentence(findings: MseFindings): string {
  if (!hasMseFindings(findings)) return "";
  const behavior = joinOptions(findings.behavior).toLowerCase() || "calm and cooperative";
  const clauses: string[] = [];
  const mood = joinOptions(findings.mood).toLowerCase();
  if (mood) clauses.push(`${mood} mood`);
  const affect = joinOptions(findings.affect).toLowerCase();
  if (affect) clauses.push(`${affect} affect`);
  const thought = joinOptions(findings.thought_process).toLowerCase();
  if (thought) clauses.push(`${thought} thought process`);
  const cognition = cognitionSummary(findings).toLowerCase();
  if (cognition) clauses.push(`${cognition} cognition`);

  const riskLevel = mseRiskLevel(findings);
  const riskClause =
    riskLevel === "none" || riskLevel === "low"
      ? "no current safety risk identified"
      : riskLevel === "moderate"
        ? "some safety concerns identified"
        : "a significant safety risk identified";

  const head = `Patient appeared ${behavior}`;
  const body = clauses.length > 0 ? ` with ${clauses.join(", ")}` : "";
  return `${head}${body} and ${riskClause}.`;
}

/** A labelled digest of the exam for the assistant prompt. */
export function mseFindingsDigest(findings: MseFindings): string {
  const lines: string[] = [];
  for (const section of MSE_SECTIONS) {
    if (section.kind === "notes" || section.fields.length === 0) continue;
    const parts: string[] = [];
    for (const field of section.fields) {
      const state = findings[field];
      if (!state) continue;
      const short = MSE_FIELD_SHORT_LABELS[field];
      const value = state.options.join(", ");
      if (value) parts.push(short ? `${short}: ${value}` : value);
      if (state.note.trim()) parts.push(`${short ?? "note"}: ${state.note.trim()}`);
    }
    if (section.scores) {
      if (findings.mmse?.trim()) parts.push(`MMSE: ${findings.mmse.trim()}`);
      if (findings.moca?.trim()) parts.push(`MoCA: ${findings.moca.trim()}`);
    }
    if (parts.length > 0) lines.push(`${section.title} — ${parts.join("; ")}`);
  }
  if (findings.additional_notes?.trim()) {
    lines.push(`Additional notes — ${findings.additional_notes.trim()}`);
  }
  return lines.join("\n");
}
