"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { TelehealthChat } from "@/components/telehealth/telehealth-chat";
import { Button } from "@/components/ui/button";
import { TelehealthCall, type TelehealthEvents } from "@/lib/zego/engine";
import { cn } from "@/lib/utils";

/**
 * Phase 8 → custom-engine rewrite — the patient-facing zero-app WebRTC view.
 *
 * The URL carries the room id and the short-lived KitToken; the server page
 * decodes the token's public envelope so this client knows which ZEGO app to
 * start the engine on. Who sequence:
 *
 *   pre-join    the user grants camera & mic and sees a live preview
 *   connecting  loginRoom + publish
 *   waiting     room joined, clinician has not started their stream yet
 *   connected   the consultation is live
 *   ended       the user hung up (or the token/room was closed)
 *
 * The chat runs alongside the video, authorised purely by the room id and the
 * token already in the URL — the patient never signs in. The whole video
 * stage is our own markup: the aspect follows the window (portrait on a
 * phone, widescreen on a laptop), never the fixed 16:9 box the prebuilt kit
 * forced.
 */

type Phase = "prejoin" | "connecting" | "waiting" | "connected" | "ended";

type Props = {
  roomId: string;
  token: string;
  zegoAppId: number;
  zegoUserId: string;
  patientName: string | null;
  doctorName: string | null;
};

function formatTimer(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(seconds / 60) % 60;
  const padded = (value: number) => String(value).padStart(2, "0");
  const total = `${Math.floor(seconds / 3600)}:${padded(mins)}:${padded(seconds % 60)}`;
  return total.replace(/^0:0?/, "");
}

/** Local preview mirroring so patients see themselves the way they expect. */
const mirrorClass = "scale-x-[-1]";

