'use client';

import React, { useState } from 'react';
import { Mic, Square, Sparkles, ChevronRight, ChevronLeft, AlertTriangle, Send, X } from 'lucide-react';
import { useAmbientRecorder } from '@/lib/copilot/hooks/useAmbientRecorder';
import { CopilotExtraction, EMPTY_EXTRACTION } from '@/lib/copilot/types';
import { fetchWithTimeout, COMMAND_TIMEOUT_MS } from '@/lib/copilot/fetch-with-timeout';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface CopilotDrawerProps {
  patientProfile?: { allergies?: string; current_meds?: string };
  onPopulateForm: (data: CopilotExtraction) => void;
}

export function CopilotDrawer({ patientProfile, onPopulateForm }: CopilotDrawerProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [commandInput, setCommandInput] = useState<string>('');
  const [isProcessingCommand, setIsProcessingCommand] = useState<boolean>(false);

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
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-[18px] text-teal-500" />
              <h3 className="text-sm font-semibold text-slate-900">Ambient Copilot</h3>
            </div>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-700">
              {isRecording ? 'LISTENING' : 'READY'}
            </span>
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

              <Button
                onClick={() => onPopulateForm(extractedData)}
                className="w-full justify-center bg-teal-600 text-xs font-semibold text-white shadow-md hover:bg-teal-700"
                size="sm"
              >
                Populate Prescription Form
              </Button>
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
