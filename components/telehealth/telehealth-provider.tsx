"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Camera,
  Copy,
  Loader2,
  Maximize2,
  MessageSquare,
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
import { TelehealthChat } from "./telehealth-chat";
import { TelehealthContextPanel } from "./telehealth-context-panel";
import type { TelehealthPatientContext } from "./telehealth-context";

/**
 * One live consultation, owned above the page tree.
 *
 * The call is mounted by the app shell rather than by the patient record, which
 * is what keeps it alive while the clinician moves around: opening another tab,
 * writing the prescription, or navigating to the dashboard all change the route
 * below the provider without touching the ZEGO UIKit instance. The video
 * container therefore is never unmounted, only moved or hidden behind overlays.
 *
 * The same instance carries the conversation and the captured-frame flow, so
 * there is exactly one place where a call begins, ends or is rejoined.
 */

export type TelehealthResumeRecord = {
  sessionId: string;
  roomId: string;
  joinUrl: string;
  doctorName: string;
  patientId: string;
};

export type TelehealthStartArgs = {
  patientId: string;
  whatsappNumber: string | null;
  context: TelehealthPatientContext | null;
  activeVisitId: string | null;
};

type ActiveCall = TelehealthStartArgs & {
  sessionId: string;
  roomId: string;
  doctorToken: string;
  doctorName: string;
  joinUrl: string;
};

type TelehealthContextValue = {
  start: (args: TelehealthStartArgs) => Promise<void>;
  rejoin: (
    record: TelehealthResumeRecord,
    args: TelehealthStartArgs,
  ) => Promise<void>;
  pending: boolean;
  /** Patient whose call is live — lets the trigger show the right state. */
  activePatientId: string | null;
  active: boolean;
};

const TelehealthContext = createContext<TelehealthContextValue | null>(null);

/** Read the live call controls from anywhere inside the app shell. */
export function useTelehealth(): TelehealthContextValue {
  const value = useContext(TelehealthContext);
  if (!value) {
    throw new Error("useTelehealth must be used inside <TelehealthProvider>");
  }
  return value;
}

type Phase = "joining" | "waiting" | "connected" | "ended";
type PhotoType = "baseline" | "follow_up" | "post_treatment";
type CapturedFrame = { blob: Blob; url: string };
type PanelTab = "context" | "chat";

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

/** Floating-panel geometry, remembered per browser session. */
type Geometry = { x: number; y: number; w: number; h: number };
const GEOMETRY_KEY = "clinicflow:telehealth:geometry:v1";
/** Per-patient resume record — read back by the launcher to offer "Rejoin". */
const resumeKeyFor = (patientId: string) =>
  `clinicflow:telehealth:${patientId}`;
const MIN_W = 340;
const MIN_H = 260;
const MARGIN = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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

