"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2, Paperclip, Send, X } from "lucide-react";

import {
  fetchPatientTelehealthMessagesAction,
  fetchTelehealthMessagesAction,
  getPatientTelehealthAttachmentUrlAction,
  getTelehealthAttachmentUrlAction,
  sendPatientTelehealthMessageAction,
  sendTelehealthMessageAction,
  type TelehealthMessageView,
} from "@/lib/actions/telehealth-chat";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from "@/lib/file-signature";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Safety-net cadence. Real-time does the fast path for the clinic side. */
const DOCTOR_POLL_MS = 8000;
/** The patient side has no realtime client — polling is the mechanism. */
const PATIENT_POLL_MS = 4000;
const MAX_BODY_CHARS = 4000;

type DoctorChatProps = {
  mode: "doctor";
  sessionId: string;
  patientName: string | null;
};

type PatientChatProps = {
  mode: "patient";
  roomId: string;
  token: string;
  patientName: string | null;
};

type TelehealthChatProps = DoctorChatProps | PatientChatProps;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The in-call conversation, shared by both sides of it.
 *
 * The two sides differ only in how they are authorised — the clinic side by
 * session, the patient side by room id plus link token — so the whole difference
 * is captured in the two action sets and a `mine` predicate. Everything else
 * (bubbles, attachments, scrolled-to-bottom behaviour, the composer) is one
 * implementation, which keeps the two views from drifting apart.
 *
 * The clinic side subscribes to the `telehealth_messages` row stream and also
 * polls as a safety net; the patient side polls only, because it has no session
 * of its own to subscribe with.
 */
