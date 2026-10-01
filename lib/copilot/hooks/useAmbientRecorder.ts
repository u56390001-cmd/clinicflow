import { useState, useRef, useCallback } from 'react';
import { CopilotExtraction } from '@/lib/copilot/types';
import {
  CopilotTimeoutError,
  fetchWithTimeout,
  STRUCTURE_TIMEOUT_MS,
  TRANSCRIBE_TIMEOUT_MS
} from '@/lib/copilot/fetch-with-timeout';

interface UseAmbientRecorderProps {
  patientProfile?: {
    allergies?: string;
    current_meds?: string;
  };
}

/**
 * Ambient capture for the Rx copilot.
 *
 * Failures are returned as `error` rather than raised through `alert()`: the
 * drawer's own alert sat on top of the workspace with no styling, could be
 * missed, and left the UI in exactly the state it was reporting on - a failed
 * capture left the command bar locked and the drawer looking idle.
 */
/**
 * Pull the server's own explanation out of a failed response.
 *
 * The route knows exactly why it refused — a rejected key, an exhausted quota, a
 * missing Groq credential — and sends that reason as `error`. Throwing a fixed
 * sentence instead threw it away: the drawer reported "the recording service did
 * not accept the audio" while the real cause sat one line behind it in the
 * console, so the message a doctor was shown could never be acted on.
 */
async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error.trim()) {
      return body.error.trim();
    }
  } catch {
    // Not JSON — a proxy or gateway page. Fall back to the generic sentence.
  }
  return fallback;
}

export function useAmbientRecorder({ patientProfile }: UseAmbientRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState('00:00');
  const [transcript, setTranscript] = useState('');
  const [extractedData, setExtractedData] = useState<CopilotExtraction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearError = useCallback(() => setError(null), []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /** One place to phrase a failure, so the drawer never shows a raw stack name. */
  const describe = (caught: unknown, fallback: string): string => {
    if (caught instanceof CopilotTimeoutError) return caught.message;
    if (caught instanceof Error && caught.message) return caught.message;
    return fallback;
  };

  const processRecording = useCallback(async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Step 1: Transcribe audio
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      const transcribeRes = await fetchWithTimeout(
        '/api/scribe/transcribe',
        { method: 'POST', body: formData },
        TRANSCRIBE_TIMEOUT_MS,
        'Transcription'
      );

      if (!transcribeRes.ok) {
        throw new Error(
          await readApiError(
            transcribeRes,
            `Transcription failed (${transcribeRes.status}). The recording service did not accept the audio.`,
          ),
        );
      }

      const transcribeData = await transcribeRes.json();
      const transcriptText = transcribeData.text || '';
      // Set before the emptiness check so a silent recording still leaves the
      // transcript visible for the doctor to inspect.
      setTranscript(transcriptText);

      if (!transcriptText.trim()) {
        throw new Error(
          'No speech was detected in this recording. Check the microphone, speak closer to it, and try again.'
        );
      }

      // Step 2: Structure transcript into SOAP JSON
      const structureRes = await fetchWithTimeout(
        '/api/scribe/structure',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcriptText,
            patientProfile: patientProfile || {}
          })
        },
        STRUCTURE_TIMEOUT_MS,
        'Note structuring'
      );

      if (!structureRes.ok) {
        throw new Error(
          await readApiError(
            structureRes,
            `Could not structure the note (${structureRes.status}). The transcript is above - you can still use it.`,
          ),
        );
      }

      const structureData = await structureRes.json();
      setExtractedData(structureData.data);
    } catch (caught) {
      console.error('Processing error:', caught);
      setError(describe(caught, 'We could not process this recording. Please try again.'));
    } finally {
      setIsProcessing(false);
    }
  }, [patientProfile]);

  const startRecording = useCallback(async () => {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'This browser cannot record audio. Recording needs a secure (https) connection - the command bar below still works.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Release the mic first: a held-open track keeps the browser's recording
        // indicator lit while the (much slower) transcription runs.
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length === 0) {
          setError('No audio was captured. Please try recording again.');
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processRecording(audioBlob);
      };

      mediaRecorder.onerror = () => {
        setError('Recording stopped unexpectedly. Please try again.');
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setTranscript('');
      setExtractedData(null);

      // Start timer
      startTimeRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingTime(formatTime(elapsed));
      }, 1000);
    } catch (caught) {
      console.error('Failed to start recording:', caught);
      setError(
        describe(
          caught,
          'Microphone access was denied or no microphone is available. You can still use the command bar below.'
        )
      );
    }
  }, [processRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  return {
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
  };
}