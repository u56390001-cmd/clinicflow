/**
 * 📋 Push a snippet into the psychology session-note draft.
 *
 * The Session Notes tab restores a localStorage draft on mount
 * (`psych-session-draft:{patientId}`); writing into that draft from anywhere in
 * the workspace means the clinician never retypes a value — they see it when
 * they open the tab. The snippet lands in the field the *saved draft's* format
 * already uses (BIRP Behavior / SOAP Objective / DAP Data), or — when the
 * caller names a target — the fixed field the content belongs to (the Care
 * Plan pushes into `plan`, i.e. BIRP P / SOAP P / DAP P: every format shares it).
 *
 * Shared by the Psychometrics, Documents and Care Plan tabs so all push
 * through one code path.
 */

const DRAFT_FORMATS = ["BIRP", "SOAP", "DAP"] as const;

/** A draft field can be forced by callers whose snippet belongs to one slot. */
type ForcedField = "behavior" | "intervention" | "response" | "subjective" | "objective" | "observation_data" | "assessment" | "plan";

const FIELD_LABELS: Record<ForcedField, string> = {
  behavior: "Behavior",
  intervention: "Intervention",
  response: "Response",
  subjective: "Subjective",
  objective: "Objective",
  observation_data: "Data",
  assessment: "Assessment",
  plan: "Plan",
};

type SessionDraftShape = {
  format?: string;
  draft?: unknown;
};

type PushOk = {
  ok: true;
  /** Format actually used, e.g. "SOAP" when no draft was saved yet. */
  format: string;
  /** Human label for the field written, e.g. "Objective". */
  fieldLabel: string;
};

export type SessionNotePushResult = PushOk | { ok: false };

export function pushSnippetToSessionDraft(
  patientId: string,
  snippet: string,
  /** Force a slot when the content belongs to one (e.g. Care Plan → Plan). */
  forcedField?: ForcedField,
): SessionNotePushResult {
  if (typeof window === "undefined") return { ok: false };
  if (!snippet.trim()) return { ok: false };

  const draftKey = `psych-session-draft:${patientId}`;
  try {
    const raw = window.localStorage.getItem(draftKey);
    const saved: SessionDraftShape = raw ? JSON.parse(raw) : {};
    const savedFormat =
      typeof saved.format === "string" &&
      DRAFT_FORMATS.includes(saved.format as (typeof DRAFT_FORMATS)[number])
        ? saved.format
        : "BIRP";
    const format: string = savedFormat;
    const field: ForcedField =
      forcedField ??
      (format === "SOAP"
        ? "objective"
        : format === "DAP"
          ? "observation_data"
          : "behavior");
    const draft =
      saved.draft && typeof saved.draft === "object"
        ? (saved.draft as Record<string, string>)
        : {};
    const existing = typeof draft[field] === "string" ? draft[field].trim() : "";
    draft[field] = existing ? `${existing}\n\n${snippet}` : snippet;
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({ ...saved, format, draft }),
    );
    return { ok: true, format, fieldLabel: FIELD_LABELS[field] };
  } catch {
    return { ok: false };
  }
}
