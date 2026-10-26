"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  Check,
  ClipboardList,
  Loader2,
  Pencil,
  Printer,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { RecordEmpty, RecordNote, RecordSection } from "@/components/patients/record/record-primitives";
import { SpecialtyHeading } from "@/components/patients/record/workspaces/specialty-form";
import {
  NarrativeAssistNote,
  type NoteAssistFn,
} from "@/components/patients/record/workspaces/narrative-assist-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  approvePsychSessionAction,
  assistPsychSessionAction,
  deletePsychSessionAction,
  generatePsychSessionNoteAction,
  getCurrentClinicianInfoAction,
  savePsychSessionAction,
} from "@/lib/actions/specialty-workspaces";
import type { AmbientRecorder } from "@/lib/copilot/hooks/useAmbientRecorder";
import {
  NOTE_FORMAT_META,
  SESSION_DEFAULT_FORMAT,
  SESSION_SECTIONS,
  SESSION_TYPE_META,
  sessionSectionEntries,
  sessionToDraftFields,
  type SessionNoteFormat,
  type SessionSectionKey,
  type SessionType,
} from "@/lib/psych-session";
import { cn } from "@/lib/utils";
import type { PatientPsychBundle } from "@/lib/patient-record";
import type { PatientDirectoryRow, PsychSession } from "@/types/database";

/** A session note the copilot extraction produced, waiting for this tab. */
export type PsychDraft = {
  format: SessionNoteFormat;
  fields: Record<string, string>;
  /** Risk triage attached by the copilot (drives the red draft banner). */
  riskLevel?: "low" | "moderate" | "high" | "crisis";
  riskNotes?: string | null;
};

const SECTION_PLACEHOLDERS: Record<SessionSectionKey, string> = {
  behavior: "What the client did and said in session…",
  intervention: "Techniques, questions and responses you used…",
  response: "How the client responded to the intervention…",
  subjective: "What the client reported feeling and experiencing…",
  objective: "Observable facts, presentation and progress on goals…",
  observation_data: "Facts observed and reported this session…",
  assessment: "Clinical interpretation and progress against goals…",
  plan: "Next steps, homework, referrals and follow-up…",
};

/** 1-click intervention tags (BIRP "I") — click-appended into the draft. */
const INTERVENTION_TAGS = [
  "CBT Thought Record",
  "DBT TIPP / Distress Tolerance",
  "Socratic Questioning",
  "Exposure",
  "Behavioral Activation",
];

type SafetyKey = "safe" | "passive" | "crisis" | null;

/** Safety pill → the exact sentence stamped at the top of the assessment. */
const SAFETY_PILLS: {
  key: Exclude<SafetyKey, null>;
  label: string;
  dot: string;
  baseClass: string;
  activeClass: string;
  stamp: string;
}[] = [
  {
    key: "safe",
    label: "Denies SI/HI (Safe)",
    dot: "🟢",
    baseClass: "border-primary/40 text-primary hover:bg-primary/5",
    activeClass: "border-primary/50 bg-primary/10 text-primary",
    stamp: "Safety assessment: Denies suicidal or homicidal ideation. Safe for outpatient care.",
  },
  {
    key: "passive",
    label: "Passive Ideation",
    dot: "🟡",
    baseClass: "border-status-warning/50 text-status-warning hover:bg-status-warning/5",
    activeClass: "border-status-warning/60 bg-status-warning/10 text-status-warning",
    stamp: "Safety assessment: Passive suicidal ideation reported. Safety plan reviewed with the client.",
  },
  {
    key: "crisis",
    label: "Active Crisis Protocol",
    dot: "🔴",
    baseClass: "border-status-destructive/50 text-status-destructive hover:bg-status-destructive/5",
    activeClass: "border-status-destructive/60 bg-status-destructive/10 text-status-destructive",
    stamp: "Safety assessment: Active ideation — crisis protocol initiated.",
  },
];

/** m:ss (or h:mm:ss) → whole seconds, for `duration_seconds`. */
function recordingSeconds(timeLabel: string): number | null {
  const parts = timeLabel.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null;
  const [mins, secs] = parts.slice(-2);
  return mins * 60 + secs;
}

