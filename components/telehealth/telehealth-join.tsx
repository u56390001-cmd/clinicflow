"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PhoneOff } from "lucide-react";

/**
 * Phase 8 — the patient-facing zero-app WebRTC view. It parses the room and
 * KitToken handed over in the URL, then mounts the ZEGOcloud prebuilt UIKit in
 * one-on-one mode. The kit renders its own pre-call device check (microphone and
 * camera permission prompts) and adapts bitrate to the network, so there is
 * nothing to install and nothing else for the patient to do.
 */
export function TelehealthJoinClient({
  roomId,
  token,
  patientName: _patientName,
  doctorName: _doctorName,
}: {
  roomId: string;
  token: string;
  patientName: string | null;
  doctorName: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zgRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const element = containerRef.current;
      if (!element) return;
      try {
        const { ZegoUIKitPrebuilt } = await import(
          "@zegocloud/zego-uikit-prebuilt"
        );
        if (cancelled) return;
        const zp = ZegoUIKitPrebuilt.create(token);
        zgRef.current = zp;
        zp.joinRoom({
          container: element,
          scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
          showPreJoinView: true,
          turnOnMicrophoneWhenJoining: true,
          turnOnCameraWhenJoining: true,
          showUserList: false,
          showTextChat: false,
          showLeavingView: true,
        });
      } catch (joinError) {
        if (cancelled) return;
        console.error("[TelehealthJoinClient] join failed", joinError);
        setError(
          "We couldn't open the consultation. The link may have expired — ask the clinic for a new one.",
        );
      }
    })();
    return () => {
      cancelled = true;
      try {
        zgRef.current?.destroy();
      } catch {
        /* already destroyed */
      }
      zgRef.current = null;
    };
  }, [token]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app px-4">
        <div className="max-w-sm rounded-control border-[0.5px] border-hairline bg-surface p-6 text-center shadow-dropdown">
          <PhoneOff
            className="mx-auto mb-3 size-8 text-status-destructive"
            aria-hidden="true"
          />
          <h1 className="text-[15px] font-bold text-ink">Couldn&apos;t join</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-room={roomId}
      className="h-screen w-screen bg-black"
    />
  );
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