export function TelehealthChat(props: TelehealthChatProps) {
  const { patientName } = props;
  const isDoctor = props.mode === "doctor";

  const [messages, setMessages] = useState<TelehealthMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomOpen, setRoomOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const atBottomRef = useRef(true);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result =
        props.mode === "doctor"
          ? await fetchTelehealthMessagesAction(props.sessionId)
          : await fetchPatientTelehealthMessagesAction(
              props.roomId,
              props.token,
            );
      if (!result.ok) {
        // A closed room is the normal end state, not an error worth shouting.
        if (/ended|no longer valid/i.test(result.message)) {
          setRoomOpen(false);
        } else {
          console.error("[TelehealthChat] load failed", result.message);
        }
        return;
      }
      setMessages(result.data.messages);
      setRoomOpen(result.data.roomOpen);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [props]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll. Also acts as the recovery path when a message is sent but its
  // broadcast is missed.
  useEffect(() => {
    const interval = window.setInterval(
      () => void load(),
      isDoctor ? DOCTOR_POLL_MS : PATIENT_POLL_MS,
    );
    return () => window.clearInterval(interval);
  }, [load, isDoctor]);

  // Real-time append for the clinic side. Subscriptions are keyed on the row,
  // so RLS still decides whether the event is delivered.
  useEffect(() => {
    if (props.mode !== "doctor") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`telehealth-chat-${props.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "telehealth_messages",
          filter: `session_id=eq.${props.sessionId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [props, load]);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  // Only chase the newest message when the reader is already at the bottom.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    atBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 48;
  }

  async function openAttachment(message: TelehealthMessageView) {
    if (!message.attachment) return;
    const result =
      props.mode === "doctor"
        ? await getTelehealthAttachmentUrlAction(message.id)
        : await getPatientTelehealthAttachmentUrlAction(
            props.roomId,
            props.token,
            message.id,
          );
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!chosen) return;
    if (chosen.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `That file is ${(chosen.size / 1_048_576).toFixed(1)} MB. The limit is 10 MB.`,
      );
      return;
    }
    setFile(chosen);
  }

  async function send() {
    const body = draft.trim();
    if (sending || (!body && !file)) return;
    setSending(true);
    const formData = new FormData();
    if (body) formData.set("body", body);
    if (file) formData.set("file", file);
    if (props.mode === "doctor") {
      formData.set("sessionId", props.sessionId);
    } else {
      formData.set("roomId", props.roomId);
      formData.set("token", props.token);
    }

    const result =
      props.mode === "doctor"
        ? await sendTelehealthMessageAction(formData)
        : await sendPatientTelehealthMessageAction(formData);

    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setDraft("");
    setFile(null);
    atBottomRef.current = true;
    setMessages((current) => [...current, result.data]);
  }

  const mine = useCallback(
    (message: TelehealthMessageView) =>
      isDoctor
        ? message.senderType !== "patient"
        : message.senderType === "patient",
    [isDoctor],
  );

  const empty = useMemo(
    () => !loading && messages.length === 0,
    [loading, messages.length],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex items-center justify-between gap-2 border-b-[0.5px] border-hairline px-3 py-2">
        <span className="text-ink truncate text-[12px] font-bold">
          {isDoctor
            ? patientName
              ? `Chat · ${patientName}`
              : "Chat"
            : "Chat with your clinic"}
        </span>
        {!roomOpen && (
          <span className="shrink-0 rounded-pill border-[0.5px] border-hairline bg-app px-2 py-[2px] text-[10.5px] font-semibold text-text-secondary">
            Closed
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {loading && messages.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-6 text-[12px] text-text-secondary">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Loading conversation…
          </p>
        ) : empty ? (
          <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-text-muted">
            {isDoctor
              ? "Share reports, images or instructions — the patient sees them here instantly."
              : "Send a message, photo or report to your clinician."}
          </p>
        ) : (
          messages.map((message) => {
            const own = mine(message);
            return (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col",
                  own ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-card border-[0.5px] px-2.5 py-2 text-[12.5px] leading-relaxed",
                    own
                      ? "text-ink border-primary/30 bg-primary/10"
                      : "border-hairline bg-app text-text-primary",
                  )}
                >
                  {!own && (
                    <p className="mb-0.5 text-[10.5px] font-semibold text-text-muted">
                      {message.senderName}
                    </p>
                  )}
                  {message.body && (
                    <p className="whitespace-pre-wrap break-words">
                      {message.body}
                    </p>
                  )}
                  {message.attachment && (
                    <button
                      type="button"
                      onClick={() => openAttachment(message)}
                      className={cn(
                        "mt-1.5 flex w-full items-center gap-2 rounded-control border-[0.5px] border-hairline bg-surface px-2 py-1.5 text-left transition-colors hover:bg-app",
                        message.body && "mt-2",
                      )}
                      title={`Open ${message.attachment.name}`}
                    >
                      {message.attachment.mimeType.startsWith("image/") ? (
                        message.attachment.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={message.attachment.url}
                            alt={message.attachment.name}
                            className="size-10 shrink-0 rounded-control border-[0.5px] border-hairline object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-control border-[0.5px] border-hairline bg-app text-text-muted">
                            <FileText className="size-4" aria-hidden="true" />
                          </span>
                        )
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-control border-[0.5px] border-hairline bg-app text-text-secondary">
                          <FileText className="size-4" aria-hidden="true" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block truncate text-[12px] font-semibold">
                          {message.attachment.name}
                        </span>
                        <span className="block text-[10.5px] text-text-muted">
                          {formatBytes(message.attachment.sizeBytes)}
                        </span>
                      </span>
                      <Download
                        className="size-3.5 shrink-0 text-text-secondary"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
                <span className="mt-0.5 text-[10px] text-text-muted">
                  {formatTime(message.createdAt)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t-[0.5px] border-hairline px-3 py-2.5">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-control border-[0.5px] border-hairline bg-app px-2 py-1.5">
            <Paperclip
              className="size-3.5 shrink-0 text-text-secondary"
              aria-hidden="true"
            />
            <span className="text-ink min-w-0 flex-1 truncate text-[12px]">
              {file.name}
            </span>
            <span className="shrink-0 text-[10.5px] text-text-muted">
              {formatBytes(file.size)}
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove attachment"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT_ATTRIBUTE}
            onChange={pickFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!roomOpen || sending}
            aria-label="Attach a file"
            title="Attach a PDF or image"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control border-[0.5px] border-hairline text-text-secondary transition-colors hover:bg-app hover:text-text-primary disabled:opacity-50"
          >
            <Paperclip className="size-4" aria-hidden="true" />
          </button>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={MAX_BODY_CHARS}
            disabled={!roomOpen || sending}
            placeholder={roomOpen ? "Message…" : "This consultation has ended"}
            className="text-ink max-h-28 min-h-8 flex-1 resize-y rounded-control border-[0.5px] border-hairline bg-surface px-2.5 py-1.5 text-[12.5px] placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!roomOpen || sending || (!draft.trim() && !file)}
            aria-label="Send message"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
