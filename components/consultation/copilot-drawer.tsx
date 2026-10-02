'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Sparkles, ChevronRight, ChevronLeft, AlertTriangle, Send, X, Undo2, Zap, Check } from 'lucide-react';
import { useAmbientRecorder } from '@/lib/copilot/hooks/useAmbientRecorder';
import { CopilotExtraction, EMPTY_EXTRACTION } from '@/lib/copilot/types';
import { fetchWithTimeout, COMMAND_TIMEOUT_MS } from '@/lib/copilot/fetch-with-timeout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface CopilotDrawerProps {
  patientProfile?: { allergies?: string; current_meds?: string };
  onPopulateForm: (data: CopilotExtraction) => void;
  /** Restores the pre-copilot draft. Omitted where there is no undo to offer. */
  onUndo?: () => boolean;
  /** True while an AI-written draft is still unreviewed — drives the Undo button. */
  canUndo?: boolean;
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
  patientProfile,
  onPopulateForm,
  onUndo,
  canUndo = false
}: CopilotDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [commandInput, setCommandInput] = useState<string>('');
  const [isProcessingCommand, setIsProcessingCommand] = useState<boolean>(false);
  const [autoApply, setAutoApply] = useState<boolean>(true);

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
  } = useAmbientRecorder({ patientProfile });

  // Command failures are shown in the drawer too, not alerted: the recording
  // path and the command path fail for the same reasons (no API key, no
  // network), so they should read the same way.
  const [commandError, setCommandError] = useState<string | null>(null);

  // Which extraction is already in the form. Without this, auto-apply would
  // fire again on every re-render, and — worse — a re-extraction of the *same*
  // transcript would write the form again after the doctor had corrected it.
  const appliedRef = useRef<CopilotExtraction | null>(null);

  /** Write an extraction to the form, once. Returns true when it wrote. */
  const applyOnce = useCallback(
    (data: CopilotExtraction) => {
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

  /** Undo, then forget the mark so the same extraction is not silently re-applied. */
  const handleUndo = useCallback(() => {
    const restored = onUndo?.();
    if (restored) {
      appliedRef.current = null;
      setExtractedData(null);
    }
  }, [onUndo, setExtractedData]);

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const command = commandInput.trim();
    if (!command || isProcessingCommand) return;

    setIsProcessingCommand(true);
    setCommandError(null);
    try {
      // A command with nothing recorded yet edits a blank draft rather than
      // being refused. Typing "paracetamol 500 TDS 5 days for fever" is a
      // complete prescription on its own, and making the doctor record audio
      // first to reach this box defeated the point of the box.
      const res = await fetchWithTimeout(
        '/api/scribe/command',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentFormState: extractedData ?? EMPTY_EXTRACTION,
            command
          })
        },
        COMMAND_TIMEOUT_MS,
        'The copilot'
      );

      // Parsed defensively: a failed request can still come back as a gateway's
      // HTML page rather than the route's JSON, and letting `res.json()` throw
      // on its own would replace a useful explanation with a parser complaint.
      let result: { data?: CopilotExtraction; error?: string } | null = null;
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
        // A typed command is just as complete a prescription as a recording, so
        // it goes to the form by the same rule. Left on the manual button this
        // would have meant the doctor typed a full order and then pressed one
        // more key to send it — the one interaction auto-apply exists to remove.
        if (autoApply) applyOnce(result.data);
      } else {
        throw new Error('The copilot did not return a prescription. Try rephrasing the command.');
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
  };

  return (
    <div
      className={`relative flex shrink-0 flex-col border-l border-slate-200 bg-gradient-to-b from-slate-50 to-white transition-all duration-300 ease-in-out ${
        isOpen ? 'w-80 lg:w-96' : 'w-12'
      }`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -left-3 top-6 z-10 flex size-6 items-center justify-center rounded-full border border-teal-200 bg-white shadow-sm transition hover:border-teal-400 hover:bg-teal-50"
        title={isOpen ? 'Collapse Copilot' : 'Expand Copilot'}
      >
        {isOpen ? <ChevronRight className="size-3.5 text-teal-600" /> : <ChevronLeft className="size-3.5 text-teal-600" />}
      </button>

      {!isOpen ? (
        <div className="flex flex-col items-center gap-6 pt-12">
          <Sparkles className="size-5 animate-pulse text-teal-500" />
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
                <Sparkles className="size-[18px] text-teal-500" />
                <h3 className="text-sm font-semibold text-slate-900">Ambient Copilot</h3>
              </div>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-700">
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
                    ? 'Extracted notes are written into the prescription form as soon as they are ready.'
                    : 'Extracted notes wait for you to press Populate Prescription Form.'
                }
                className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 transition hover:text-teal-700"
              >
                <span
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                    autoApply ? 'bg-teal-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
                      autoApply ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                Auto-fill form
                {autoApply && <Zap className="size-3 text-teal-600" aria-hidden="true" />}
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
                className="w-full justify-center gap-2 bg-teal-600 text-xs font-medium text-white hover:bg-teal-700"
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

          {/* Safety Warning Interlock */}
          {extractedData?.safety_warnings && extractedData.safety_warnings.length > 0 && (
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

          {/* Extracted Orders Preview */}
          {extractedData && (
            <div className="flex flex-col gap-3 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-teal-900">Extracted Draft</span>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 font-mono text-[10px] font-medium text-teal-700">
                  {extractedData.medicines?.length || 0} meds
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-700">
                <p>
                  <strong className="font-semibold text-slate-900">Chief Complaint:</strong>{' '}
                  {extractedData.chief_complaint || 'N/A'}
                </p>
                <p>
                  <strong className="font-semibold text-slate-900">Diagnosis:</strong>{' '}
                  {extractedData.diagnosis || 'N/A'}
                </p>
              </div>

              {appliedRef.current === extractedData ? (
                /* Already in the form. The button becomes the confirmation it
                   really is, instead of disappearing — the doctor needs to see
                   that the note landed here and not somewhere else. */
                <div className="flex items-center justify-center gap-1.5 rounded-lg border border-teal-300 bg-white/70 px-3 py-2 text-[11px] font-medium text-teal-800">
                  <Check className="size-3.5" aria-hidden="true" />
                  Written to the prescription form
                </div>
              ) : (
                <Button
                  onClick={() => onPopulateForm(extractedData)}
                  className="w-full justify-center bg-teal-600 text-xs font-semibold text-white shadow-md hover:bg-teal-700"
                  size="sm"
                >
                  Populate Prescription Form
                </Button>
              )}
            </div>
          )}

          {/* Natural Language Command Bar */}
          <form onSubmit={handleCommandSubmit} className="relative">
            <input
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder={
                extractedData
                  ? "Command Copilot (e.g., 'Change dosage to 7 days')..."
                  : "Describe the prescription (e.g., 'Fever 3 days, paracetamol 500 TDS 5 days')..."
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100 disabled:opacity-60"
              disabled={isProcessingCommand}
            />
            <button
              type="submit"
              disabled={isProcessingCommand || !commandInput.trim()}
              className="absolute right-2 top-2.5 text-teal-500 transition hover:text-teal-700 disabled:opacity-40"
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
