"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Copy,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PanelRight,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  captureTelehealthFrameAction,
  endTelehealthSessionAction,
  resumeTelehealthSessionAction,
  startTelehealthSessionAction,
} from "@/lib/actions/telehealth";
import { cn } from "@/lib/utils";
import { TelehealthContextPanel } from "./telehealth-context-panel";
import type { TelehealthPatientContext } from "./telehealth-context";

type ActiveCall = {
  sessionId: string;
  roomId: string;
  doctorToken: string;
  doctorName: string;
  joinUrl: string;
};

/** What survives a refresh: no token, only enough to ask for a new one. */
type ResumeRecord = {
  sessionId: string;
  roomId: string;
  joinUrl: string;
  doctorName: string;
};

type Phase = "joining" | "waiting" | "connected" | "ended";

type PhotoType = "baseline" | "follow_up" | "post_treatment";

type CapturedFrame = { blob: Blob; url: string };

/** The subset of the prebuilt kit this component drives directly. */
type ZegoKit = {
  destroy: () => void;
  getRoomID?: () => string;
  localStream?: MediaStream;
  autoLeaveRoomWhenOnlySelfInRoom?: boolean;
};

const PHASE_COPY: Record<Phase, { label: string; className: string }> = {
  joining: {
    label: "Connecting…",
    className: "border-status-info/30 bg-status-info/10 text-status-info",
  },
  waiting: {
    label: "Waiting for patient…",
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
  },
  connected: {
    label: "Patient connected",
    className:
      "border-status-success/30 bg-status-success/10 text-status-success",
  },
  ended: {
    label: "Call ended",
    className: "border-hairline bg-app text-text-secondary",
  },
};

const PHOTO_TYPE_LABEL: Record<PhotoType, string> = {
  baseline: "Baseline",
  follow_up: "Follow-up",
  post_treatment: "Post-treatment",
};

const resumeKeyFor = (patientId: string) =>
  `clinicflow:telehealth:${patientId}`;

function snapshotLabel() {
  return `Telehealth frame ${new Date()
    .toISOString()
    .slice(0, 16)
    .replace("T", " ")}`;
}

