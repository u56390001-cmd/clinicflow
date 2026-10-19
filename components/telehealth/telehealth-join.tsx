"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, PhoneOff, X } from "lucide-react";

import { TelehealthChat } from "@/components/telehealth/telehealth-chat";

/**
 * Phase 8 — the patient-facing zero-app WebRTC view. It parses the room and
 * KitToken handed over in the URL, then mounts the ZEGOcloud prebuilt UIKit in
 * one-on-one mode. The kit renders its own pre-call device check (microphone and
 * camera permission prompts) and adapts bitrate to the network, so there is
 * nothing to install and nothing else for the patient to do.
 *
 * The patient chat runs alongside the video, authorised purely by the room id
 * and the KitToken already in the URL — the patient never signs in.
 */
export function TelehealthJoinClient({
  roomId,
  token,
  patientName,
  doctorName,
}: {
  roomId: string;
  token: string;
  patientName: string | null;
  doctorName: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zgRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const element = containerRef.current;
      if (!element) return;
      try {
        const { ZegoUIKitPrebuilt } =
          await import("@zegocloud/zego-uikit-prebuilt");
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
          <h1 className="text-ink text-[15px] font-bold">Couldn&apos;t join</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-black">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">
            {doctorName ?? "Your clinician"}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {patientName ?? "Video consultation"}
            <span aria-hidden="true"> · </span>
            <span className="hidden sm:inline">Secure video consultation</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChatOpen((value) => !value)}
          aria-expanded={chatOpen}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
          aria-label={chatOpen ? "Close chat" : "Open chat with the clinic"}
        >
          {chatOpen ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <MessageSquare className="size-4" aria-hidden="true" />
          )}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {/* Strict 16:9 picture, letterboxed on black — same rule as the clinic
            panel, so a wide laptop screen never stretches the patient's feed. */}
        <div className="relative aspect-video max-h-full w-full overflow-hidden">
          <div
            ref={containerRef}
            data-room={roomId}
            className="telehealth-video-viewport absolute inset-0 h-full w-full"
          />
        </div>

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
                patientName={doctorName}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
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
