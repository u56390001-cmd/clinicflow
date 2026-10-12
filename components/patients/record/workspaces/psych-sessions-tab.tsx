"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  Check,
  ClipboardList,
  Loader2,
  Mic,
  Pencil,
  Printer,
  Sparkles,
  Square,
  TriangleAlert,
  Trash2,
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
  getCurrentClinicianNameAction,
  savePsychSessionAction,
} from "@/lib/actions/specialty-workspaces";
import type { SessionRecorder } from "@/lib/copilot/hooks/useSessionRecorder";
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

function formatPrintDate(dateLabel: string): string {
  return dateLabel.replace(/-/g, "/");
}

export function SessionsTab({
  patient,
  psych,
  canManage,
  seed,
  onSeedApplied,
  recorder,
}: {
  patient: PatientDirectoryRow;
  psych: PatientPsychBundle;
  canManage: boolean;
  seed: PsychDraft | null;
  onSeedApplied: () => void;
  recorder: SessionRecorder;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);

  const [format, setFormat] = useState<SessionNoteFormat>(SESSION_DEFAULT_FORMAT);
  const [draft, setDraft] = useState<Partial<Record<SessionSectionKey, string>>>({});
  const [sessionDate, setSessionDate] = useState("");
  const [sessionType, setSessionType] = useState<SessionType>("individual");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [busy, setBusy] = useState<"saving" | "generating" | "approving" | null>(null);
  const [printSession, setPrintSession] = useState<PsychSession | null>(null);

  useEffect(() => {
    void getCurrentClinicianNameAction().then((result) => {
      if (result.ok) setDoctorName(result.data);
    });
  }, []);

  // The copilot lives at the workspace level. A note captured elsewhere
  // arrives here as a seed and is merged once the form is on screen; the
  // parent then clears it so it is applied exactly once.
  useEffect(() => {
    if (!seed) return;
    setFormat(seed.format);
    setDraft((current) => ({ ...current, ...seed.fields }));
    onSeedApplied();
  }, [seed, onSeedApplied]);

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
          transcript: recorder.transcript,
        }),
    [format, recorder.transcript],
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
      transcript: recorder.transcript.trim().slice(0, 20000),
      duration_seconds: recorder.elapsedSeconds || null,
    };
  }

  async function generateNote() {
    if (!recorder.transcript.trim()) {
      toast.error("Record the session first — the AI needs the transcript to write the note.");
      return;
    }
    setBusy("generating");
    const result = await generatePsychSessionNoteAction(patient.id, {
      format,
      transcript: recorder.transcript,
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
      recorder.transcript.trim() !== "";
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
    recorder.clear();
    toast.success("Session note approved and added to the record.");
    router.refresh();
  }

  /** Opens a saved draft (or any session) back into the editor. */
  function resume(session: PsychSession) {
    setActiveId(session.id);
    setFormat(session.format);
    setSessionType(session.session_type);
    setSessionDate(session.session_date);
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
            {/* Header: who, when, what kind of session, and the note format. */}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Patient</p>
                <p className="mt-0.5 text-sm text-text-primary">{patient.name}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Therapist</p>
                <p className="mt-0.5 text-sm text-text-primary">{doctorName || "—"}</p>
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Date</span>
                <input
                  type="date"
                  value={sessionDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setSessionDate(event.target.value)}
                  className="rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Session type</span>
                <select
                  value={sessionType}
                  onChange={(event) => setSessionType(event.target.value as SessionType)}
                  className="rounded-control border border-text-muted/25 bg-surface px-2 py-1.5 text-[12.5px] text-text-primary outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                >
                  {(Object.keys(SESSION_TYPE_META) as SessionType[]).map((key) => (
                    <option key={key} value={key}>
                      {SESSION_TYPE_META[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Format selector drives the AI generation, not the stored sections. */}
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                Note format
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-control border border-hairline bg-app p-0.5">
                  {(["BIRP", "SOAP", "DAP"] as SessionNoteFormat[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setFormat(kind)}
                      aria-pressed={format === kind}
                      className={cn(
                        "rounded-control px-3 py-1 text-[12px] font-semibold transition-colors",
                        format === kind
                          ? "bg-white text-primary shadow-sm"
                          : "text-text-secondary hover:text-primary",
                      )}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <span className="text-[11.5px] text-ink-faint">{NOTE_FORMAT_META[format]}</span>
              </div>
            </div>

            {/* Recording + AI note generation. */}
            <div className="rounded-control border border-hairline bg-app p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {recorder.isRecording ? (
                    <>
                      <span className="flex items-center gap-2 rounded-pill bg-status-danger/10 px-2.5 py-1 text-[12px] font-semibold text-status-danger">
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-danger opacity-60" />
                          <span className="relative inline-flex size-2 rounded-full bg-status-danger" />
                        </span>
                        REC · {recorder.elapsedLabel}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={recorder.stop}
                        className="gap-1.5"
                      >
                        <Square aria-hidden="true" className="size-3.5" />
                        Stop recording
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void recorder.start()}
                      className="gap-1.5"
                    >
                      <Mic aria-hidden="true" className="size-3.5" />
                      Start recording
                    </Button>
                  )}
                  <span className="text-[11.5px] text-ink-faint">
                    {recorder.isRecording
                      ? "Recording keeps running while you switch tabs."
                      : "A secure recording is transcribed when you stop it."}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {recorder.isFinalizing && (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-primary" />
                      Transcribing…
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === "generating" || recorder.isRecording || !recorder.transcript.trim()}
                    onClick={() => void generateNote()}
                    className="gap-1.5"
                  >
                    {busy === "generating" ? (
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
                    )}
                    Generate AI note
                  </Button>
                </div>
              </div>

              {recorder.error && (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-status-destructive">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  {recorder.error}
                </p>
              )}

              {!recorder.liveCaptionsSupported && (
                <p className="mt-2 text-[11.5px] text-ink-faint">
                  Live captions are not supported in this browser. Keep recording — the full
                  transcript appears once you stop.
                </p>
              )}

              <div className="mt-3 rounded-control border border-text-muted/20 bg-surface/70">
                <p className="flex items-center justify-between gap-2 border-b border-text-muted/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted">
                  <span>Session transcript</span>
                  {recorder.transcript.trim() && (
                    <span className="font-medium normal-case tracking-normal">
                      {recorder.transcript.trim().split(/\s+/).length} words
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "max-h-44 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[12.5px] leading-relaxed",
                    recorder.transcript.trim()
                      ? "text-text-primary"
                      : "text-ink-faint italic",
                  )}
                >
                  {recorder.transcript.trim() ||
                    "Press record and speak — live captions will appear here, and the accurate transcript lands when you stop."}
                </p>
              </div>
            </div>

            {/* Per-format sections. */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sections.map(({ key, label }) => (
                <NarrativeAssistNote
                  key={key}
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

      <div className="mb-6 flex items-start justify-between gap-4 border-b-2 border-text-primary pb-4">
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-xl font-bold text-text-primary">Psychology Session Note</h1>
          <h2 className="mt-1 text-sm font-medium text-text-secondary">
            {session.session_date} · {SESSION_TYPE_META[session.session_type]} · {session.format}
          </h2>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Patient</span>
          <p className="font-medium text-text-primary">{patient.name}</p>
        </div>
        {patient.patient_code && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">UHID</span>
            <p className="font-mono font-medium text-text-primary">{patient.patient_code}</p>
          </div>
        )}
        {session.doctor_name && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Therapist</span>
            <p className="font-medium text-text-primary">{session.doctor_name}</p>
          </div>
        )}
        {session.duration_seconds != null && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Recording</span>
            <p className="font-medium text-text-primary">
              {Math.round(session.duration_seconds / 60)} minutes
            </p>
          </div>
        )}
      </div>

      {entries.map(({ key, label, value }) => (
        <div key={key} className="mb-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</h3>
          <p className="whitespace-pre-wrap text-sm text-text-primary">{value}</p>
        </div>
      ))}

      <div className="mt-12 flex justify-end">
        <div className="text-center">
          <div className="mb-1 h-px w-40 bg-text-primary" />
          <p className="text-sm font-medium text-text-primary">
            {session.approved_by || session.doctor_name || "Clinician"}
          </p>
          {session.approved_at && (
            <p className="text-xs text-text-secondary">
              Approved {formatPrintDate(session.approved_at.slice(0, 10))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}