function IconAction({
  label,
  onClick,
  disabled,
  tone = "muted",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "muted" | "danger" | "primary";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-control transition-colors disabled:opacity-50",
        tone === "muted" &&
          "text-text-secondary hover:bg-app hover:text-text-primary",
        tone === "primary" && "text-primary hover:bg-primary/10",
        tone === "danger" &&
          "text-status-destructive hover:bg-status-destructive/10",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The doctor's telehealth workspace, mounted in the active-patient header.
 *
 * Two shapes, one kit instance: `floating` keeps the video over the SOAP notes
 * (and can collapse to a thin bar), `expanded` becomes a full-screen
 * consultation surface with the patient's clinical context pinned alongside the
 * video. Starting a call mints a room token server-side; the patient link goes
 * out over WhatsApp and is always copied to the clipboard as a fallback.
 *
 * Everything the kit cannot do is done outside it: presence is inferred from
 * the kit's join/leave callbacks, and frames are composed from the live
 * `<video>` element and saved through a server action — never silently.
 */
export function TelehealthLauncher({
  patientId,
  whatsappNumber,
  canManage,
  context = null,
  activeVisitId = null,
}: {
  patientId: string;
  whatsappNumber: string | null;
  canManage: boolean;
  context?: TelehealthPatientContext | null;
  activeVisitId?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [phase, setPhase] = useState<Phase>("joining");
  const [patientPresent, setPatientPresent] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [resumable, setResumable] = useState<ResumeRecord | null>(null);
  const [capture, setCapture] = useState<CapturedFrame | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);
  const [tagDermPhoto, setTagDermPhoto] = useState(
    context?.dermPhotoTagging ?? false,
  );
  const [bodyRegion, setBodyRegion] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType>("baseline");
  const [lesionNotes, setLesionNotes] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const zgRef = useRef<ZegoKit | null>(null);
  const hasWhatsapp = (whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;
  const dermPhotoTagging = context?.dermPhotoTagging ?? false;

  const teardown = useCallback(() => {
    try {
      zgRef.current?.destroy();
    } catch {
      /* the kit may already be torn down */
    }
    zgRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  useEffect(() => {
    if (!capture) return;
    return () => URL.revokeObjectURL(capture.url);
  }, [capture]);

  // A refresh should offer the same room back, without ever storing a token.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(resumeKeyFor(patientId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as ResumeRecord;
      if (parsed?.sessionId && parsed.roomId) setResumable(parsed);
    } catch {
      /* a corrupt record is simply not resumable */
    }
  }, [patientId]);

  const persistResume = useCallback(
    (record: ResumeRecord) => {
      setResumable(record);
      try {
        window.sessionStorage.setItem(
          resumeKeyFor(patientId),
          JSON.stringify(record),
        );
      } catch {
        /* private mode without storage still works, just not resumable */
      }
    },
    [patientId],
  );

  const clearResume = useCallback(() => {
    setResumable(null);
    try {
      window.sessionStorage.removeItem(resumeKeyFor(patientId));
    } catch {
      /* nothing to clean */
    }
  }, [patientId]);

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  const beginJoin = useCallback(
    (next: ActiveCall) => {
      setCall(next);
      setPhase("joining");
      setPatientPresent(false);
      setCameraOn(true);
      setMicOn(true);
      setCollapsed(false);
      setExpanded(true);
      persistResume({
        sessionId: next.sessionId,
        roomId: next.roomId,
        joinUrl: next.joinUrl,
        doctorName: next.doctorName,
      });
    },
    [persistResume],
  );

  async function start() {
    if (pending) return;
    setPending(true);
    const result = await startTelehealthSessionAction(patientId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const next: ActiveCall = {
      sessionId: result.data.sessionId,
      roomId: result.data.roomId,
      doctorToken: result.data.doctorToken,
      doctorName: result.data.doctorName,
      joinUrl: result.data.joinUrl,
    };
    beginJoin(next);

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

  async function rejoin(record: ResumeRecord) {
    if (pending) return;
    setPending(true);
    const result = await resumeTelehealthSessionAction(record.sessionId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.message);
      clearResume();
      return;
    }
    teardown();
    beginJoin({
      sessionId: result.data.sessionId,
      roomId: result.data.roomId,
      doctorToken: result.data.doctorToken,
      doctorName: result.data.doctorName,
      joinUrl: result.data.joinUrl || record.joinUrl,
    });
  }

  // Mount the prebuilt kit once the container exists and a token is set.
  useEffect(() => {
    if (!call) return;
    let cancelled = false;
    (async () => {
      const element = containerRef.current;
      if (!element) return;
      const { ZegoUIKitPrebuilt } =
        await import("@zegocloud/zego-uikit-prebuilt");
      if (cancelled) return;
      const zp = ZegoUIKitPrebuilt.create(call.doctorToken);
      // A clinician often joins before the patient; without this the kit can
      // treat the empty room as "everyone left" and hang up.
      zp.autoLeaveRoomWhenOnlySelfInRoom = false;
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
        showRoomTimer: true,
        showLeaveRoomConfirmDialog: true,
        leaveRoomDialogConfig: {
          titleText: "End this consultation?",
          descriptionText:
            "The patient will be disconnected. You can rejoin from the record if it was a mistake.",
        },
        lowerLeftNotification: {
          showUserJoinAndLeave: true,
          showTextChat: false,
        },
        screenSharingConfig: {
          onError: () => {
            toast.error(
              "Screen sharing couldn't start on this device. Check the browser's screen-recording permission.",
            );
            return "";
          },
        },
        onJoinRoom: () => setPhase("waiting"),
        onUserJoin: () => {
          setPatientPresent(true);
          setPhase("connected");
        },
        onStreamUpdate: () => {
          setPatientPresent(true);
          setPhase("connected");
        },
        onUserLeave: () => {
          setPatientPresent(false);
          setPhase((current) => (current === "ended" ? current : "waiting"));
        },
        onLeaveRoom: () => setPhase("ended"),
        onYouRemovedFromRoom: () => {
          setPhase("ended");
          toast.error("You were removed from the room.");
        },
        onCameraStateUpdated: (state) => setCameraOn(state === "ON"),
        onMicrophoneStateUpdated: (state) => setMicOn(state === "ON"),
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
    setExpanded(false);
    setCollapsed(false);
    setSheetOpen(false);
    clearResume();
    if (!result.ok) toast.error(result.message);
    else toast.success("Call ended");
  }

  function closeEnded() {
    teardown();
    setCall(null);
    setExpanded(false);
    setCollapsed(false);
    setSheetOpen(false);
  }

  /**
   * Compose a still from the live video. The kit publishes no snapshot API, so
   * the frame is drawn from the remote `<video>` element (never the local
   * preview) and held for explicit confirmation before anything is saved.
   */
  function grabFrame() {
    const container = containerRef.current;
    if (!container) return;
    const local = zgRef.current?.localStream;
    const videos = Array.from(container.querySelectorAll("video"));
    const remote =
      videos.find((video) => {
        const source = video.srcObject;
        return (
          source instanceof MediaStream &&
          source !== local &&
          video.videoWidth > 0
        );
      }) ?? videos.find((video) => video.videoWidth > 0);
    if (!remote) {
      toast.error("No video frame to capture yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = remote.videoWidth;
    canvas.height = remote.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("This browser can't capture the consultation frame.");
      return;
    }
    ctx.drawImage(remote, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("The frame couldn't be prepared. Please try again.");
        return;
      }
      setCapture({ blob, url: URL.createObjectURL(blob) });
      setTagDermPhoto(dermPhotoTagging);
    }, "image/png");
  }

  async function saveCapture() {
    if (!capture || savingCapture) return;
    if (dermPhotoTagging && tagDermPhoto && !bodyRegion.trim()) {
      toast.error("Add the body region for this photo tag.");
      return;
    }
    setSavingCapture(true);
    const formData = new FormData();
    formData.set(
      "file",
      new File([capture.blob], "telehealth-frame.png", { type: "image/png" }),
    );
    formData.set("patientId", patientId);
    formData.set("documentName", snapshotLabel());
    formData.set(
      "tagDermPhoto",
      dermPhotoTagging && tagDermPhoto ? "true" : "false",
    );
    if (activeVisitId) formData.set("visitId", activeVisitId);
    if (bodyRegion.trim()) formData.set("bodyRegion", bodyRegion.trim());
    formData.set("photoType", photoType);
    if (lesionNotes.trim()) formData.set("lesionNotes", lesionNotes.trim());

    const result = await captureTelehealthFrameAction(formData);
    setSavingCapture(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(
      result.data.photoTagged
        ? "Frame saved and tagged to photos"
        : "Frame saved to documents",
      { description: result.data.photoMessage },
    );
    setCapture(null);
    setBodyRegion("");
    setLesionNotes("");
    setPhotoType("baseline");
    router.refresh();
  }

  if (!canManage) return null;

  const phaseCopy = PHASE_COPY[phase];

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
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
        {!call && resumable && (
          <button
            type="button"
            onClick={() => rejoin(resumable)}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border-[0.5px] border-status-warning/40 bg-status-warning/10 px-2.5 text-[12.5px] font-semibold text-status-warning transition-colors hover:bg-status-warning/20 disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Rejoin {resumable.doctorName}
          </button>
        )}
      </div>

      {call && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden border-[0.5px] border-hairline bg-surface shadow-dropdown",
            expanded
              ? "inset-0 rounded-none"
              : cn(
                  "bottom-4 right-4 rounded-control",
                  collapsed
                    ? "h-auto w-[280px]"
                    : "h-[520px] w-[min(92vw,860px)]",
                ),
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b-[0.5px] border-hairline px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Video
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-ink truncate text-[12.5px] font-bold">
                Telehealth · {call.doctorName}
              </span>
              <span
                className={cn(
                  "hidden shrink-0 items-center rounded-pill border-[0.5px] px-2 py-[2px] text-[10.5px] font-semibold sm:inline-flex",
                  phaseCopy.className,
                )}
              >
                {phaseCopy.label}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {phase !== "ended" && (
                <>
                  <span
                    title={micOn ? "Microphone on" : "Microphone off"}
                    className="hidden size-7 items-center justify-center text-text-secondary sm:inline-flex"
                  >
                    {micOn ? (
                      <Mic className="size-3.5" aria-hidden="true" />
                    ) : (
                      <MicOff
                        className="size-3.5 text-status-destructive"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    title={cameraOn ? "Camera on" : "Camera off"}
                    className="hidden size-7 items-center justify-center text-text-secondary sm:inline-flex"
                  >
                    {cameraOn ? (
                      <Video className="size-3.5" aria-hidden="true" />
                    ) : (
                      <VideoOff
                        className="size-3.5 text-status-destructive"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </>
              )}
              <IconAction
                label="Copy patient link"
                onClick={() => copyLink(call.joinUrl)}
              >
                <Copy className="size-3.5" aria-hidden="true" />
              </IconAction>
              <IconAction
                label={expanded ? "Back to floating panel" : "Expand workspace"}
                onClick={() => {
                  setExpanded((value) => !value);
                  setCollapsed(false);
                }}
              >
                {expanded ? (
                  <Minimize2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                )}
              </IconAction>
              {!expanded && (
                <IconAction
                  label={collapsed ? "Expand" : "Minimize"}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed ? (
                    <Maximize2 className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Minimize2 className="size-3.5" aria-hidden="true" />
                  )}
                </IconAction>
              )}
              <IconAction
                label="End call"
                tone="danger"
                onClick={end}
                disabled={ending}
              >
                {ending ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <PhoneOff className="size-3.5" aria-hidden="true" />
                )}
              </IconAction>
            </div>
          </div>

          {collapsed && !expanded ? (
            <p className="px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
              {phaseCopy.label}{" "}
              {hasWhatsapp
                ? "· Patient link sent on WhatsApp."
                : "· Copy the patient link to send it manually."}
            </p>
          ) : (
            <>
              <div className="flex min-h-0 flex-1">
                <div ref={containerRef} className="min-h-0 flex-1 bg-black" />
                {expanded && (
                  <aside className="hidden w-[360px] shrink-0 border-l-[0.5px] border-hairline lg:block">
                    <TelehealthContextPanel context={context} />
                  </aside>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-hairline px-3 py-2">
                <span className="min-w-0 truncate text-[11px] text-text-muted">
                  {phase === "waiting"
                    ? "Waiting for the patient to open the link."
                    : phase === "connected"
                      ? patientPresent
                        ? "Consultation in progress."
                        : "Patient reconnecting…"
                      : phase === "ended"
                        ? "The room closed. Rejoin or start a new call."
                        : hasWhatsapp
                          ? "Patient link sent on WhatsApp — valid 2 hours."
                          : "No WhatsApp number — use Copy link to send manually."}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {expanded && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="lg:hidden"
                      onClick={() => setSheetOpen(true)}
                    >
                      <PanelRight className="size-3.5" />
                      Context
                    </Button>
                  )}
                  {phase === "ended" ? (
                    <>
                      {resumable && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => rejoin(resumable)}
                          disabled={pending}
                        >
                          <RefreshCw className="size-3.5" />
                          Rejoin
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={closeEnded}
                      >
                        Close
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={grabFrame}
                        title="Capture a frame from the consultation"
                      >
                        <Camera className="size-3.5" />
                        Capture
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => copyLink(call.joinUrl)}
                      >
                        <Copy className="size-3.5" />
                        Copy link
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {call && expanded && sheetOpen && (
        <>
          <button
            type="button"
            aria-label="Close context panel"
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-[55] bg-black/40 lg:hidden"
          />
          <div className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[75vh] flex-col overflow-hidden rounded-t-card border-t-[0.5px] border-hairline bg-surface shadow-dropdown lg:hidden">
            <div className="flex items-center justify-between border-b-[0.5px] border-hairline px-4 py-2">
              <span className="text-ink text-[12.5px] font-bold">
                {context ? `${context.name}` : "Patient context"}
              </span>
              <IconAction label="Close" onClick={() => setSheetOpen(false)}>
                <X className="size-3.5" aria-hidden="true" />
              </IconAction>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TelehealthContextPanel context={context} />
            </div>
          </div>
        </>
      )}

      {capture && (
        <>
          <button
            type="button"
            aria-label="Discard captured frame"
            onClick={() => setCapture(null)}
            className="fixed inset-0 z-[70] bg-black/50"
          />
          <div className="fixed left-1/2 top-1/2 z-[75] flex max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border-[0.5px] border-hairline bg-surface shadow-dropdown">
            <div className="flex items-center justify-between border-b-[0.5px] border-hairline px-4 py-2.5">
              <span className="text-ink inline-flex items-center gap-1.5 text-[13px] font-bold">
                <Camera className="size-4 text-primary" aria-hidden="true" />
                Save consultation frame
              </span>
              <IconAction label="Discard" onClick={() => setCapture(null)}>
                <X className="size-3.5" aria-hidden="true" />
              </IconAction>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.url}
                alt="Captured consultation frame"
                className="w-full rounded-control border-[0.5px] border-hairline bg-black object-contain"
              />
              <p className="text-[11.5px] leading-relaxed text-text-secondary">
                Nothing is saved until you confirm. The frame is stored in this
                patient&apos;s documents.
              </p>

              {dermPhotoTagging && (
                <div className="space-y-2 rounded-control border-[0.5px] border-hairline bg-app p-3">
                  <label className="text-ink flex items-center gap-2 text-[12.5px] font-semibold">
                    <input
                      type="checkbox"
                      checked={tagDermPhoto}
                      onChange={(event) =>
                        setTagDermPhoto(event.target.checked)
                      }
                      className="size-3.5"
                    />
                    Also tag as a derm photo
                  </label>
                  {tagDermPhoto && (
                    <div className="space-y-2">
                      <input
                        value={bodyRegion}
                        onChange={(event) => setBodyRegion(event.target.value)}
                        placeholder="Body region (e.g. left forearm)"
                        maxLength={80}
                        className="text-ink h-8 w-full rounded-control border-[0.5px] border-hairline bg-surface px-2.5 text-[12.5px] placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      />
                      <select
                        value={photoType}
                        onChange={(event) =>
                          setPhotoType(event.target.value as PhotoType)
                        }
                        className="text-ink h-8 w-full rounded-control border-[0.5px] border-hairline bg-surface px-2.5 text-[12.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      >
                        {(Object.keys(PHOTO_TYPE_LABEL) as PhotoType[]).map(
                          (value) => (
                            <option key={value} value={value}>
                              {PHOTO_TYPE_LABEL[value]}
                            </option>
                          ),
                        )}
                      </select>
                      <textarea
                        value={lesionNotes}
                        onChange={(event) => setLesionNotes(event.target.value)}
                        placeholder="Lesion note (optional)"
                        maxLength={500}
                        rows={2}
                        className="text-ink w-full rounded-control border-[0.5px] border-hairline bg-surface px-2.5 py-1.5 text-[12.5px] placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-hairline px-4 py-2.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCapture(null)}
                disabled={savingCapture}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveCapture}
                disabled={savingCapture}
              >
                {savingCapture && (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Save frame
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
