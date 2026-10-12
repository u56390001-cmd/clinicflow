"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error.trim()) {
      return body.error.trim();
    }
  } catch {
    // not JSON
  }
  return fallback;
}

/**
 * Voice-to-note: records in the browser and posts the clip to the existing
 * scribe transcription route, handing the recognised text back through
 * `onTranscript`. It is the same transcription service the consultation
 * copilot uses — no second speech pipeline.
 */
export function VoiceInputButton({
  onTranscript,
  disabled,
  label = "Dictate",
  className,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => release, [release]);

  const transcribe = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    release();
    if (blob.size === 0) {
      toast.error("No audio was captured. Please try again.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", blob, "recording.webm");
      const res = await fetch("/api/scribe/transcribe", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(
          await readError(res, `Transcription failed (${res.status}).`),
        );
      }
      const data = await res.json();
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (!text) {
        toast.error("No speech was detected. Please try again.");
        return;
      }
      onTranscript(text);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Transcription failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [onTranscript, release]);

  const start = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      toast.error(
        "This browser cannot record audio. Dictation needs a secure (https) connection.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void transcribe();
      };
      recorder.onerror = () => {
        toast.error("Recording stopped unexpectedly. Please try again.");
        release();
        setRecording(false);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(
        () => setSeconds((value) => value + 1),
        1000,
      );
    } catch {
      toast.error(
        "Microphone access was denied. Check your browser permissions.",
      );
    }
  }, [release, transcribe]);

  const stop = useCallback(() => {
    if (recorderRef.current && recording) {
      recorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [recording]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || busy}
      aria-pressed={recording}
      onClick={recording ? stop : start}
      className={cn(
        "h-7 gap-1.5 px-2 text-[11.5px]",
        recording && "border-status-destructive text-status-destructive",
        className,
      )}
    >
      {busy ? (
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      ) : recording ? (
        <Square aria-hidden="true" className="size-3 fill-current" />
      ) : (
        <Mic aria-hidden="true" className="size-3.5" />
      )}
      {busy
        ? "Transcribing…"
        : recording
          ? `Stop ${formatClock(seconds)}`
          : label}
    </Button>
  );
}
