'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Sparkles, ChevronRight, ChevronLeft, AlertTriangle, Send, X, Undo2, Zap, Check, ClipboardList } from 'lucide-react';
import { useAmbientRecorder, type AmbientRecorder } from '@/lib/copilot/hooks/useAmbientRecorder';
import {
  COPILOT_MODE_LABELS,
  CopilotExtraction,
  emptyExtractionFor,
  type CopilotMode,
  type DermNoteExtraction,
  type PsychNoteExtraction,
  type WorkspaceExtraction,
} from '@/lib/copilot/types';
import { fetchWithTimeout, COMMAND_TIMEOUT_MS } from '@/lib/copilot/fetch-with-timeout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface CopilotDrawerProps {
  /** Which workspace this panel is mounted in — drives the AI context and preview. */
  mode?: CopilotMode;
  /** Header title; defaults to the mode's stock label. */
  contextLabel?: string;
  /** Per-workspace AI guidance sent to both the structure and command routes. */
  workspaceContext?: string;
  patientProfile?: { allergies?: string; current_meds?: string };
  /**
   * The full clinical bundle (intake, psychometrics, care plan, safety, past
   * notes) built by the workspace. Sent to both scribe routes so the model can
   * reference real baselines instead of drafting from the transcript alone.
   */
  clinicalContext?: string;
  /**
   * Psychology only: the clinician's LIVE session-note draft (the field-level
   * edits they already made on the Sessions tab). A command edits that state
   * instead of only the copilot's own last output, so manual fixes survive.
   */
  liveFormState?: () => unknown;
  onPopulateForm: (data: WorkspaceExtraction) => void;
  /** Restores the pre-copilot draft. Omitted where there is no undo to offer. */
  onUndo?: () => boolean;
  /** True while an AI-written draft is still unreviewed — drives the Undo button. */
  canUndo?: boolean;
  /**
   * A recorder owned outside the drawer (workspace-lifted), shared with other
   * surfaces of the same workspace so there is exactly one audio engine. When
   * omitted the drawer boots its own hook as before.
   */
  recorder?: AmbientRecorder;
  /** Fires once per extraction with HIGH/CRISIS risk so the workspace can triage. */
  onRiskFlag?: (notes: string) => void;
  /**
   * Psychology only: writes the extraction's observable findings to the MSE
   * (via the workspace's own handler).
   */
  onPushToMse?: (note: PsychNoteExtraction) => void;
  /**
   * Targeted insertion: writes ONE AI section into one BIRP/SOAP field via
   * `[ 📋 Push to Session Field ]` — appends to the clinician's draft instead
   * of the whole-draft populate.
   */
  onPushToField?: (field: string, snippet: string) => void;
}

/**
 * Command-bar dictation.
 *
 * Typing a command defeats the point of an ambient scribe: the doctor just
 * finished talking so the machine would listen, and the command bar asks them
 * to pick the keyboard back up. The browser's own SpeechRecognition fills the
 * input directly — no server roundtrip, no transcription quota — and the
 * command routes receive clean text exactly as if it were typed.
 *
 * Minimal structural typing: lib.dom typings for SpeechRecognition vary
 * across TS versions, so the touch surface is kept to start/stop/onresult.
 */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((
        event: {
          resultIndex: number;
          results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
        },
      ) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * Browser SpeechRecognition auto-detects the spoken language — no lang
 * setting means it listens to whatever the doctor says and adapts.
 */

/** Chrome/Edge expose it under a prefixed name; Firefox does not ship it. */
function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | SpeechRecognitionCtor
    | undefined;
  return ctor ?? null;
}