export function TelehealthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [phase, setPhase] = useState<Phase>("joining");
  const [patientPresent, setPatientPresent] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("context");
  const [chatOpen, setChatOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  const [capture, setCapture] = useState<CapturedFrame | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);
  const [tagDermPhoto, setTagDermPhoto] = useState(false);
  const [bodyRegion, setBodyRegion] = useState("");
  const [photoType, setPhotoType] = useState<PhotoType>("baseline");
  const [lesionNotes, setLesionNotes] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const zgRef = useRef<ZegoKit | null>(null);
  const geometryRef = useRef<Geometry | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
  } | null>(null);

  const dermPhotoTagging = call?.context?.dermPhotoTagging ?? false;
  const hasWhatsapp =
    (call?.whatsappNumber ?? "").replace(/[^\d]/g, "").length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Track viewport class: below `sm` the panel becomes a full-height sheet and
  // drag/resize is disabled, because a free-floating box on a phone is unusable.
  useEffect(() => {
    function measure() {
      setIsNarrow(window.innerWidth < 640);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Restore remembered geometry, clamped back into the current viewport.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(GEOMETRY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Geometry;
      if (
        typeof parsed?.w === "number" &&
        typeof parsed?.h === "number" &&
        typeof parsed?.x === "number" &&
        typeof parsed?.y === "number"
      ) {
        const next: Geometry = {
          w: clamp(parsed.w, MIN_W, window.innerWidth - MARGIN),
          h: clamp(parsed.h, MIN_H, window.innerHeight - MARGIN),
          x: clamp(parsed.x, MARGIN, window.innerWidth - MIN_W),
          y: clamp(parsed.y, MARGIN, window.innerHeight - MIN_H),
        };
        setGeometry(next);
        geometryRef.current = next;
      }
    } catch {
      /* a missing or corrupt record just means default placement */
    }
  }, []);

  const persistGeometry = useCallback((next: Geometry) => {
    geometryRef.current = next;
    try {
      window.sessionStorage.setItem(GEOMETRY_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the call still works, it just won't remember placement */
    }
  }, []);

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

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  const beginJoin = useCallback((next: ActiveCall) => {
    setCall(next);
    setPhase("joining");
    setPatientPresent(false);
    setCameraOn(true);
    setMicOn(true);
    setCollapsed(false);
    setExpanded(false);
    setChatOpen(false);
    setTab("context");
    // Persist across a reload: the panel lives in the shell, but the record
    // that knows *who* was being called only lives in the launcher's markup.
    try {
      window.sessionStorage.setItem(
        resumeKeyFor(next.patientId),
        JSON.stringify({
          sessionId: next.sessionId,
          roomId: next.roomId,
          joinUrl: next.joinUrl,
          doctorName: next.doctorName,
          patientId: next.patientId,
        }),
      );
    } catch {
      /* storage unavailable (private mode) — call still works, just not resumable */
    }
  }, []);

  const start = useCallback(
    async (args: TelehealthStartArgs) => {
      if (pending) return;
      setPending(true);
      const result = await startTelehealthSessionAction(args.patientId, {
        visitId: args.activeVisitId,
      });
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      beginJoin({
        ...args,
        sessionId: result.data.sessionId,
        roomId: result.data.roomId,
        doctorToken: result.data.doctorToken,
        doctorName: result.data.doctorName,
        joinUrl: result.data.joinUrl,
      });

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
    },
    [pending, beginJoin, copyLink],
  );

  const rejoin = useCallback(
    async (record: TelehealthResumeRecord, args: TelehealthStartArgs) => {
      if (pending) return;
      setPending(true);
      const result = await resumeTelehealthSessionAction(record.sessionId);
      setPending(false);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      teardown();
      beginJoin({
        ...args,
        sessionId: result.data.sessionId,
        roomId: result.data.roomId,
        doctorToken: result.data.doctorToken,
        doctorName: result.data.doctorName,
        joinUrl: result.data.joinUrl || record.joinUrl,
      });
    },
    [pending, teardown, beginJoin],
  );

  // Mount the prebuilt kit once a token exists. This runs only on a new call,
  // never on layout changes — which is what makes the call outlive navigation.
  useEffect(() => {
    if (!call?.doctorToken) return;
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
  }, [call?.doctorToken, call?.sessionId]);

  const closePanel = useCallback(() => {
    teardown();
    if (call?.patientId) {
      try {
        window.sessionStorage.removeItem(resumeKeyFor(call.patientId));
      } catch {
        /* ignore */
      }
    }
    setCall(null);
    setExpanded(false);
    setCollapsed(false);
    setSheetOpen(false);
    setChatOpen(false);
  }, [teardown, call?.patientId]);

  const end = useCallback(async () => {
    if (!call || ending) return;
    setEnding(true);
    teardown();
    const result = await endTelehealthSessionAction(call.sessionId);
    setEnding(false);
    closePanel();
    if (!result.ok) toast.error(result.message);
    else toast.success("Call ended");
  }, [call, ending, teardown, closePanel]);

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
    if (!capture || savingCapture || !call) return;
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
    formData.set("patientId", call.patientId);
    formData.set("documentName", snapshotLabel());
    formData.set(
      "tagDermPhoto",
      dermPhotoTagging && tagDermPhoto ? "true" : "false",
    );
    if (call.activeVisitId) formData.set("visitId", call.activeVisitId);
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

  // ---- Floating panel drag & resize -------------------------------------

  function onDragPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isNarrow || !geometry) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: geometry.x,
      originY: geometry.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDragPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !geometry) return;
    const next: Geometry = {
      ...geometry,
      x: clamp(
        drag.originX + (event.clientX - drag.startX),
        MARGIN - geometry.w + 96,
        window.innerWidth - 96,
      ),
      y: clamp(
        drag.originY + (event.clientY - drag.startY),
        0,
        window.innerHeight - 44,
      ),
    };
    setGeometry(next);
  }

  function onDragPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (geometryRef.current) persistGeometry(geometryRef.current);
    else if (geometry) persistGeometry(geometry);
  }

  function onResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isNarrow || !geometry) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originW: geometry.w,
      originH: geometry.h,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !geometry) return;
    const next: Geometry = {
      ...geometry,
      w: clamp(
        resize.originW + (event.clientX - resize.startX),
        MIN_W,
        window.innerWidth - geometry.x - MARGIN,
      ),
      h: clamp(
        resize.originH + (event.clientY - resize.startY),
        MIN_H,
        window.innerHeight - geometry.y - MARGIN,
      ),
    };
    setGeometry(next);
  }

  function onResizePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (geometryRef.current) persistGeometry(geometryRef.current);
    else if (geometry) persistGeometry(geometry);
  }

  // Keep the ref in step so pointer-up can persist the latest value.
  useEffect(() => {
    if (geometry) geometryRef.current = geometry;
  }, [geometry]);

  const value = useMemo<TelehealthContextValue>(
    () => ({
      start,
      rejoin,
      pending,
      activePatientId: call?.patientId ?? null,
      active: call !== null,
    }),
    [start, rejoin, pending, call],
  );

  const floating = !expanded && !isNarrow;
  const resolvedGeometry = floating ? (geometry ?? null) : null;
  const phaseCopy = PHASE_COPY[phase];

  return (
    <TelehealthContext.Provider value={value}>
      {children}
      {mounted && call
        ? createPortal(
            <>
              <div
                className={cn(
                  "fixed z-50 flex flex-col overflow-hidden border-[0.5px] border-hairline bg-surface shadow-dropdown",
                  expanded
                    ? "inset-0 rounded-none"
                    : floating && resolvedGeometry
                      ? "rounded-control"
                      : cn(
                          "inset-x-0 bottom-0 top-auto rounded-t-card border-b-0",
                          collapsed ? "h-auto" : "h-[70vh]",
                        ),
                )}
                style={
                  floating && resolvedGeometry
                    ? {
                        left: resolvedGeometry.x,
                        top: resolvedGeometry.y,
                        width: resolvedGeometry.w,
                        height: collapsed ? undefined : resolvedGeometry.h,
                      }
                    : undefined
                }
              >
                <div
                  onPointerDown={onDragPointerDown}
                  onPointerMove={onDragPointerMove}
                  onPointerUp={onDragPointerUp}
                  onPointerCancel={onDragPointerUp}
                  className={cn(
                    "flex items-center justify-between gap-2 border-b-[0.5px] border-hairline px-3 py-2",
                    floating && !collapsed && "cursor-move touch-none",
                  )}
                >
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
                      label="Patient chat"
                      tone={chatOpen ? "primary" : "muted"}
                      onClick={() => {
                        setChatOpen((open) => !open);
                        setExpanded(false);
                      }}
                    >
                      <MessageSquare className="size-3.5" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label="Copy patient link"
                      onClick={() => copyLink(call.joinUrl)}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </IconAction>
                    <IconAction
                      label={
                        expanded ? "Back to floating panel" : "Expand workspace"
                      }
                      onClick={() => {
                        setExpanded((open) => !open);
                        setCollapsed(false);
                        setChatOpen(false);
                      }}
                    >
                      {expanded ? (
                        <Minimize2 className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Maximize2 className="size-3.5" aria-hidden="true" />
                      )}
                    </IconAction>
                    {!expanded && !isNarrow && (
                      <IconAction
                        label={collapsed ? "Expand" : "Minimize"}
                        onClick={() => setCollapsed((open) => !open)}
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
                      onClick={() => void end()}
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

                {collapsed && floating ? (
                  <p className="px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
                    {phaseCopy.label}{" "}
                    {hasWhatsapp
                      ? "· Patient link sent on WhatsApp."
                      : "· Copy the patient link to send it manually."}
                  </p>
                ) : (
                  <>
                    <div className="flex min-h-0 flex-1">
                      <div className="relative min-h-0 flex-1 bg-black">
                        {/* Never unmounted: overlays cover it instead. */}
                        <div
                          ref={containerRef}
                          className="absolute inset-0"
                          data-room={call.roomId}
                        />
                        {chatOpen && !expanded && (
                          <div className="absolute inset-0 z-10 flex flex-col bg-surface">
                            <div className="flex items-center justify-between border-b-[0.5px] border-hairline px-3 py-1.5">
                              <span className="text-ink text-[12px] font-bold">
                                In-call chat
                              </span>
                              <IconAction
                                label="Back to video"
                                onClick={() => setChatOpen(false)}
                              >
                                <X className="size-3.5" aria-hidden="true" />
                              </IconAction>
                            </div>
                            <TelehealthChat
                              mode="doctor"
                              sessionId={call.sessionId}
                              patientName={call.context?.name ?? null}
                            />
                          </div>
                        )}
                      </div>
                      {expanded && (
                        <aside className="hidden w-[360px] shrink-0 flex-col border-l-[0.5px] border-hairline lg:flex">
                          <div className="flex shrink-0 border-b-[0.5px] border-hairline">
                            {(["context", "chat"] as PanelTab[]).map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                className={cn(
                                  "flex-1 px-3 py-2 text-[12px] font-semibold transition-colors",
                                  tab === key
                                    ? "text-primary"
                                    : "text-text-secondary hover:text-text-primary",
                                )}
                              >
                                {key === "context" ? "Context" : "Chat"}
                              </button>
                            ))}
                          </div>
                          <div className="flex min-h-0 flex-1 flex-col">
                            {tab === "context" ? (
                              <TelehealthContextPanel context={call.context} />
                            ) : (
                              <TelehealthChat
                                mode="doctor"
                                sessionId={call.sessionId}
                                patientName={call.context?.name ?? null}
                              />
                            )}
                          </div>
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
                        {expanded && !isNarrow && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="lg:hidden"
                            onClick={() => {
                              setSheetOpen(true);
                              setChatOpen(false);
                            }}
                          >
                            <PanelRight className="size-3.5" />
                            Panel
                          </Button>
                        )}
                        {phase === "ended" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={closePanel}
                          >
                            Close
                          </Button>
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

                {floating && !collapsed && resolvedGeometry && (
                  <div
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                    onPointerCancel={onResizePointerUp}
                    role="separator"
                    aria-label="Resize video panel"
                    className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none"
                  >
                    <span className="absolute bottom-1 right-1 size-2 border-b-2 border-r-2 border-text-muted" />
                  </div>
                )}
              </div>

              {expanded && sheetOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close side panel"
                    onClick={() => setSheetOpen(false)}
                    className="fixed inset-0 z-[55] bg-black/40 lg:hidden"
                  />
                  <div className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[75vh] flex-col overflow-hidden rounded-t-card border-t-[0.5px] border-hairline bg-surface shadow-dropdown lg:hidden">
                    <div className="flex items-center justify-between border-b-[0.5px] border-hairline px-4 py-2">
                      <div className="flex gap-1">
                        {(["context", "chat"] as PanelTab[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={cn(
                              "rounded-control px-2.5 py-1 text-[12px] font-semibold transition-colors",
                              tab === key
                                ? "bg-primary/10 text-primary"
                                : "text-text-secondary",
                            )}
                          >
                            {key === "context" ? "Context" : "Chat"}
                          </button>
                        ))}
                      </div>
                      <IconAction
                        label="Close"
                        onClick={() => setSheetOpen(false)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </IconAction>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                      {tab === "context" ? (
                        <TelehealthContextPanel context={call.context} />
                      ) : (
                        <TelehealthChat
                          mode="doctor"
                          sessionId={call.sessionId}
                          patientName={call.context?.name ?? null}
                        />
                      )}
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
                        <Camera
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        Save consultation frame
                      </span>
                      <IconAction
                        label="Discard"
                        onClick={() => setCapture(null)}
                      >
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
                        Nothing is saved until you confirm. The frame is stored
                        in this patient&apos;s documents.
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
                                onChange={(event) =>
                                  setBodyRegion(event.target.value)
                                }
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
                                {(
                                  Object.keys(PHOTO_TYPE_LABEL) as PhotoType[]
                                ).map((option) => (
                                  <option key={option} value={option}>
                                    {PHOTO_TYPE_LABEL[option]}
                                  </option>
                                ))}
                              </select>
                              <textarea
                                value={lesionNotes}
                                onChange={(event) =>
                                  setLesionNotes(event.target.value)
                                }
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
                        onClick={() => void saveCapture()}
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

              {phase === "ended" && (
                <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-control border-[0.5px] border-hairline bg-surface px-3 py-2 shadow-dropdown">
                  <RefreshCw
                    className="size-3.5 text-status-warning"
                    aria-hidden="true"
                  />
                  <span className="text-[12px] text-text-secondary">
                    Rejoin from the patient record to continue.
                  </span>
                </div>
              )}
            </>,
            document.body,
          )
        : null}
    </TelehealthContext.Provider>
  );
}