export function TelehealthJoinClient({
  roomId,
  token,
  zegoAppId,
  zegoUserId,
  patientName,
  doctorName,
}: Props) {
  const callRef = useRef<TelehealthCall | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const endedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("prejoin");
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState(true);
  const [remoteCameraOn, setRemoteCameraOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const doctorDisplay = doctorName ?? "Your clinician";
  const patientDisplay = patientName ?? "Video consultation";

  const buildCall = useCallback((): TelehealthCall => {
    const events: TelehealthEvents = {
      onPeerJoined: () => setPhase((current) => (current === "ended" ? current : "connected")),
      onPeerLeft: () => setPhase((current) => (current === "ended" ? current : "waiting")),
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        if (stream) {
          setPhase((current) => (current === "ended" ? current : "connected"));
        }
      },
      onRemoteMic: (on) => setRemoteMicOn(on),
      onRemoteCamera: (on) => setRemoteCameraOn(on),
      onRoomDisconnected: () => {
        if (!endedRef.current) {
          setPhase("ended");
        }
      },
      onError: () => {
        /* stage overlays keep the call usable; a hard failure surfaces below */
      },
    };
    return new TelehealthCall({
      appId: zegoAppId,
      roomId,
      token,
      userId: zegoUserId,
      userName: patientName ?? "Patient",
      events,
    });
  }, [zegoAppId, roomId, token, zegoUserId, patientName]);

  // Spin up the camera for the pre-join preview: consent prompts live here, so
  // the join itself is instant.
  useEffect(() => {
    let cancelled = false;
    const running = buildCall();
    callRef.current = running;
    (async () => {
      try {
        const stream = await running.prepare();
        if (cancelled) return;
        setPreviewStream(stream);
      } catch (prepareError) {
        if (cancelled) return;
        console.error("[TelehealthJoinClient] prepare failed", prepareError);
        setError(
          prepareError instanceof Error
            ? prepareError.message
            : "Can't open your camera or microphone.",
        );
      }
    })();
    return () => {
      cancelled = true;
      void destroySafely(callRef.current);
      callRef.current = null;
    };
  }, [buildCall]);

  useEffect(() => {
    const node = remoteVideoRef.current;
    if (!node) return;
    node.srcObject = remoteStream;
    if (remoteStream) void node.play().catch(() => undefined);
  }, [remoteStream]);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    node.srcObject = previewStream;
    if (previewStream) void node.play().catch(() => undefined);
  }, [previewStream]);

  useEffect(() => {
    endedRef.current = phase === "ended";
  }, [phase]);

  useEffect(() => {
    if (phase === "prejoin" || phase === "ended") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (!endedRef.current) {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function join() {
    const running = callRef.current ?? buildCall();
    callRef.current = running;
    setPhase("connecting");
    try {
      await running.join();
      // Publish muted only when the patient turned a device off in preview.
      running.toggleMic(!micOn);
      running.toggleCamera(!cameraOn);
      setPhase("waiting");
    } catch (joiningError) {
      console.error("[TelehealthJoinClient] join failed", joiningError);
      setError(
        joiningError instanceof Error
          ? joiningError.message
          : "We couldn't open the consultation. The link may have expired — ask the clinic for a new one.",
      );
      setPhase("ended");
    }
  }

  async function leave() {
    endedRef.current = true;
    setPhase("ended");
    await destroySafely(callRef.current);
    callRef.current = null;
  }

  async function rejoin() {
    setError(null);
    endedRef.current = false;
    await destroySafely(callRef.current);
    callRef.current = null;
    const running = buildCall();
    callRef.current = running;
    setPhase("connecting");
    try {
      const stream = await running.prepare();
      setPreviewStream(stream);
      await running.join();
      setMicOn(true);
      setCameraOn(true);
      running.toggleMic(true);
      running.toggleCamera(true);
      setPhase("waiting");
    } catch (rejoinError) {
      console.error("[TelehealthJoinClient] rejoin failed", rejoinError);
      setError(
        rejoinError instanceof Error
          ? rejoinError.message
          : "We couldn't restart the consultation.",
      );
      setPhase("ended");
    }
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    // In the room the wrapper mutes the publish track; before joining the
    // preview's own track is silenced so the toggle feels real.
    const running = callRef.current;
    if (!running) return;
    if (phase === "prejoin" && previewStream) {
      previewStream.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    } else {
      running.toggleMic(!next);
    }
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    const running = callRef.current;
    if (!running) return;
    if (phase === "prejoin" && previewStream) {
      previewStream.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
    } else {
      running.toggleCamera(!next);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app px-4">
        <div className="max-w-sm rounded-control border-[0.5px] border-hairline bg-surface p-6 text-center shadow-dropdown">
          <PhoneOff
            className="mx-auto mb-3 size-8 text-status-destructive"
            aria-hidden="true"
          />
          <h1 className="text-ink text-[15px] font-bold">Couldn&apos;t join</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            {error}
          </p>
          {phase !== "prejoin" && (
            <Button size="sm" className="mt-4" onClick={() => void rejoin()}>
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "prejoin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md overflow-hidden rounded-card border-[0.5px] border-white/10 bg-surface shadow-dropdown">
          <div className="relative aspect-video bg-black">
            <video
              autoPlay
              muted
              playsInline
              ref={previewRef}
              className={cn(
                "h-full w-full object-cover",
                cameraOn && mirrorClass,
              )}
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center">
                <VideoOff className="size-6 text-white/60" aria-hidden="true" />
              </div>
            )}
            {!previewStream && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70">
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-3 px-5 py-4">
            <div>
              <p className="text-ink text-[15px] font-bold">
                Join your consultation
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary">
                {doctorDisplay} is waiting for you at {patientDisplay}. No app
                needed — everything runs in your browser.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={micOn}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-control border-[0.5px] px-3 py-2 text-[12.5px] font-semibold transition",
                  micOn
                    ? "border-hairline bg-app text-ink"
                    : "border-status-destructive/40 bg-status-destructive/10 text-status-destructive",
                )}
              >
                {micOn ? (
                  <Mic className="size-4" aria-hidden="true" />
                ) : (
                  <MicOff className="size-4" aria-hidden="true" />
                )}
                {micOn ? "Mic on" : "Mic off"}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                aria-pressed={cameraOn}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-control border-[0.5px] px-3 py-2 text-[12.5px] font-semibold transition",
                  cameraOn
                    ? "border-hairline bg-app text-ink"
                    : "border-status-destructive/40 bg-status-destructive/10 text-status-destructive",
                )}
              >
                {cameraOn ? (
                  <Video className="size-4" aria-hidden="true" />
                ) : (
                  <VideoOff className="size-4" aria-hidden="true" />
                )}
                {cameraOn ? "Camera on" : "Camera off"}
              </button>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!previewStream}
              onClick={() => void join()}
            >
              <Video className="size-4" />
              Join consultation
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">
            {doctorDisplay}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {patientDisplay}
            <span aria-hidden="true"> · </span>
            <span className="hidden sm:inline">Secure video consultation · </span>
            <span className="tabular-nums">{formatTimer(elapsed)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChatOpen((value) => !value)}
            aria-expanded={chatOpen}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
            aria-label={chatOpen ? "Close chat" : "Open chat with the clinic"}
          >
            {chatOpen ? (
              <X className="size-4" aria-hidden="true" />
            ) : (
              <MessageSquare className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-black">
        {phase === "ended" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-center">
            <PhoneOff className="size-8 text-slate-400" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-white">Call closed</p>
            <p className="text-[12.5px] text-slate-400">
              You can rejoin the room while your link stays valid.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void rejoin()}>
              <RefreshCw className="size-3.5" />
              Rejoin
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
            {(phase === "waiting" || phase === "connecting" || !remoteStream) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-center">
                {previewStream ? (
                  <video
                    autoPlay
                    muted
                    playsInline
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover opacity-40 grayscale",
                      cameraOn && mirrorClass,
                    )}
                  />
                ) : null}
                <div className="relative z-10 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-3 py-1.5 text-[12px] font-medium text-white">
                  {phase === "connecting" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Video className="size-3.5" />
                  )}
                  {phase === "connecting"
                    ? "Connecting…"
                    : `Waiting for ${doctorDisplay}…`}
                </div>
              </div>
            )}
            {remoteStream && previewStream && (
              <div
                className={cn(
                  "absolute bottom-3 right-3 z-10 h-28 w-[84px] overflow-hidden rounded-lg border border-white/25 bg-black",
                  phase === "waiting" && "hidden",
                )}
              >
                {cameraOn ? (
                  <video
                    autoPlay
                    muted
                    playsInline
                    className={cn(mirrorClass, "h-full w-full object-cover")}
                    ref={(node) => {
                      if (!node) return;
                      node.srcObject = previewStream;
                      void node.play().catch(() => undefined);
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <VideoOff className="size-4 text-white/60" aria-hidden="true" />
                  </div>
                )}
              </div>
            )}
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-pressed={micOn}
                aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition hover:bg-black/80"
              >
                {micOn ? (
                  <Mic className="size-5" aria-hidden="true" />
                ) : (
                  <MicOff
                    className="size-5 text-status-destructive"
                    aria-hidden="true"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                aria-pressed={cameraOn}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
                className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition hover:bg-black/80"
              >
                {cameraOn ? (
                  <Video className="size-5" aria-hidden="true" />
                ) : (
                  <VideoOff
                    className="size-5 text-status-destructive"
                    aria-hidden="true"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => void leave()}
                aria-label="Leave the call"
                className="inline-flex size-11 items-center justify-center rounded-full border border-transparent bg-status-destructive text-white transition hover:bg-status-destructive/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-destructive"
              >
                <PhoneOff className="size-5" aria-hidden="true" />
              </button>
            </div>
            {remoteStream && !remoteCameraOn && (
              <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-2 py-[3px] text-[11px] font-medium text-white">
                <VideoOff className="size-3" aria-hidden="true" />
                {doctorDisplay.split(" ")[0]} camera off
              </span>
            )}
            {remoteStream && !remoteMicOn && micOn && (
              <span className="absolute left-3 top-3 z-10 mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-2 py-[3px] text-[11px] font-medium text-white">
                <MicOff className="size-3" aria-hidden="true" />
                {doctorDisplay.split(" ")[0]} mic off
              </span>
            )}
          </>
        )}

        {chatOpen && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-white/10 bg-app shadow-dropdown sm:w-[360px]">
            <div className="flex justify-end border-b border-hairline px-2 py-1.5">
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
                className="inline-flex size-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-app"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TelehealthChat
                mode="patient"
                roomId={roomId}
                token={token}
                patientName={doctorDisplay}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

async function destroySafely(call: TelehealthCall | null) {
  if (!call) return;
  try {
    await call.destroy();
  } catch {
    /* already gone */
  }
}

/** Loading shell shown while the client bundle and token are wired up. */
export function TelehealthJoinLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-text-secondary">
      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
      Connecting…
    </div>
  );
}
