import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CopilotTimeoutError,
  fetchWithTimeout,
  TRANSCRIBE_TIMEOUT_MS,
} from "@/lib/copilot/fetch-with-timeout";

/**
 * Session recorder for the Psychology Session Notes tab.
 *
 * Lives at the workspace level (not inside the tab) so the recording survives
 * tab switches: the psychologist can open the MSE or Psychometrics mid-session
 * while the microphone keeps capturing. Design decisions mirrored from the
 * copilot drawer's `useAmbientRecorder`:
 *
 * - Audio is captured with MediaRecorder and transcribed with the shared Groq
 *   Whisper route on stop — one authoritative pass, same as everywhere else.
 * - Where the browser supports it, Web Speech's live interim results render as
 *   the transcript the moment speech is recognized, so the tab never looks
 *   frozen; that live text is provisional and is replaced by the server
 *   transcription the instant it lands.
 * - Failures come back as `error` strings, never raised through alert().
 */

type SpeechResult = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal?: boolean;
    0?: { transcript?: string };
  }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResult) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  } catch {
    // Not JSON — a proxy or gateway page. Fall back to the generic sentence.
  }
  return fallback;
}

function describe(caught: unknown, fallback: string): string {
  if (caught instanceof CopilotTimeoutError) return caught.message;
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

export type SessionRecorder = {
  isRecording: boolean;
  /** mm:ss of the current recording. */
  elapsedLabel: string;
  /** Length of the recording in whole seconds. */
  elapsedSeconds: number;
  /** Live (provisional) or final transcription of the session so far. */
  transcript: string;
  /** True while the server is turning the audio into the final transcript. */
  isFinalizing: boolean;
  error: string | null;
  /** Whether the browser can show live captions while recording. */
  liveCaptionsSupported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
};

export function useSessionRecorder(): SessionRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState("00:00");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionRunningRef = useRef(false);
  const speechFinalRef = useRef("");
  /** True once the hook unmounted, so a late onstop never transcribes silently. */
  const detachedRef = useRef(false);

  const liveCaptionsSupported = useMemo(() => typeof window !== "undefined" && getSpeechRecognition() !== null, []);

  // Navigated away mid-recording? Release the mic and timers so the browser
  // never keeps the recording indicator lit on a page that is no longer there.
  useEffect(() => {
    return () => {
      detachedRef.current = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // already stopped
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // already inactive
        }
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  const clear = useCallback(() => {
    if (recognitionRunningRef.current) return;
    setTranscript("");
    speechFinalRef.current = "";
    setError(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    setElapsedSeconds(0);
    setElapsedLabel("00:00");
    speechFinalRef.current = "";
    chunksRef.current = [];
    detachedRef.current = false;

    // 1. Live captions through Web Speech, when the browser offers them.
    recognitionRef.current = null;
    const recognition = getSpeechRecognition();
    if (recognition) {
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let final = "";
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result && result[0] ? result[0].transcript ?? "" : "";
          if (result?.isFinal) final += text;
          else interim += text;
        }
        if (final) speechFinalRef.current = `${speechFinalRef.current} ${final}`.trim();
        setTranscript(`${speechFinalRef.current} ${interim}`.trim());
      };
      recognition.onend = () => {
        recognitionRunningRef.current = false;
      };
      recognition.onerror = () => {
        // Recognition can drop out (noise, network) while the mic keeps
        // recording — not fatal, the server pass still transcribes at the end.
      };
      try {
        recognition.start();
        recognitionRunningRef.current = true;
      } catch {
        recognitionRunningRef.current = false;
      }
    }

    // 2. The authoritative audio capture.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser cannot record audio. Recording needs a secure (https) connection — you can still type the note.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (caught) {
      setError(
        describe(caught, "Microphone access was denied or no microphone is available."),
      );
      return;
    }
    streamRef.current = stream;

    let mediaRecorder: MediaRecorder;
    try {
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (caught) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(describe(caught, "This browser cannot record audio. You can still type the note."));
      return;
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (detachedRef.current) return;
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // The live captions are the quick read while recording; the server pass
      // is the accurate copy. Prefer the server pass, live text as a fallback.
      const liveText = speechFinalRef.current.trim();
      if (chunksRef.current.length === 0) {
        if (liveText) {
          setTranscript(liveText);
          return;
        }
        setError("No audio was captured. Please try recording again.");
        return;
      }

      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      setIsFinalizing(true);
      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        const res = await fetchWithTimeout(
          "/api/scribe/transcribe",
          { method: "POST", body: formData },
          TRANSCRIBE_TIMEOUT_MS,
          "Transcription",
        );
        if (!res.ok) {
          throw new Error(
            await readApiError(
              res,
              `Transcription failed (${res.status}). The recording service did not accept the audio.`,
            ),
          );
        }
        const body = (await res.json()) as { text?: string };
        const finalText = (body.text ?? "").trim() || liveText;
        setTranscript(finalText);
        if (!finalText) {
          setError(
            "No speech was detected in this recording. Check the microphone, speak closer to it, and try again.",
          );
        }
      } catch (caught) {
        console.error("[useSessionRecorder] transcription failed:", caught);
        if (liveText) {
          setTranscript(liveText);
          setError("Live captions were kept — the full transcription service was unavailable.");
        } else {
          setError(describe(caught, "We could not transcribe this recording. Please try again."));
        }
      } finally {
        setIsFinalizing(false);
      }
    };

    mediaRecorder.onerror = () => {
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          // already stopped
        }
      }
      setError("Recording stopped unexpectedly. Please try again.");
    };

    mediaRecorder.start(1000);
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);

    startTimeRef.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
      setElapsedLabel(formatTime(elapsed));
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current && recognitionRunningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
      recognitionRunningRef.current = false;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    isRecording,
    elapsedLabel,
    elapsedSeconds,
    transcript,
    isFinalizing,
    error,
    liveCaptionsSupported,
    start,
    stop,
    clear,
  };
}