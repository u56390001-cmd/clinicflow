"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type WidgetProps = {
  slug: string;
  clinicName: string;
  widgetColor: string;
  widgetPosition: string;
  avatarUrl: string | null;
  headerSubtitle: string | null;
  agentName: string;
  welcomeMessage: string | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  /** Display text — a short deterministic caption when a component is present,
   *  or the model's full reply when no component. Shown in the chat bubble.
   *  Empty string means no bubble is rendered (e.g. confirmation card only). */
  text: string;
  /** Full model reply — always stored for sending back to the API as history,
   *  even when `text` is a shorter caption. For user messages this is the same
   *  as `text`. */
  reply: string;
  /** Structured UI component sourced directly from tool-call results.
   *  Rendered as dedicated UI elements, independent of the text bubble. */
  component?: {
    type: "serviceList" | "slotList" | "confirmation";
    data: unknown;
  };
  /** Hidden messages are only for API history (session context injection),
   *  not rendered visually in the chat UI. */
  hidden?: boolean;
};

type WidgetServiceItem = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
};

type WidgetSlotItem = {
  startTime: string;
  endTime: string;
};

type WidgetBookingData = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  serviceName?: string;
};

type ChatResponse =
  | {
      ok: true;
      reply: string;
      outcome: string;
      bookingAttempted: boolean;
      caption?: string;
      component?: {
        type: "serviceList" | "slotList" | "confirmation";
        data: unknown;
      };
      sessionContext?: string;
    }
  | { ok: false; error: string };

function lightenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * factor);
  const lg = Math.round(g + (255 - g) * factor);
  const lb = Math.round(b + (255 - b) * factor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function darkenHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - factor));
  const dg = Math.round(g * (1 - factor));
  const db = Math.round(b * (1 - factor));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

/**
 * Strip residual markdown formatting from model output. The system prompt
 * instructs the model to use plain text only, but this is a safety net for
 * cases where the model still produces asterisks, hash headers or bullet
 * symbols. Keeps the text readable in a chat bubble.
 */