function formatPrintDate(dateLabel: string): string {
  return dateLabel.replace(/-/g, "/");
}

export function SessionsTab({
  patient,
  psych,
  canManage,
  seed,
  onSeedApplied,
  ambient,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  canManage: boolean;
  seed: PsychDraft | null;
  onSeedApplied: () => void;
  ambient: AmbientRecorder;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);

  const [format, setFormat] = useState<SessionNoteFormat>(SESSION_DEFAULT_FORMAT);
  const [draft, setDraft] = useState<Partial<Record<SessionSectionKey, string>>>({});
  const [sessionDate, setSessionDate] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("individual");
  /** Session length in minutes (30/45/50/60/90) — the select writes, the payload reads. */
  const [sessionDuration, setSessionDuration] = useState(45);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [busy, setBusy] = useState<"saving" | "generating" | "approving" | null>(null);
  const [printSession, setPrintSession] = useState<PsychSession | null>(null);
  /** The "AI Drafted from Copilot" banner text (with risk severity when triaged). */
  const [seedBanner, setSeedBanner] = useState<{ text: string; risk: boolean } | null>(null);
  /** Which safety pill is stamped into the assessment (mirrors its first line). */
  const [safety, setSafety] = useState<SafetyKey>(null);

  useEffect(() => {
    void getCurrentClinicianInfoAction().then((result) => {
      if (result.ok) setDoctorName(result.data.name);
    });
  }, []);

  // The copilot lives at the workspace level. A note captured elsewhere
  // arrives here as a seed and is merged once the form is on screen; the
  // parent then clears it so it is applied exactly once.
  useEffect(() => {
    if (!seed) return;
    setFormat(seed.format);
    setDraft((current) => ({ ...current, ...seed.fields }));
    if (seed.riskLevel === "high" || seed.riskLevel === "crisis") {
      setSeedBanner({
        text: `AI Drafted from Copilot — Review & Approve. ${seed.riskNotes ?? "High-risk content flagged in this note."}`,
        risk: true,
      });
    } else {
      setSeedBanner({ text: "AI Drafted from Copilot — Review & Approve", risk: false });
    }
    onSeedApplied();
  }, [seed, onSeedApplied]);

  // Debounced localStorage autosave — a closed tab or crashed browser never
  // costs a clinician more than one second of typing.
  const draftKey = `psych-session-draft:${patient.id}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          format?: SessionNoteFormat;
          sessionDate?: string;
          sessionType?: SessionType;
          sessionDuration?: number;
          draft?: Partial<Record<SessionSectionKey, string>>;
        };
        if (saved.format) setFormat(saved.format);
        if (saved.sessionDate) setSessionDate(saved.sessionDate);
        if (saved.sessionType && saved.sessionType in SESSION_TYPE_META) setSessionType(saved.sessionType);
        if (typeof saved.sessionDuration === "number" && saved.sessionDuration > 0) {
          setSessionDuration(saved.sessionDuration);
        }
        if (saved.draft && Object.keys(saved.draft).length > 0) setDraft(saved.draft);
      }
    } catch {
      // Corrupt cache — ignore, the form starts empty.
    }
    // The restore is mount-only; `patient.id` identifies the bucket.
  }, [draftKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!draft || Object.values(draft).every((value) => !value?.trim())) return;
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ format, sessionDate, sessionType, sessionDuration, draft }),
        );
      } catch {
        // Quota errors are non-fatal — autosave is a convenience.
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [draft, format, sessionDate, sessionType, sessionDuration, draftKey]);

  // The print surface mounts, then window.print() fires after it paints.
  useEffect(() => {
    if (!printSession) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrintSession(null);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [printSession]);

  const sections = SESSION_SECTIONS[format];

  const setSection = useCallback((key: SessionSectionKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  /** Keeps the editor's copy current as the clinician types (persist happens on Save/Approve). */
  const onSaveSection = useCallback(
    (key: SessionSectionKey) => async (value: string) => {
      setSection(key, value);
      return true;
    },
    [setSection],
  );

  // The toolbar's AI writer — format- and section-aware, so the format selector
  // has real meaning for every "AI draft".
  const assistFor = useCallback(
    (section: SessionSectionKey): NoteAssistFn =>
      ({ kind, fieldLabel, text }) =>
        assistPsychSessionAction({
          kind,
          format,
          section,
          fieldLabel,
          text,
          transcript: ambient.transcript,
        }),
    [format, ambient.transcript],
  );

  function buildPayload(status: "draft" | "approved") {
    return {
      id: activeId ?? undefined,
      format,
      session_type: sessionType,
      session_date: sessionDate,
      status,
      behavior: draft.behavior?.trim(),
      intervention: draft.intervention?.trim(),
      response: draft.response?.trim(),
      subjective: draft.subjective?.trim(),
      objective: draft.objective?.trim(),
      observation_data: draft.observation_data?.trim(),
      assessment: draft.assessment?.trim(),
      plan: draft.plan?.trim(),
      transcript: ambient.transcript.trim().slice(0, 20000),
      duration_seconds:
        recordingSeconds(ambient.recordingTime) ?? sessionDuration * 60,
      doctor_id: activeId ? (psych.sessions.find((s) => s.id === activeId)?.doctor_id ?? null) : null,
      doctor_name: doctorName,
    };
  }

  async function generateNote() {
    if (!ambient.transcript.trim()) {
      toast.error("Record the session in the side panel first — the AI needs the transcript to write the note.");
      return;
    }
    setBusy("generating");
    const result = await generatePsychSessionNoteAction(patient.id, {
      format,
      transcript: ambient.transcript,
    });
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setDraft((current) => ({ ...current, ...result.data.sections }));
    toast.success("Note drafted from the transcript — review it before approving.");
  }

  async function persistDraft() {
    const result = await savePsychSessionAction(patient.id, buildPayload("draft"));
    if (!result.ok) {
      toast.error(result.message);
      return null;
    }
    return result.data;
  }

  /** 1-click safety pill — replaces the stamped "Safety assessment:" line in the assessment. */
  function applySafety(key: Exclude<SafetyKey, null>) {
    const pill = SAFETY_PILLS.find((option) => option.key === key);
    if (!pill) return;
    setSafety(key);
    const body = (draft.assessment ?? "")
      .replace(/^Safety assessment:[^\n]*\n?/m, "")
      .trim();
    setSection("assessment", pill.stamp + (body ? "\n\n" + body : ""));
  }

  /** BIRP "I" quick-insert: appends the tag into the intervention draft. */
  function insertInterventionTag(tag: string) {
    const current = draft.intervention ?? "";
    setSection("intervention", current.trim() ? `${current.trimEnd()} ${tag}` : tag);
  }

  async function saveDraft() {
    if (!canManage) return;
    setBusy("saving");
    const id = await persistDraft();
    setBusy(null);
    if (!id) return;
    setActiveId(id);
    toast.success(activeId ? "Draft updated." : "Draft saved — approve it when the note is final.");
    router.refresh();
  }

  async function approveNote() {
    if (!canManage) return;
    const hasContent =
      Object.values(draft).some((value) => value?.trim()) ||
      ambient.transcript.trim() !== "";
    if (!hasContent) {
      toast.error("Add a note section or record the session before approving.");
      return;
    }
    setBusy("approving");
    const id = (await persistDraft()) ?? activeId;
    if (!id) {
      setBusy(null);
      return;
    }
    const result = await approvePsychSessionAction(id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setActiveId(null);
    setDraft({});
    setSessionDate("");
    setSessionType("individual");
    setSessionDuration(45);
    setSafety(null);
    setSeedBanner(null);
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Non-fatal.
    }
    toast.success("Session note approved and added to the record.");
    router.refresh();
  }

  /** Opens a saved draft (or any session) back into the editor. */
  function resume(session: PsychSession) {
    setActiveId(session.id);
    setFormat(session.format);
    setSessionType(session.session_type);
    setSessionDate(session.session_date);
    if (session.duration_seconds != null) {
      setSessionDuration(Math.max(1, Math.round(session.duration_seconds / 60)));
    }
    setDraft(sessionToDraftFields(session));
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function removeSession(id: string) {
    const result = await deletePsychSessionAction(id);
    if (result.ok) {
      if (activeId === id) {
        setActiveId(null);
        setDraft({});
      }
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  const approvedSessions = psych.sessions.filter((session) => session.status === "approved");
  const lastSession = approvedSessions[0] ?? null;
  const lastApprovedDate = approvedSessions.length > 0
    ? approvedSessions[approvedSessions.length - 1].session_date
    : null;

  return (
    <div className="space-y-4">
      {canManage && (
        <RecordSection
          title="Write session note"
          meta={
            activeId ? (
              <Badge variant="warning">Editing a saved draft</Badge>
            ) : (
              <span className="text-[11px] text-ink-faint">
                Keep notes as drafts until the session is over
              </span>
            )
          }
        >
          <div ref={editorRef} className="scroll-mt-6 space-y-4">
            {/* Compact one-line control bar: date, session type, duration, note format.
                Patient and therapist identity live in the global workspace header. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-text-muted/20 bg-surface px-3 py-2 text-[12.5px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Date</span>
                <input
                  type="date"
                  value={sessionDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setSessionDate(event.target.value)}
                  className="min-w-[110px] rounded border border-text-muted/20 bg-surface px-2 py-0.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/15"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Session type</span>
                <select
                  value={sessionType}
                  onChange={(event) => setSessionType(event.target.value as SessionType)}
                  className="min-w-[130px] rounded border border-text-muted/20 bg-surface px-2 py-0.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/15"
                >
                  {(Object.keys(SESSION_TYPE_META) as SessionType[]).map((key) => (
                    <option key={key} value={key}>{SESSION_TYPE_META[key]}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Duration</span>
                <select
                  value={sessionDuration}
                  onChange={(event) => setSessionDuration(Number(event.target.value))}
                  className="min-w-[70px] rounded border border-text-muted/20 bg-surface px-2 py-0.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/15"
                >
                  {[30, 45, 50, 60, 90].map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Note format</span>
                <div className="flex items-center rounded border border-text-muted/20 bg-surface p-0.5">
                  {(["BIRP", "SOAP", "DAP"] as SessionNoteFormat[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setFormat(kind)}
                      aria-pressed={format === kind}
                      className="rounded px-2.5 py-0.5 text-[12px] font-semibold transition-colors"
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className="text-[11.5px] text-ink-faint">{NOTE_FORMAT_META[format]}</span>
            </div>

            {/* 1-Copilot handoff banner. */}
            {seedBanner && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-control border p-3",
                  seedBanner.risk
                    ? "border-status-destructive/40 bg-status-destructive/10"
                    : "border-primary/25 bg-primary/5",
                )}
              >
                <TriangleAlert
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    seedBanner.risk ? "text-status-destructive" : "text-primary",
                  )}
                />
                <p
                  className={cn(
                    "text-[12.5px] font-semibold leading-relaxed",
                    seedBanner.risk ? "text-status-destructive" : "text-primary",
                  )}
                >
                  {seedBanner.text}
                </p>
                <button
                  type="button"
                  onClick={() => setSeedBanner(null)}
                  aria-label="Dismiss banner"
                  className="ml-auto text-[11px] font-medium text-ink-faint hover:text-ink"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Synced copilot status — the single audio engine lives in the side panel. */}
            <div className="rounded-control border border-hairline bg-app p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {ambient.isRecording ? (
                  <>
                    <span className="flex items-center gap-2 rounded-pill bg-status-danger/10 px-2.5 py-1 text-[12px] font-semibold text-status-danger">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-danger opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-status-danger" />
                      </span>
                      Co-Pilot Recording Active · {ambient.recordingTime}
                    </span>
                    <span className="text-[11.5px] text-ink-faint">
                      Stop &amp; Process Note in Side Panel
                    </span>
                  </>
                ) : ambient.isProcessing ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-primary" />
                      Transcribing…
                    </span>
                    <span className="text-[11.5px] text-ink-faint">Working in the side panel</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11.5px] text-ink-faint">
                      Recording controls live in the Copilot side panel — start there.
                    </span>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy === "generating" || ambient.isRecording || !ambient.transcript.trim()}
                  onClick={() => void generateNote()}
                  className="ml-auto gap-1.5"
                >
                  {busy === "generating" ? (
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
                  )}
                  Generate AI note
                </Button>
              </div>

              <div className="mt-3 rounded-control border border-text-muted/20 bg-surface/70">
                <p className="flex items-center justify-between gap-2 border-b border-text-muted/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                  <span>Session transcript</span>
                  {ambient.transcript.trim() && (
                    <span className="font-medium normal-case tracking-normal">
                      {ambient.transcript.trim().split(/\s+/).length} words
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "max-h-44 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[12.5px] leading-relaxed",
                    ambient.transcript.trim()
                      ? "text-text-primary"
                      : "text-ink-faint italic",
                  )}
                >
                  {ambient.transcript.trim() ||
                    "The transcript from the side panel's capture appears here once the recording is processed."}
                </p>
              </div>
            </div>

            {/* Per-format sections. */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:items-start">
              {sections.map(({ key, label }) => (
                <div key={key} className={cn("min-w-0", key === "plan" && "lg:row-span-2")}>
                  {key === "intervention" && (
                    <div className="mb-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Quick tags
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {INTERVENTION_TAGS.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            disabled={!canManage}
                            onClick={() => insertInterventionTag(tag)}
                            className="rounded-pill border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium leading-none text-text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-default disabled:opacity-80"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {key === "plan" && (
                    <div className="mb-2.5 rounded-control border border-hairline bg-app p-2.5">
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Safety assessment
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {SAFETY_PILLS.map((pill) => (
                          <button
                            key={pill.key}
                            type="button"
                            disabled={!canManage}
                            aria-pressed={safety === pill.key}
                            onClick={() => applySafety(pill.key)}
                            className={cn(
                              "rounded-pill border bg-surface px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors disabled:cursor-default disabled:opacity-80",
                              safety === pill.key ? pill.activeClass : pill.baseClass,
                            )}
                          >
                            {pill.dot} {pill.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <NarrativeAssistNote
                    name={`session-${sessionType}-${key}`}
                    label={label}
                    fieldLabel={label}
                    value={draft[key] ?? ""}
                    placeholder={SECTION_PLACEHOLDERS[key]}
                    rows={4}
                    disabled={!canManage}
                    onSave={onSaveSection(key)}
                    assist={assistFor(key)}
                  />
                </div>
              ))}
            </div>

            {/* Save / Approve. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-[11.5px] text-ink-faint">
                Drafts stay private until approved — approved notes join the patient record.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void saveDraft()}
                className="gap-1.5"
              >
                {busy === "saving" ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <ClipboardList aria-hidden="true" className="size-3.5" />
                )}
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy !== null}
                onClick={() => void approveNote()}
                className="gap-1.5"
              >
                {busy === "approving" ? (
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                ) : (
                  <Check aria-hidden="true" className="size-3.5" />
                )}
                Approve note
              </Button>
            </div>
          </div>
        </RecordSection>
      )}

      {psych.sessions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={cn(approvedSessions.length > 0 ? "lg:col-span-2" : "lg:col-span-3")}>
            <SpecialtyHeading title="Session history" description="Newest first" />
            <div className="space-y-3">
              {psych.sessions.map((session) => (
                <SessionHistoryRow
                  key={session.id}
                  session={session}
                  canManage={canManage}
                  onResume={resume}
                  onPrint={setPrintSession}
                  onDelete={removeSession}
                />
              ))}
            </div>
          </div>
          {approvedSessions.length > 0 && (
            <PreviousContextCard
              sessions={approvedSessions}
              lastSession={lastSession}
              lastApprovedDate={lastApprovedDate}
            />
          )}
        </div>
      )}

      {psych.sessions.length === 0 && (
        <RecordEmpty
          icon={Brain}
          title="No session notes yet"
          description="Record the session and let AI draft it, or write a BIRP, SOAP or DAP note by hand — then approve it when the session is over."
        />
      )}

      {printSession && <SessionNotePrint session={printSession} patient={patient} />}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Clinical focus extractor                                                  */
/* ------------------------------------------------------------------------- */

/** Extracts a short clinical focus line from the note body for the print surface. */
function clinicalFocusFor(session: PsychSession): string | null {
  const first = sessionSectionEntries(session).find(
    ({ value }) => value.length > 60,
  );
  if (!first) return null;
  const text = first.value.replace(/Safety assessment:[^\n]*\n?/m, "").trim();
  const sentence = text.split(/[.!?]/, 1)[0].trim();
  return sentence.length > 5 ? sentence : null;
}

/** Returns the safety stamp line if stamped into the assessment. */
function safetyStatusFrom(session: PsychSession): string | null {
  const assessment = session.assessment ?? "";
  const m = assessment.match(/^Safety assessment:([^\n]+)/m);
  return m ? m[1].trim() : null;
}

/* ------------------------------------------------------------------------- */
/* History row                                                               */
/* ------------------------------------------------------------------------- */

function SessionHistoryRow({
  session,
  canManage,
  onResume,
  onPrint,
  onDelete,
}: {
  session: PsychSession;
  canManage: boolean;
  onResume: (session: PsychSession) => void;
  onPrint: (session: PsychSession) => void;
  onDelete: (id: string) => void;
}) {
  const entries = sessionSectionEntries(session);
  const approved = session.status === "approved";

  return (
    <RecordSection
      title={`${session.session_date} · ${SESSION_TYPE_META[session.session_type]} · ${session.format}`}
      meta={
        <div className="flex flex-wrap items-center gap-1.5">
          {approved ? (
            <Badge variant="success">Approved</Badge>
          ) : (
            <Badge variant="warning">Draft</Badge>
          )}
          {canManage && !approved && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onResume(session)}
              className="h-7 gap-1.5 px-2 text-[11.5px] text-text-secondary hover:text-primary"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              Edit
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPrint(session)}
            className="h-7 gap-1.5 px-2 text-[11.5px] text-text-secondary hover:text-primary"
          >
            <Printer aria-hidden="true" className="size-3.5" />
            Print
          </Button>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(session.id)}
              className="h-7 gap-1.5 px-2 text-[11.5px] text-status-destructive"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {entries.length > 0 ? (
          entries.map(({ key, label, value }) => (
            <RecordNote key={key} label={label} value={value} />
          ))
        ) : (
          <p className="text-ink-faint text-[12px] italic">No fields recorded.</p>
        )}
        <p className="text-[11px] text-ink-faint">
          {session.doctor_name ? `By ${session.doctor_name}` : "Therapist not recorded"}
          {session.duration_seconds
            ? ` · ${Math.round(session.duration_seconds / 60)} min recording`
            : ""}
          {session.approved_at
            ? ` · ${session.approved_at.slice(0, 10)}`
            : ""}
        </p>
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Previous session context                                                  */
/* ------------------------------------------------------------------------- */

function PreviousContextCard({
  sessions,
  lastSession,
  lastApprovedDate,
}: {
  sessions: PsychSession[];
  lastSession: PsychSession | null;
  lastApprovedDate: string | null;
}) {
  if (sessions.length === 0) return null;

  const named = (value: string | null | undefined, fallback: string | null) =>
    value?.trim() ? value : fallback;

  return (
    <RecordSection title="Previous session context">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Sessions on file</p>
          <p className="mt-0.5 text-sm text-text-primary">
            {sessions.length} approved
            {lastApprovedDate ? ` · ${lastApprovedDate} to ${sessions[0]?.session_date ?? ""}` : ""}
          </p>
        </div>
        <RecordNote
          label="Last session"
          value={lastSession ? `${lastSession.session_date} · ${SESSION_TYPE_META[lastSession.session_type]} · ${lastSession.format}` : null}
        />
        <RecordNote
          label="Previous interventions"
          value={lastSession ? named(lastSession.intervention, "Not recorded") : null}
        />
        <RecordNote
          label="Progress"
          value={lastSession ? named(lastSession.assessment, "Not recorded") : null}
        />
        <RecordNote
          label="Pending plan"
          value={lastSession ? named(lastSession.plan, null) : null}
        />
        <p className="text-[11px] text-ink-faint">
          Context is read from approved sessions — the previous plan flows into the next note
          only when you carry it forward.
        </p>
      </div>
    </RecordSection>
  );
}

/* ------------------------------------------------------------------------- */
/* Print preview                                                             */
/* ------------------------------------------------------------------------- */

function SessionNotePrint({
  session,
  patient,
}: {
  session: PsychSession;
  patient: PatientDirectoryRow;
}) {
  const entries = sessionSectionEntries(session);
  const focus = clinicalFocusFor(session);
  const safety = safetyStatusFrom(session);
  const clinician = session.doctor_name || "Clinician";
  const approvedBy = session.approved_by || clinician;
  const approvedAt = session.approved_at ? formatPrintDate(session.approved_at.slice(0, 10)) : null;

  return (
    <div className="session-print-preview hidden" id="session-print-area">
      <style>{`
        @media print {
          .session-print-preview { display: block !important; }
          body * { visibility: hidden; }
          .session-print-preview, .session-print-preview * { visibility: visible; }
          .print-preview { display: none !important; }
          .session-print-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 40px;
            background: white;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Clinic header + title */}
      <div className="mb-6 border-b-2 border-text-primary pb-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold uppercase tracking-widest text-text-primary">
              Psychology Session Note
            </h1>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-text-muted">
              Encounter record
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Format</p>
            <p className="text-sm font-semibold text-text-primary">{session.format}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-text-muted">Date</p>
            <p className="text-sm font-semibold text-text-primary">{formatPrintDate(session.session_date)}</p>
          </div>
        </div>
      </div>

      {/* Encounter details */}
      <div className="mb-5 grid grid-cols-4 gap-4 text-sm">
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Patient</span>
          <p className="font-medium text-text-primary">{patient.name}</p>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">UHID</span>
          <p className="font-mono font-medium text-text-primary">{patient.patient_code || "—"}</p>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Therapist</span>
          <p className="font-medium text-text-primary">{clinician}</p>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</span>
          <p className="font-medium text-text-primary capitalize">{session.status}</p>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Session type</span>
          <p className="font-medium text-text-primary">{SESSION_TYPE_META[session.session_type]}</p>
        </div>
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Duration</span>
          <p className="font-medium text-text-primary">
            {session.duration_seconds != null
              ? `${Math.round(session.duration_seconds / 60)} minutes`
              : "—"}
          </p>
        </div>
        {approvedAt && (
          <>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Approved date</span>
              <p className="font-medium text-text-primary">{approvedAt}</p>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Approved by</span>
              <p className="font-medium text-text-primary">{approvedBy}</p>
            </div>
          </>
        )}
      </div>

      {/* Primary diagnosis / clinical focus + safety */}
      {(focus || safety) && (
        <div className="mb-5 rounded-control border border-text-muted/20 bg-surface p-3.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Clinical focus</p>
          <p className="text-sm text-text-primary">{focus || "—"}</p>
          {safety && (
            <>
              <p className="mt-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Safety risk assessment</p>
              <p className="text-sm font-semibold text-text-primary">{safety}</p>
            </>
          )}
        </div>
      )}

      {/* Clinical body */}
      <div className="space-y-4">
        {entries.length > 0 ? (
          entries.map(({ key, label, value }) => (
            <div key={key} className="break-inside-avoid">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</h3>
              <p className="whitespace-pre-wrap text-sm text-text-primary">{value}</p>
            </div>
          ))
        ) : (
          <p className="text-ink-faint text-sm italic">No fields recorded.</p>
        )}
      </div>

      {/* Footer / signature stamp */}
      <div className="mt-12 border-t border-hairline pt-6">
        <div className="flex items-end justify-between gap-8">
          <div className="text-center">
            <div className="mb-2 h-px w-48 bg-text-primary" />
            <p className="text-sm font-semibold text-text-primary">
              {`Approved by ${approvedBy}`}
            </p>
            <p className="text-[11px] text-text-secondary">Therapist signature</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">License / credential</p>
            <p className="text-xs text-text-secondary">____________________</p>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Record issued</p>
            <p className="text-xs text-text-primary">{new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}