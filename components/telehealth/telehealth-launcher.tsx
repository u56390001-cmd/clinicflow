"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Loader2,
  Maximize2,
  Minimize2,
  PhoneOff,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  endTelehealthSessionAction,
  startTelehealthSessionAction,
} from "@/lib/actions/telehealth";
import { cn } from "@/lib/utils";

type ActiveCall = {
  sessionId: string;
  roomId: string;
  doctorToken: string;
  doctorName: string;
  joinUrl: string;
};

/**
 * Phase 8 — the doctor's telehealth launcher, mounted in the active-patient
 * header. Starting a call mints a room token server-side (`startTelehealth…`)
 * and mounts the ZEGOcloud prebuilt UIKit in a floating, collapsible panel so
 * the SOAP notes, psychometrics and prescriptions stay usable underneath.
 *
 * Delivery: the patient link goes out over WhatsApp when the clinic is
 * connected; the same link is always copied to the clipboard as a manual
 * fallback, and the panel keeps a "Copy link" button for re-sends.
 */
export function TelehealthLauncher({
  patientId,
  whatsappNumber,
  canManage,
}: {
  patientId: string;
  whatsappNumber: string | null;
  canManage: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [ending, setEnding] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const zgRef = useRef<{ destroy: () => void } | null>(null);
  const hasWhatsapp = (whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;

  const teardown = useCallback(() => {
    try {
      zgRef.current?.destroy();
    } catch {
      /* the kit may already be torn down */
    }
    zgRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  async function start() {
    if (pending) return;
    setPending(true);
    const result = await startTelehealthSessionAction(patientId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setCall({
      sessionId: result.data.sessionId,
      roomId: result.data.roomId,
      doctorToken: result.data.doctorToken,
      doctorName: result.data.doctorName,
      joinUrl: result.data.joinUrl,
    });
    setCollapsed(false);

    const copied = await copyLink(result.data.joinUrl);
    if (result.data.whatsappSent) {
      toast.success(
        copied
          ? "Link sent on WhatsApp · copied to clipboard"
          : "Link sent on WhatsApp",
      );
    } else {
      toast("Link ready · copied to clipboard", {
        description:
          "Patient link is in your clipboard — send it via SMS or any channel.",
      });
    }
  }

  // Mount the ZEGOcloud UIKit once the container exists and a token is set.
  useEffect(() => {
    if (!call) return;
    let cancelled = false;
    (async () => {
      const element = containerRef.current;
      if (!element) return;
      const { ZegoUIKitPrebuilt } = await import(
        "@zegocloud/zego-uikit-prebuilt"
      );
      if (cancelled) return;
      const zp = ZegoUIKitPrebuilt.create(call.doctorToken);
      zgRef.current = zp;
      zp.joinRoom({
        container: element,
        scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
        showPreJoinView: false,
        turnOnMicrophoneWhenJoining: true,
        turnOnCameraWhenJoining: true,
        showUserList: false,
        showTextChat: false,
        showLeavingView: false,
        showScreenSharingButton: true,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [call]);

  async function end() {
    if (!call || ending) return;
    setEnding(true);
    teardown();
    const result = await endTelehealthSessionAction(call.sessionId);
    setEnding(false);
    setCall(null);
    if (!result.ok) toast.error(result.message);
    else toast.success("Call ended");
  }

  if (!canManage) return null;

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={pending || call !== null}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border-[1.5px] border-primary bg-surface px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Video className="size-4" aria-hidden="true" strokeWidth={2} />
        )}
        {pending ? "Starting…" : call ? "In call" : "Video Call"}
      </button>

      {call && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 flex flex-col overflow-hidden rounded-control border-[0.5px] border-hairline bg-surface shadow-dropdown",
            collapsed ? "h-auto w-[260px]" : "h-[520px] w-[min(92vw,860px)]",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b-[0.5px] border-hairline px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Video className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate text-[12.5px] font-bold text-ink">
                Telehealth · {call.doctorName}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => copyLink(call.joinUrl)}
                title="Copy patient link"
                className="inline-flex size-7 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-app hover:text-text-primary"
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                title={collapsed ? "Expand" : "Minimize"}
                className="inline-flex size-7 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-app hover:text-text-primary"
              >
                {collapsed ? (
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <Minimize2 className="size-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={end}
                disabled={ending}
                title="End call"
                className="inline-flex size-7 items-center justify-center rounded-control text-status-destructive transition-colors hover:bg-status-destructive/10 disabled:opacity-50"
              >
                {ending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <PhoneOff className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {collapsed ? (
            <p className="px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
              Call running.{" "}
              {hasWhatsapp
                ? "Patient link sent on WhatsApp."
                : "Copy the patient link to send it manually."}
            </p>
          ) : (
            <>
              <div ref={containerRef} className="min-h-0 flex-1 bg-black" />
              <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-hairline px-3 py-2">
                <span className="truncate text-[11px] text-text-muted">
                  {hasWhatsapp
                    ? "Patient link sent on WhatsApp — valid 2 hours."
                    : "No WhatsApp number — use Copy link to send manually."}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => copyLink(call.joinUrl)}
                >
                  <Copy className="size-3.5" />
                  Copy link
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