/**
 * AUTO-APPLY, and why it is on by default.
 *
 * Ambient capture exists to remove typing, and typing was what the doctor did
 * next anyway: record a consultation, then read the extraction, then press
 * "Populate Prescription Form". That button is the last piece of manual work in
 * a flow whose entire premise is that the machine already listened. So a fresh
 * extraction lands in the form the moment it exists.
 *
 * It is safe to do this because of three things that already exist and were not
 * added for it: every AI-written field is marked amber in the form until the
 * doctor edits it, one undo restores the draft, and nothing is written to the
 * database until the doctor presses Save. Auto-apply changes what is on screen,
 * not what is on file.
 *
 * Still a toggle, because "safe by default" is not the same as "always right":
 * a doctor mid-consultation who has already typed the real findings should not
 * have them overwritten by an extraction from a half-heard sentence, and a
 * multi-speaker room with a background TV is exactly when the toggle earns its
 * place.
 */
export function CopilotDrawer({
  mode = "general",
  contextLabel,
  workspaceContext,
  patientProfile,
  clinicalContext,
  liveFormState,
  onPopulateForm,
  onUndo,
  canUndo = false,
  recorder,
  onRiskFlag,
  onPushToMse,
  onPushToField
}: CopilotDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [commandInput, setCommandInput] = useState<string>('');
  const [isProcessingCommand, setIsProcessingCommand] = useState<boolean>(false);
  const [autoApply, setAutoApply] = useState<boolean>(true);
  /** Open section-menu of the targeted `[ 📋 Push to Session Field ]` inserter. */
  const [pushMenuOpen, setPushMenuOpen] = useState<boolean>(false);
  /**
   * Dictation on the command bar. `speechSupported` resolves in an effect so
   * server and first client render agree (no hydration mismatch), settling
   * before interaction — the button simply does not exist where unsupported.
   */
  const [speechSupported, setSpeechSupported] = useState<boolean>(false);
  const [isDictating, setIsDictating] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const headerLabel = contextLabel ?? (mode === "general" ? "Ambient Copilot" : COPILOT_MODE_LABELS[mode]);
  const formNoun =
    mode === "psychology"
      ? "the session note form"
      : mode === "dermatology"
        ? "the examination form"
        : "the prescription form";

  const ownRecorder = useAmbientRecorder({ patientProfile, workspaceKind: mode, workspaceContext, clinicalContext });
  // The workspace-lifted engine wins; the hook above stays only so the drawer
  // keep working standalone when no engine is injected.
  const engine = recorder ?? ownRecorder;
  const {
    isRecording,
    recordingTime,
    transcript,
    extractedData,
    isProcessing,
    error,
    clearError,
    startRecording,
    stopRecording,
    setExtractedData
  } = engine;

  // Command failures are shown in the drawer too, not alerted: the recording
  // path and the command path fail for the same reasons (no API key, no
  // network), so they should read the same way.
  const [commandError, setCommandError] = useState<string | null>(null);

  // Which extraction is already in the form. Without this, auto-apply would
  // fire again on every re-render, and — worse — a re-extraction of the *same*
  // transcript would write the form again after the doctor had corrected it.
  const appliedRef = useRef<WorkspaceExtraction | null>(null);

  /** Write an extraction to the form, once. Returns true when it wrote. */
  const applyOnce = useCallback(
    (data: WorkspaceExtraction) => {
      if (appliedRef.current === data) return false;
      appliedRef.current = data;
      onPopulateForm(data);
      return true;
    },
    [onPopulateForm]
  );

  // The auto-apply itself. Keyed on the extracted object, not on a boolean, so
  // it runs exactly once per extraction: `extractedData` is a new object only
  // when a new recording or command produced one.
  useEffect(() => {
    if (!autoApply || !extractedData) return;
    applyOnce(extractedData);
  }, [autoApply, extractedData, applyOnce]);

  // A new recording starts a new note, so the "already applied" mark goes too —
  // otherwise the next extraction would be treated as a duplicate and skipped.
  useEffect(() => {
    if (isRecording) appliedRef.current = null;
  }, [isRecording]);

  // Workspace triage: an extraction that carries HIGH/CRISIS risk raises the
  // alert outside the drawer, exactly once per extraction object. The risk
  // NOTES are advisory — the escalation must not depend on them being filled.
  useEffect(() => {
    if (!onRiskFlag || !extractedData || mode !== "psychology") return;
    const note = extractedData as PsychNoteExtraction;
    if (note.risk_level === "high" || note.risk_level === "crisis") {
      onRiskFlag(
        note.risk_notes?.trim() ||
          `AI flagged ${note.risk_level.toUpperCase()} risk during capture — assess before proceeding.`,
      );
    }
  }, [extractedData, mode, onRiskFlag]);

  /** Undo, then forget the mark so the same extraction is not silently re-applied. */
  const handleUndo = useCallback(() => {
    const restored = onUndo?.();
    if (restored) {
      appliedRef.current = null;
      setExtractedData(null);
    }
  }, [onUndo, setExtractedData]);

  /**
   * The command pipeline. The form's submit and the quick-action chips both go
   * through here. Two context streams ride along:
   * - `clinicalContext` — the full patient bundle (scores, plan, safety).
   * - `liveFormState` — the clinician's manually-edited draft wins over the
   *   copilot's own last output, so a rewrite preserves the doctor's fixes.
   */
  const runCommand = useCallback(
    async (command: string): Promise<void> => {
      if (!command || isProcessingCommand) return;

      setIsProcessingCommand(true);
      setCommandError(null);
      try {
        // A command with nothing recorded yet edits a blank draft rather than
        // being refused. Typing "paracetamol 500 TDS 5 days for fever" is a
        // complete prescription on its own, and making the doctor record audio
        // first to reach this box defeated the point of the box.
        const baseState = (() => {
          const live = mode === "psychology" ? liveFormState?.() ?? null : null;
          return live ?? extractedData ?? emptyExtractionFor(mode);
        })();
        const res = await fetchWithTimeout(
          '/api/scribe/command',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentFormState: baseState,
              command,
              workspaceKind: mode,
              workspaceContext,
              clinicalContext
            })
          },
          COMMAND_TIMEOUT_MS,
          'The copilot'
        );

        // Parsed defensively: a failed request can still come back as a gateway's
        // HTML page rather than the route's JSON, and letting `res.json()` throw
        // on its own would replace a useful explanation with a parser complaint.
        let result: { data?: WorkspaceExtraction; error?: string } | null = null;
        try {
          result = await res.json();
        } catch {
          result = null;
        }

        if (!res.ok) {
          throw new Error(result?.error || `The copilot returned ${res.status}.`);
        }
        if (result?.data) {
          setExtractedData(result.data);
          setCommandInput('');
          // A typed command is just as complete a note as a recording, so it goes
          // to the form by the same rule. Left on the manual button this would
          // have meant the doctor typed a full order and then pressed one more
          // key to send it — the one interaction auto-apply exists to remove.
          if (autoApply) applyOnce(result.data);
        } else {
          throw new Error(
            mode === "general"
              ? 'The copilot did not return a prescription. Try rephrasing the command.'
              : mode === "psychology"
                ? 'The copilot did not return a session note. Try rephrasing the command.'
                : 'The copilot did not return a note. Try rephrasing the command.'
          );
        }
      } catch (err) {
        console.error('Command failed:', err);
        setCommandError(
          err instanceof Error && err.message
            ? err.message
            : 'The copilot could not apply that command. Please try again.'
        );
      } finally {
        setIsProcessingCommand(false);
      }
    },
    [isProcessingCommand, mode, liveFormState, extractedData, setExtractedData, workspaceContext, clinicalContext, autoApply, applyOnce]
  );

  // Browser support can only be checked on the client; settle it post-hydration.
  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  /**
   * Toggle command-bar dictation. Final utterances append into the input so a
   * dictated command can still be edited before sending; starting a new
   * session stops any live one. `onend`/`onerror` clear the ref so the toggle
   * reflects what the engine actually did, not what we asked it to do.
   */
  const toggleDictation = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (recognitionRef.current || isDictating) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsDictating(false);
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let addition = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) addition += event.results[i][0].transcript;
      }
      const text = addition.trim();
      if (text) setCommandInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };
    recognitionRef.current = recognition;
    setIsDictating(true);
    try {
      recognition.start();
    } catch {
      // Already-started engines throw synchronously; treat as a no-op toggle.
      recognitionRef.current = null;
      setIsDictating(false);
    }
  }, [isDictating]);

  // Closing or unmounting the drawer must not leak a live recognition session.
  useEffect(() => {
    if (!isOpen) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsDictating(false);
    }
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [isOpen]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCommand(commandInput.trim());
  };

  /** Quick-action presets — one click runs the full command pipeline. */
  const quickActions =
    mode === "psychology"
      ? [
          {
            label: "Draft BIRP Note",
            title: "Structure the transcript into a complete BIRP note",
            command:
              "Convert the discussion into a complete BIRP note (Behavior, Intervention, Response, Plan), grounded in the patient context.",
          },
          {
            label: "Summarize Trajectory",
            title: "Synthesize score trends and goal progress",
            command:
              "Summarize the patient's trajectory: latest psychometric scores and their deltas, progress on the active SMART goals, and the direction of care.",
          },
          {
            label: "CBT / Homework Ideas",
            title: "CBT techniques matched to the current symptom profile",
            command:
              "Suggest 2-3 CBT techniques and homework tasks tailored to the patient's current symptom profile (use the psychometric subscales and active goals in the context).",
          },
          {
            label: "Safety Check",
            title: "Screen the session for suicide / self-harm markers",
            command:
              "Review the transcript and history for suicide or self-harm risk markers. Set risk_level and risk_notes accordingly; flag any Item-9 endorsement.",
          },
        ]
      : [];

  const populateLabel =
    mode === "psychology"
      ? "Populate Session Note"
      : mode === "dermatology"
        ? "Populate Examination Form"
        : "Populate Prescription Form";

  /**
   * The extracted-note preview. One panel, three dialects — the drawer is the
   * same component in every workspace, so it shows whichever facts belong to
   * that specialty's note shape. The billing block (applied confirmation /
   * populate button) is shared so auto-apply reads the same in all three.
   */
  function renderPreview() {
    if (!extractedData) return null;
    const applied = appliedRef.current === extractedData;

    const populate = applied ? (
      /* Already in the form. The button becomes the confirmation it
         really is, instead of disappearing — the doctor needs to see
         that the note landed here and not somewhere else. */
      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-sage bg-white/70 px-3 py-2 text-[11px] font-medium text-brand-ink">
        <Check className="size-3.5" aria-hidden="true" />
        Written to {formNoun}
      </div>
    ) : (
      <Button
        onClick={() => onPopulateForm(extractedData)}
        className="w-full justify-center bg-brand-cta text-xs font-semibold text-white shadow-md hover:bg-brand-cta-hover"
        size="sm"
      >
        {populateLabel}
      </Button>
    );

    if (mode === "psychology") {
      const note = extractedData as PsychNoteExtraction;
      const riskTone =
        note.risk_level === "crisis"
          ? "bg-red-100 text-red-700"
          : note.risk_level === "high"
            ? "bg-orange-100 text-orange-700"
            : note.risk_level === "moderate"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-200 text-slate-700";
      /** Sections an AI note produced, keyed as they land in the session draft.
      `objective` (SOAP) is not on the BIRP/DAP extraction shape, so lookups go
       through a plain record view — absent sections simply come back empty. */
      const sectionSource = note as unknown as Record<string, string | undefined>;
      const sections: { field: string; label: string; text: string }[] = (
        [
          ["behavior", "B — Behavior"],
          ["intervention", "I — Intervention"],
          ["response", "R — Response"],
          ["objective", "O — Objective"],
          ["observation_data", "D — Data"],
          ["assessment", "A — Assessment"],
          ["plan", "P — Plan"],
        ] as const
      )
        .map(([field, label]) => ({ field, label, text: (sectionSource[field] ?? "").trim() }))
        .filter((section) => section.text);
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-sage bg-gradient-to-br from-brand-wash to-brand-pale p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-ink">Session Note Draft</span>
            <span className="rounded-full bg-brand-pale px-2 py-0.5 font-mono text-[10px] font-medium text-brand-cta">
              {note.format}
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-700">
            <p>
              <strong className="font-semibold text-slate-900">Summary:</strong>{' '}
              {note.session_summary || 'N/A'}
            </p>
            <p>
              <strong className="font-semibold text-slate-900">Mood / Affect:</strong>{' '}
              {note.mood_affect || 'N/A'}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${riskTone}`}>
                {note.risk_level} risk
              </span>
              {note.risk_notes && <span className="text-slate-500">— {note.risk_notes}</span>}
            </div>
          </div>
          {sections.length > 0 && onPushToField && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPushMenuOpen((open) => !open)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:border-brand-sage hover:text-brand-ink"
              >
                <ClipboardList className="size-3.5" aria-hidden="true" />
                📋 Push to Session Field
                <span className="ml-1 text-[9px] text-slate-400">{sections.length} sections</span>
              </button>
              {pushMenuOpen && (
                <div className="absolute bottom-full z-20 mb-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                  {sections.map((section) => (
                    <button
                      key={section.field}
                      type="button"
                      title={section.text.slice(0, 120)}
                      onClick={() => {
                        onPushToField(section.field, section.text);
                        setPushMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium text-slate-700 transition hover:bg-brand-pale hover:text-brand-ink"
                    >
                      <span>{section.label}</span>
                      <span className="truncate text-[9px] text-slate-400">&ldquo;{section.text.slice(0, 40)}&hellip;&rdquo;</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onPushToMse && (
            <button
              type="button"
              onClick={() => onPushToMse(note)}
              className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-medium text-slate-700 transition hover:border-brand-sage hover:text-brand-ink"
            >
              <ClipboardList className="size-3.5" aria-hidden="true" />
              Push to Today&apos;s MSE
            </button>
          )}
          {populate}
        </div>
      );
    }

    if (mode === "dermatology") {
      const note = extractedData as DermNoteExtraction;
      return (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-sage bg-gradient-to-br from-brand-wash to-brand-pale p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-ink">Examination Draft</span>
            <span className="rounded-full bg-brand-pale px-2 py-0.5 font-mono text-[10px] font-medium text-brand-cta">
              {note.chief_complaints.length} complaints
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-700">
            <p>
              <strong className="font-semibold text-slate-900">Diagnosis:</strong>{' '}
              {note.diagnosis || 'N/A'}
            </p>
            <p>
              <strong className="font-semibold text-slate-900">Distribution:</strong>{' '}
              {note.distribution ? note.distribution.charAt(0).toUpperCase() + note.distribution.slice(1) : 'N/A'}
            </p>
            <p>
              <strong className="font-semibold text-slate-900">Treatment:</strong>{' '}
              {note.treatment_summary || 'N/A'}
            </p>
          </div>
          {populate}
        </div>
      );
    }

    const extraction = extractedData as CopilotExtraction;
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-brand-sage bg-gradient-to-br from-brand-wash to-brand-pale p-3.5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-ink">Extracted Draft</span>
          <span className="rounded-full bg-brand-pale px-2 py-0.5 font-mono text-[10px] font-medium text-brand-cta">
            {extraction.medicines?.length || 0} meds
          </span>
        </div>

        <div className="space-y-1 text-xs text-slate-700">
          <p>
            <strong className="font-semibold text-slate-900">Chief Complaint:</strong>{' '}
            {extraction.chief_complaint || 'N/A'}
          </p>
          <p>
            <strong className="font-semibold text-slate-900">Diagnosis:</strong>{' '}
            {extraction.diagnosis || 'N/A'}
          </p>
        </div>

        {populate}
      </div>
    );
  }

  return (
    <div
      className={`relative flex shrink-0 flex-col border-t border-slate-200 bg-gradient-to-b from-slate-50 to-white transition-all duration-300 ease-in-out xl:border-l xl:border-t-0 ${
        isOpen ? 'w-full sm:w-80 2xl:w-96' : 'w-12'
      }`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute left-2 top-3 z-10 flex size-6 items-center justify-center rounded-full border border-brand-sage bg-white shadow-sm transition hover:border-brand-sage hover:bg-brand-pale xl:-left-3 xl:top-6"
        title={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
      >
        {isOpen ? <ChevronRight className="size-3.5 text-brand-cta" /> : <ChevronLeft className="size-3.5 text-brand-cta" />}
      </button>

      {!isOpen ? (
        <div className="flex flex-col items-center gap-6 pt-12">
          <Sparkles className="size-5 animate-pulse text-brand-cta" />
          <span className="rotate-90 whitespace-nowrap text-[10px] font-medium uppercase tracking-widest text-slate-400">
            AI Copilot
          </span>
        </div>
      ) : (
        <div className="flex size-full flex-col gap-4 overflow-y-auto p-5">
          {/* Failures live here, in the panel that caused them, rather than in a
              browser alert: they can be read after dismissing, they are styled
              like the rest of the product, and dismissing one leaves the drawer
              usable instead of looking idle. */}
          {(error || commandError) && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
              <p className="flex-1 text-xs leading-relaxed text-red-800">
                {error || commandError}
              </p>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setCommandError(null);
                }}
                aria-label="Dismiss error"
                className="shrink-0 rounded p-0.5 text-red-500 transition hover:bg-red-100 hover:text-red-700"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-[18px] text-brand-cta" />
                <h3 className="text-sm font-semibold text-slate-900">{headerLabel}</h3>
              </div>
              <span className="rounded-full border border-brand-sage bg-brand-pale px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-cta">
                {isRecording ? 'LISTENING' : 'READY'}
              </span>
            </div>

            {/* Auto-apply, in the header rather than buried in the mic card:
                it changes what every future recording does, so it is a setting
                of the panel, not of one button. Undo sits beside it because it
                is the escape hatch for the same setting and is useless apart
                from it. */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setAutoApply((on) => !on)}
                aria-pressed={autoApply}
                title={
                  autoApply
                    ? `Extracted notes are written into ${formNoun} as soon as they are ready.`
                    : 'Extracted notes wait for you to press the populate button.'
                }
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 transition hover:text-brand-cta"
              >
                <span
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    autoApply ? 'bg-brand-cta' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
                      autoApply ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                Auto-fill form
                {autoApply && <Zap className="size-3 text-brand-cta" aria-hidden="true" />}
              </button>

              {canUndo && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="flex items-center gap-1 text-[11px] font-medium text-slate-500 transition hover:text-amber-700"
                >
                  <Undo2 className="size-3" aria-hidden="true" />
                  Undo
                </button>
              )}
            </div>
          </div>

          {/* Quick-action chips — psychology presets that run the full command
              pipeline in one click (context bundle + live draft included). */}
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Copilot quick actions">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={isProcessingCommand}
                  title={action.title}
                  onClick={() => void runCommand(action.command)}
                  className="rounded-full border border-brand-sage bg-brand-pale/70 px-2.5 py-1 text-[11px] font-semibold text-brand-ink transition hover:border-brand-cta hover:bg-brand-pale disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Ambient Mic Controller */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex size-2.5 rounded-full bg-red-500"></span>
                  </span>
                ) : (
                  <div className="size-2.5 rounded-full bg-slate-300" />
                )}
                <span className="text-xs font-medium text-slate-700">
                  {isRecording ? 'Recording' : 'Mic Ready'}
                </span>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-500">{recordingTime}</span>
            </div>

            {!isRecording ? (
              <Button
                onClick={startRecording}
                className="w-full justify-center gap-2 bg-brand-cta text-xs font-medium text-white hover:bg-brand-cta-hover"
                size="sm"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Mic data-icon="inline-start" />
                    Start Consultation Capture
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                className="w-full justify-center gap-2 bg-red-600 text-xs font-medium text-white hover:bg-red-700"
                size="sm"
              >
                <Square data-icon="inline-start" />
                End & Process Note
              </Button>
            )}
          </div>

          {/* Safety Warning Interlock — prescription only; psych/derm surface
              their own risk in the preview block below. */}
          {mode === "general" &&
            extractedData &&
            "safety_warnings" in extractedData &&
            extractedData.safety_warnings.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-amber-700" />
                <span className="text-xs font-semibold text-amber-900">Drug-Allergy Warning</span>
              </div>
              <ul className="ml-5 list-disc space-y-0.5 text-xs leading-relaxed text-amber-800">
                {extractedData.safety_warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Live Transcript Window */}
          <div className="flex min-h-[140px] flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Transcript</span>
            <p className="text-xs leading-relaxed text-slate-700">
              {transcript || (isRecording ? 'Listening to doctor-patient discussion...' : 'No active recording. Click start above.')}
            </p>
          </div>

          {/* Extracted Note Preview */}
          {renderPreview()}

          {/* Natural Language Command Bar */}
          <form onSubmit={handleCommandSubmit} className="relative">
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={
                mode === "psychology"
                  ? extractedData
                    ? "Command Copilot (e.g., 'Expand the plan with exposure homework')..."
                    : "Describe the session (e.g., 'Anxious about exams, CBT + exposure homework')..."
                  : mode === "dermatology"
                    ? extractedData
                      ? "Command Copilot (e.g., 'Add hydrocortisone cream BID 7 days')..."
                      : 'Describe the finding (e.g., "Erythematos papules on cheeks, clobetasol cream OD 14 days")...'
                    : extractedData
                      ? "Command Copilot (e.g., 'Change dosage to 7 days')..."
                      : "Describe the prescription (e.g., 'Fever 3 days, paracetamol 500 TDS 5 days')..."
              }
              className={`w-full rounded-lg border border-slate-300 bg-white py-2.5 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:border-brand-sage focus:outline-none focus:ring-2 focus:ring-brand-pale disabled:opacity-60 ${speechSupported ? 'pl-3 pr-13' : 'pl-3 pr-10'}`}
              disabled={isProcessingCommand}
            />
            {/* 🎙 Voice command — auto-detects whatever language the doctor speaks. */}
            {speechSupported && (
              <button
                type="button"
                onClick={toggleDictation}
                title={isDictating ? 'Stop dictation' : 'Speak your command — the mic listens in any language'}
                aria-label={isDictating ? 'Stop dictation' : 'Speak your command'}
                className="absolute right-10 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 p-1.5 text-slate-500 transition hover:border-brand-sage hover:text-brand-cta disabled:opacity-60"
              >
                {isDictating ? (
                  <Square className="size-3.5 animate-pulse" />
                ) : (
                  <Mic className="size-3.5" />
                )}
              </button>
            )}
            <button
              type="submit"
              disabled={isProcessingCommand || !commandInput.trim()}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-brand-cta p-1.5 text-white transition hover:bg-brand-cta-hover disabled:opacity-40 disabled:hover:bg-brand-cta"
              aria-label="Send command"
            >
              {isProcessingCommand ? (
                <Spinner className="size-3.5" />
              ) : (
                <Send className="size-3.5" />
              )}
            </button>
          </form>

          {/* Disclaimer */}
          <p className="text-center text-[10px] leading-tight text-slate-400">
            AI Draft requires clinician review before saving.
          </p>
        </div>
      )}
    </div>
  );
}