function stripMarkdown(text: string): string {
  let result = text;
  // **bold** or __bold__
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");
  // *italic* or _italic_  (single, but not inside **)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "$1");
  // # Heading -> Heading
  result = result.replace(/^#{1,6}\s+/gm, "");
  // - bullet or * bullet -> • bullet
  result = result.replace(/^\s*[-*]\s+/gm, "• ");
  // Inline code
  result = result.replace(/`([^`]+)`/g, "$1");
  return result;
}

function formatSlotTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatSlotDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatPrice(price: number): string {
  return price === 0 ? "Free" : `$${price.toFixed(2)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getDaysFromNow(count: number): Array<{ label: string; shortLabel: string; dateStr: string; dayOfWeek: string }> {
  const days: Array<{ label: string; shortLabel: string; dateStr: string; dayOfWeek: string }> = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    const dayOfWeek = d.toLocaleDateString([], { weekday: "short" });
    const shortLabel = d.toLocaleDateString([], { day: "numeric", month: "short" });
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${dayOfWeek}, ${shortLabel}`;
    days.push({ label, shortLabel, dateStr, dayOfWeek });
  }
  return days;
}

export function WidgetChat(props: WidgetProps) {
  const {
    slug,
    clinicName,
    widgetColor,
    widgetPosition,
    avatarUrl,
    headerSubtitle,
    agentName,
    welcomeMessage,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const serviceChosenRef = useRef(false);
  const slotChosenRef = useRef(false);
  const dateScrollRef = useRef<HTMLDivElement>(null);

  const accentDark = darkenHex(widgetColor, 0.15);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, typing]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) setError(null);
      return !prev;
    });
  }, []);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;

      setPending(true);
      setError(null);
      setTyping(true);

      // Build the user message for local state (uses `text` field)
      const userMsg: ChatMessage = { role: "user", text: trimmed, reply: trimmed };
      // Build the history for the API request: use the full `reply` for
      // assistant messages so the model retains full context (not just the
      // short display caption). This is critical for function-calling flow.
      const apiHistory = [
        ...messages.map((m) => ({ role: m.role, content: m.reply })),
        { role: "user" as const, content: trimmed },
      ];
      setMessages([...messages, userMsg]);

      try {
        const response = await fetch("/api/widget/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            sessionId: sessionIdRef.current,
            messages: apiHistory,
          }),
        });

        setTyping(false);

        const data: ChatResponse = await response.json();
        if (!response.ok || !data.ok) {
          const msg =
            "error" in data && data.error
              ? data.error
              : "The assistant couldn't reply. Please try again.";
          setError(msg);
          if (response.status === 429) {
            setMessages((current) => current.slice(0, -1));
          }
          return;
        }

        // Deduplication: strip components the user has already interacted with.
        // The model often re-calls getServices/getAvailability on later turns
        // (redundantly), which populates data.component. We must prevent those
        // stale components from re-rendering — the user already picked.
        let componentToShow = data.component;
        if (serviceChosenRef.current && componentToShow?.type === "serviceList") {
          componentToShow = undefined;
        }
        if (slotChosenRef.current && componentToShow?.type === "slotList") {
          componentToShow = undefined;
        }
        // Update refs AFTER deduplication check so first-time components are flagged
        if (data.component?.type === "serviceList" && !serviceChosenRef.current) {
          serviceChosenRef.current = true;
        }
        if (data.component?.type === "slotList" && !slotChosenRef.current) {
          slotChosenRef.current = true;
        }

        // Architectural split: text is a short deterministic caption when a
        // component is present, or the model's full reply when no component.
        // `reply` always stores the full model response for API history.
        // For confirmation cards, no text bubble — the card speaks for itself.
        const hasComponent = !!componentToShow;
        const isConfirmation = componentToShow?.type === "confirmation";
        const assistantMsg: ChatMessage = {
          role: "assistant",
          text: isConfirmation ? "" : hasComponent && data.caption ? data.caption : data.reply,
          reply: data.reply,
          component: componentToShow,
        };
        setMessages((current) => {
          const updated = [...current, assistantMsg];
          // Inject session context after a booking so the AI can reference
          // the appointment in subsequent turns (reschedule/cancel).
          // These messages are hidden from the user — they only exist in the
          // conversation history sent to the API.
          if (data.sessionContext) {
            updated.push({ role: "user", text: data.sessionContext, reply: data.sessionContext, hidden: true });
            updated.push({ role: "assistant", text: "", reply: "Understood. I have noted the appointment details.", hidden: true });
          }
          return updated;
        });
      } catch {
        setTyping(false);
        setError("Network error — check your connection and try again.");
      } finally {
        setPending(false);
      }
    },
    [messages, pending, slug],
  );

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    void send(input);
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
      setInput("");
    }
  }

  const isPositionLeft = widgetPosition === "bottom-left";
  const greeting = welcomeMessage || `Hi! I'm ${agentName}, the AI assistant for ${clinicName}. How can I help you today?`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483647,
        fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {/* ── Chat Panel ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Chat with ${agentName}`}
          style={{
            position: "absolute",
            bottom: "90px",
            ...(isPositionLeft ? { left: "16px" } : { right: "16px" }),
            width: "min(400px, calc(100vw - 32px))",
            height: "min(580px, calc(100vh - 120px))",
            display: "flex",
            flexDirection: "column",
            borderRadius: "16px",
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.1)",
            border: "1px solid rgba(0,0,0,0.08)",
            background: "#ffffff",
            pointerEvents: "auto",
            animation: "widget-slide-up 0.25s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              background: widgetColor,
              color: "#ffffff",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "15px", lineHeight: 1.3 }}>
                {agentName}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.85,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {headerSubtitle || clinicName}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  marginTop: "3px",
                }}
                role="status"
                aria-label="AI assistant status: online"
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#4ADE80",
                    boxShadow: "0 0 4px rgba(74,222,128,0.5)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: "11px", opacity: 0.9 }}>Online</span>
              </div>
            </div>
            <button
              onClick={toggle}
              aria-label="Close chat"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#ffffff",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
            aria-live="polite"
          >
            {messages.length === 0 && !pending && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.5 }}>
                  {greeting}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {["What services do you offer?", "I'd like to book an appointment", "Browse available dates"].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => {
                          if (s === "Browse available dates") {
                            setShowDatePicker(true);
                          } else {
                            void send(s);
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.85);
                          e.currentTarget.style.borderColor = widgetColor;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.95);
                          e.currentTarget.style.borderColor = lightenHex(widgetColor, 0.6);
                        }}
                        style={{
                          fontSize: "13px",
                          padding: "6px 12px",
                          borderRadius: "999px",
                          border: `1px solid ${lightenHex(widgetColor, 0.6)}`,
                          background: lightenHex(widgetColor, 0.95),
                          color: widgetColor,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          transition: "background 0.15s ease, border-color 0.15s ease",
                        }}
                      >
                        {s}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            {messages.filter((msg) => !msg.hidden).map((msg, i) => (
              <div key={i}>
                {msg.text ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      whiteSpace: "pre-wrap",
                      borderRadius:
                        msg.role === "user"
                          ? "16px 16px 4px 16px"
                          : "16px 16px 16px 4px",
                      padding: "10px 14px",
                      fontSize: "14px",
                      lineHeight: 1.5,
                      ...(msg.role === "user"
                        ? { background: widgetColor, color: "#ffffff" }
                        : {
                            border: "1px solid #E5E7EB",
                            background: "#F9FAFB",
                            color: "#111827",
                          }),
                    }}
                  >
                    {stripMarkdown(msg.text)}
                  </div>
                </div>
                ) : null}

                {/* Slot cards — sourced from component, not text */}
                {msg.component?.type === "slotList" && (msg.component.data as WidgetSlotItem[]).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "8px",
                      marginTop: "8px",
                      paddingLeft: msg.role === "user" ? "0" : "4px",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    {(msg.component.data as WidgetSlotItem[]).map((slot, j) => (
                      <button
                        key={j}
                        onClick={() => {
                          slotChosenRef.current = true;
                          void send(`I'd like the ${formatSlotTime(slot.startTime)} slot`);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.95);
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#ffffff";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                        style={{
                          fontSize: "13px",
                          padding: "8px 14px",
                          borderRadius: "10px",
                          border: `1.5px solid ${widgetColor}`,
                          background: "#ffffff",
                          color: widgetColor,
                          cursor: "pointer",
                          textAlign: "center",
                          lineHeight: 1.4,
                          minWidth: "100px",
                          transition: "background 0.15s ease, box-shadow 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{formatSlotTime(slot.startTime)}</div>
                        {slot.startTime !== slot.endTime && (
                          <div style={{ fontSize: "11px", opacity: 0.7 }}>
                            to {formatSlotTime(slot.endTime)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Service cards — sourced from component, not text */}
                {msg.component?.type === "serviceList" && (msg.component.data as WidgetServiceItem[]).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      marginTop: "8px",
                      paddingLeft: msg.role === "user" ? "0" : "4px",
                      maxWidth: "85%",
                    }}
                  >
                    {(msg.component.data as WidgetServiceItem[]).map((svc) => (
                      <button
                        key={svc.id}
                        onClick={() => {
                          serviceChosenRef.current = true;
                          void send(`I'd like to book "${svc.name}"`);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = widgetColor;
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.97);
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = lightenHex(widgetColor, 0.4);
                          e.currentTarget.style.background = "#ffffff";
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: `1.5px solid ${lightenHex(widgetColor, 0.4)}`,
                          background: "#ffffff",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                          transition: "border-color 0.15s ease, background 0.15s ease",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              color: "#111827",
                              lineHeight: 1.3,
                            }}
                          >
                            {svc.name}
                          </div>
                          {svc.description && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#6B7280",
                                lineHeight: 1.3,
                                marginTop: "2px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {svc.description}
                            </div>
                          )}
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#9CA3AF",
                              marginTop: "3px",
                            }}
                          >
                            {formatDuration(svc.durationMinutes)}
                          </div>
                        </div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "14px",
                            color: widgetColor,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {formatPrice(svc.price)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Booking confirmation card — sourced from component, not text */}
                {msg.component?.type === "confirmation" && (() => {
                  const booking = msg.component.data as WidgetBookingData;
                  return (
                  <div
                    style={{
                      marginTop: "8px",
                      padding: "14px",
                      borderRadius: "12px",
                      border: `2px solid ${lightenHex(widgetColor, 0.5)}`,
                      background: lightenHex(widgetColor, 0.96),
                      marginLeft: msg.role === "user" ? "0" : "4px",
                      maxWidth: msg.role === "user" ? "85%" : "85%",
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={widgetColor}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <path d="m9 11 3 3L22 4" />
                      </svg>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: accentDark,
                        }}
                      >
                        Appointment Confirmed
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.6 }}>
                      <div>
                        <strong>Date:</strong> {formatSlotDate(booking.startTime)}
                      </div>
                      <div>
                        <strong>Time:</strong> {formatSlotTime(booking.startTime)} –{" "}
                        {formatSlotTime(booking.endTime)}
                      </div>
                      {booking.serviceName && (
                        <div>
                          <strong>Service:</strong> {booking.serviceName}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })()}
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    borderRadius: "16px 16px 16px 4px",
                    padding: "10px 14px",
                    border: "1px solid #E5E7EB",
                    background: "#F9FAFB",
                    fontSize: "14px",
                    color: "#6B7280",
                  }}
                >
                  <span className="widget-dot-pulse">
                    <span style={{ animationDelay: "0s" }} />
                    <span style={{ animationDelay: "0.15s" }} />
                    <span style={{ animationDelay: "0.3s" }} />
                  </span>
                  {agentName} is typing…
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p
                role="alert"
                style={{ fontSize: "13px", color: "#DC2626", textAlign: "center" }}
              >
                {error}
              </p>
            )}

          </div>

          {/* Date picker strip — outside messages scroll so it stays pinned */}
          {showDatePicker && (
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid #F3F4F6",
                background: "#ffffff",
                flexShrink: 0,
              }}
              role="group"
              aria-label="Select a date to browse availability"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#6B7280",
                  }}
                >
                  Pick a date
                </span>
                <button
                  onClick={() => setShowDatePicker(false)}
                  aria-label="Close date picker"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "2px",
                    cursor: "pointer",
                    color: "#9CA3AF",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => dateScrollRef.current?.scrollBy({ left: -150, behavior: "smooth" })}
                  aria-label="Scroll dates left"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 2,
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(255,255,255,0.95)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6B7280",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                {/* Left fade gradient */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: "16px",
                    background: "linear-gradient(to right, #ffffff, transparent)",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}
                />
                <div
                  ref={dateScrollRef}
                  className="widget-date-scroll"
                  style={{
                    display: "flex",
                    gap: "6px",
                    overflowX: "auto",
                    paddingBottom: "2px",
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-x",
                  }}
                >
                  {getDaysFromNow(21).map((day) => (
                    <button
                      key={day.dateStr}
                      onClick={() => {
                        setShowDatePicker(false);
                        void send(`Show me available times for ${day.label === "Today" ? "today" : day.label}`);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = lightenHex(widgetColor, 0.9);
                        e.currentTarget.style.borderColor = widgetColor;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = lightenHex(widgetColor, 0.97);
                        e.currentTarget.style.borderColor = lightenHex(widgetColor, 0.4);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        border: `1.5px solid ${lightenHex(widgetColor, 0.4)}`,
                        background: lightenHex(widgetColor, 0.97),
                        color: "#374151",
                        cursor: "pointer",
                        minWidth: "64px",
                        flexShrink: 0,
                        transition: "background 0.15s ease, border-color 0.15s ease",
                      }}
                      aria-label={`Show available times for ${day.label}`}
                    >
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: widgetColor,
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {day.dayOfWeek}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "#111827",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {day.label}
                      </span>
                    </button>
                  ))}
                </div>
                {/* Right fade gradient */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: "20px",
                    background: "linear-gradient(to left, #ffffff, transparent)",
                    pointerEvents: "none",
                  }}
                />
                <button
                  onClick={() => dateScrollRef.current?.scrollBy({ left: 150, behavior: "smooth" })}
                  aria-label="Scroll dates right"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 2,
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(255,255,255,0.95)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6B7280",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={onSubmit}
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "8px",
              padding: "12px 16px",
              borderTop: "1px solid #E5E7EB",
              flexShrink: 0,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Message ${agentName}…`}
              aria-label="Message the AI assistant"
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                borderRadius: "10px",
                border: "1px solid #D1D5DB",
                padding: "8px 12px",
                fontSize: "14px",
                fontFamily: "inherit",
                lineHeight: 1.4,
                color: "#111827",
                background: "#ffffff",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowDatePicker((prev) => !prev)}
              aria-label={showDatePicker ? "Hide date picker" : "Show date picker"}
              title="Browse dates"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                border: `1.5px solid ${showDatePicker ? widgetColor : "#D1D5DB"}`,
                background: showDatePicker ? lightenHex(widgetColor, 0.95) : "#ffffff",
                color: showDatePicker ? widgetColor : "#6B7280",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
                <path d="M8 14h.01" />
                <path d="M12 14h.01" />
                <path d="M16 14h.01" />
                <path d="M8 18h.01" />
                <path d="M12 18h.01" />
              </svg>
            </button>
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              aria-label="Send message"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                border: "none",
                background: pending || input.trim().length === 0 ? "#D1D5DB" : widgetColor,
                color: "#ffffff",
                cursor: pending || input.trim().length === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* ── Launcher Button ────────────────────────────────────── */}
      <button
        ref={launcherRef}
        onClick={toggle}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
        style={{
          position: "absolute",
          bottom: "20px",
          ...(isPositionLeft ? { left: "20px" } : { right: "20px" }),
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          border: "none",
          background: widgetColor,
          color: "#ffffff",
          cursor: "pointer",
          boxShadow: `0 4px 14px rgba(0,0,0,0.2), 0 0 0 4px ${lightenHex(widgetColor, 0.8)}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          </svg>
        )}
      </button>

      {/* ── Styles (animations) ────────────────────────────────── */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes widget-slide-up {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.widget-dot-pulse {
  display: inline-flex; gap: 3px; align-items: center;
}
.widget-dot-pulse span {
  width: 6px; height: 6px; border-radius: 50%;
  background: #9CA3AF;
  animation: widget-dot-bounce 1.2s ease-in-out infinite;
}
@keyframes widget-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}
.widget-date-scroll::-webkit-scrollbar { display: none; }
`,
        }}
      />
    </div>
  );
}
