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
  /**
   * Render inside a host element instead of over the whole viewport.
   *
   * The website builder previews a whole scrolling page inside one frame, and the
   * live widget is pinned to the viewport. The host gets that by giving this a
   * zero-height box it has already stuck to the bottom of its scroll pane; the
   * panel then sizes against the measured frame rather than `100vw`/`100vh`,
   * because on a 390px phone preview a viewport-relative panel would be wider
   * than the page it is supposed to belong to.
   */
  contained?: { maxWidth: number; maxHeight: number };
  /**
   * Increment to open the panel from outside the widget.
   *
   * Lets the builder's booking buttons drive the same panel a visitor gets by
   * clicking the bubble, without this component having to hand its state out.
   */
  openSignal?: number;
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
   *  Rendered as dedicated UI elements, independent of the text bubble.
   *  `doctorList` is assembled locally by the widget from the public
   *  directory endpoint — it never arrives from the chat API. */
  component?: {
    type: "serviceList" | "slotList" | "confirmation" | "doctorList";
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

/** A doctor from the public directory endpoint (`/api/widget/[slug]/directory`),
 *  used to render doctor cards locally without involving the chat API. */
type WidgetDoctorItem = {
  id: string;
  name: string;
  specialty: string | null;
  qualification: string | null;
  yearsOfExperience: number | null;
  consultationFee: number | null;
  about: string | null;
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

/** The system prompt tells the model to offer choices as emoji-numbered lines
 *  (1️⃣ 2️⃣ 3️⃣). Parsing those back out turns the model's listed options —
 *  concerns, alternatives, times — into tappable chips instead of plain text. */
const EMOJI_NUMERALS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

function parseOptionChips(text: string): { body: string; options: string[] } {
  const options: string[] = [];
  const bodyLines: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const index = EMOJI_NUMERALS.findIndex((emoji) => trimmed.startsWith(emoji));
    if (index !== -1) {
      const option = trimmed
        .slice(EMOJI_NUMERALS[index].length)
        .replace(/^[\s.、:：\-–—]+/, "")
        .trim();
      if (option) {
        options.push(option);
        continue;
      }
    }
    bodyLines.push(line);
  }
  return {
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    options: options.length >= 2 ? options : [],
  };
}

/** Group slots into morning / afternoon / evening sections so a list of times
 *  reads at a glance instead of as a wall of pills. */
type SlotGroup = { emoji: string; label: string; slots: WidgetSlotItem[] };

function groupSlots(slots: WidgetSlotItem[]): SlotGroup[] {
  const groups: Record<"morning" | "afternoon" | "evening", WidgetSlotItem[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const slot of slots) {
    const hour = new Date(slot.startTime).getHours();
    if (hour < 12) groups.morning.push(slot);
    else if (hour < 17) groups.afternoon.push(slot);
    else groups.evening.push(slot);
  }
  return [
    { emoji: "☀️", label: "Morning", slots: groups.morning },
    { emoji: "🌤", label: "Afternoon", slots: groups.afternoon },
    { emoji: "🌙", label: "Evening", slots: groups.evening },
  ].filter((group) => group.slots.length > 0);
}

/** Welcome-screen shortcuts. `text` intents go to the AI; `action` shortcuts
 *  are handled by the widget itself (doctor cards, date strip). */
const QUICK_ACTIONS: Array<
  { icon: string; label: string } & ({ text: string; action?: never } | { action: "doctors" | "dates"; text?: never })
> = [
  { icon: "🩺", label: "Book Appointment", text: "I'd like to book an appointment" },
  { icon: "👨‍⚕️", label: "Find a Doctor", action: "doctors" },
  { icon: "💆", label: "Services & Treatments", text: "What services do you offer?" },
  { icon: "💰", label: "Consultation Fee", text: "What are your consultation fees?" },
  { icon: "📍", label: "Clinic Location", text: "Where is the clinic located?" },
  { icon: "📅", label: "Browse Dates", action: "dates" },
];

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

type WidgetGlobalApi = { open?: () => void };

/**
 * Publishes `window.MedBookWidget` for a contained (in-preview) instance and
 * hands back a teardown function.
 *
 * More than one contained instance can be alive at the same time: the builder
 * keeps its docked canvas mounted underneath the fullscreen overlay. A lone
 * global key cannot represent both, and simply deleting it on unmount is what
 * broke the booking buttons — closing fullscreen tore down the key while the
 * canvas underneath never re-registered, because its effect had no reason to
 * run again. Every link then waited out its fallback window and navigated to the
 * standalone page.
 *
 * So instances stack up instead, and the global points at the most recently
 * mounted one — the preview the user is actually looking at. Unmounting hands
 * the key back to the next one down rather than clearing it, and only a builder
 * with no live previews left ends up with no global at all.
 *
 * The stack hangs off `window` rather than module scope: module-level state would
 * be shared across server requests, and the key also lets two copies of this
 * module agree on a single owner.
 */
function claimGlobalWidget(open: () => void): () => void {
  const host = window as typeof window & {
    MedBookWidget?: WidgetGlobalApi;
    __medbookWidgetStack?: WidgetGlobalApi[];
  };
  const stack = (host.__medbookWidgetStack ??= []);
  const api: WidgetGlobalApi = { open };
  stack.push(api);
  host.MedBookWidget = api;

  return () => {
    const index = stack.indexOf(api);
    if (index !== -1) stack.splice(index, 1);

    // Only redirect if the departing instance was the visible one. If something
    // below us unmounts while an overlay is open, the overlay keeps the key.
    if (host.MedBookWidget === api) {
      const next = stack[stack.length - 1];
      if (next) host.MedBookWidget = next;
      else delete host.MedBookWidget;
    }

    if (stack.length === 0) delete host.__medbookWidgetStack;
  };
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
    contained,
    openSignal,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  /** Service name chosen via a service card — shown in the booking summary. */
  const [selectedService, setSelectedService] = useState<string | null>(null);
  /** Pre-booking summary: the picked slot awaiting a Confirm / Change decision. */
  const [draft, setDraft] = useState<{ startTime: string; endTime: string } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftForOther, setDraftForOther] = useState(false);
  /** Text of the message that failed, kept so "Try again" can resend it. */
  const [retryText, setRetryText] = useState<string | null>(null);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
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

  // A booking button anywhere on the page opens this panel instead of sending
  // the visitor to a separate chat page. The standalone widget page gets this
  // for free because `public/widget.js` defines the global; the builder preview
  // has no such script, so the same contract is published here.
  //
  // `contained` arrives as a fresh object literal from the preview, so the
  // effect keys off whether the mode is on rather than the object's identity —
  // otherwise every re-render tore down and rebuilt the registration.
  const containedMode = Boolean(contained);
  useEffect(() => {
    if (!containedMode) return;
    return claimGlobalWidget(() => {
      setError(null);
      setIsOpen(true);
    });
  }, [containedMode]);

  useEffect(() => {
    if (openSignal === undefined || openSignal === 0) return;
    setIsOpen(true);
  }, [openSignal]);

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
      setRetryText(null);
      setTyping(true);
      // A new turn supersedes any open booking summary.
      setDraft(null);
      setDraftName("");
      setDraftForOther(false);

      // Roll the outgoing message back on failure so the retry path can resend
      // it cleanly instead of duplicating it in the transcript and in history.
      const popFailedUserMessage = () =>
        setMessages((current) => {
          const last = current[current.length - 1];
          return last && last.role === "user" && last.reply === trimmed
            ? current.slice(0, -1)
            : current;
        });

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
          setRetryText(trimmed);
          popFailedUserMessage();
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
        setError("Connection problem 😓 Please check your internet and try again.");
        setRetryText(trimmed);
        popFailedUserMessage();
      } finally {
        setPending(false);
      }
    },
    [messages, pending, slug],
  );

  function retryLast(): void {
    if (!retryText || pending) return;
    void send(retryText);
  }

  /** Welcome-screen "Find a Doctor": fetch the clinic roster and render doctor
   *  cards locally. Falls back to the AI text answer if the roster is empty or
   *  the endpoint is unreachable, so the intent still gets a response. */
  async function openDoctors(): Promise<void> {
    if (doctorsLoading || pending) return;
    setDoctorsLoading(true);
    setError(null);
    setRetryText(null);
    setTyping(true);
    try {
      const res = await fetch(`/api/widget/${slug}/directory`);
      const data: { ok?: boolean; doctors?: WidgetDoctorItem[] } = await res.json();
      const doctors = res.ok && data.ok && Array.isArray(data.doctors) ? data.doctors : [];
      if (doctors.length === 0) throw new Error("empty");
      const names = doctors.map((d) => `${d.name} (${d.specialty ?? "Doctor"})`).join(", ");
      setMessages((current) => [
        ...current,
        { role: "user", text: "👨‍⚕️ Find a doctor", reply: "Find a doctor" },
        {
          role: "assistant",
          text: "Here are our doctors:",
          reply: `Here are our doctors: ${names}`,
          component: { type: "doctorList", data: doctors },
        },
      ]);
    } catch {
      // Roster unavailable — let the AI answer the request in text instead.
      await send("I'd like to find a doctor");
    } finally {
      setTyping(false);
      setDoctorsLoading(false);
    }
  }

  /** Confirm the booking summary: forward the picked slot (plus identity, when
   *  given) as the same slot-selection message the flow always sent, so the AI
   *  keeps collecting whatever details it still needs. */
  function confirmDraft(): void {
    if (!draft) return;
    const parts = [`I'd like the ${formatSlotTime(draft.startTime)} slot`];
    const name = draftName.trim();
    if (draftForOther) parts.push(name ? `It's for a family member. Their name is ${name}` : "It's for a family member, not me");
    else if (name) parts.push(`My name is ${name}`);
    void send(`${parts.join(". ")}.`);
  }

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

  /* Full-bleed: pinned to the viewport, which is what the published site needs.
     Contained: fills a zero-height box that the host has already pinned to the
     bottom of its scroll pane, so the launcher stays in the corner at every
     scroll position. Deliberately not another `sticky` — a sticky element is
     trapped by its containing block, so nesting one inside a zero-height wrapper
     would leave it with nowhere to move to. */
  const rootStyle: React.CSSProperties = contained
    ? {
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }
    : {
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483647,
      };

  const panelWidth = contained
    ? `min(400px, calc(${contained.maxWidth}px - 32px))`
    : "min(400px, calc(100vw - 32px))";
  const panelHeight = contained
    ? `min(580px, calc(${contained.maxHeight}px - 140px))`
    : "min(580px, calc(100vh - 120px))";

  return (
    <div
      style={{
        ...rootStyle,
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
            width: panelWidth,
            height: panelHeight,
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
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: `1px solid ${lightenHex(widgetColor, 0.6)}`,
                    background: lightenHex(widgetColor, 0.96),
                  }}
                >
                  <span style={{ fontSize: "20px", lineHeight: 1.4 }} aria-hidden>
                    👋
                  </span>
                  <p style={{ fontSize: "14px", color: "#374151", lineHeight: 1.55, margin: 0 }}>
                    {greeting}
                  </p>
                </div>

                {/* Quick actions — trigger AI intents or widget shortcuts */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "8px",
                  }}
                  aria-label="Quick actions"
                >
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      disabled={doctorsLoading}
                      onClick={() => {
                        if (action.action === "doctors") void openDoctors();
                        else if (action.action === "dates") {
                          setDraft(null);
                          setShowDatePicker(true);
                        } else if (action.text) void send(action.text);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = widgetColor;
                        e.currentTarget.style.background = lightenHex(widgetColor, 0.93);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = lightenHex(widgetColor, 0.5);
                        e.currentTarget.style.background = "#ffffff";
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: `1.5px solid ${lightenHex(widgetColor, 0.5)}`,
                        background: "#ffffff",
                        color: "#111827",
                        cursor: doctorsLoading ? "wait" : "pointer",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: 500,
                        lineHeight: 1.3,
                        fontFamily: "inherit",
                        transition: "border-color 0.15s ease, background 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "16px", flexShrink: 0 }} aria-hidden>
                        {action.icon}
                      </span>
                      <span style={{ minWidth: 0 }}>{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.filter((msg) => !msg.hidden).map((msg, i) => {
              // Emoji-numbered lines in an AI reply become tappable chips
              // (concerns, alternatives, times) instead of plain text.
              const parsed =
                msg.role === "assistant" && msg.text ? parseOptionChips(msg.text) : null;
              const bubbleText = parsed ? parsed.body : msg.text;
              const chips = parsed?.options ?? [];
              return (
              <div key={i}>
                {bubbleText ? (
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
                    {stripMarkdown(bubbleText)}
                  </div>
                </div>
                ) : null}

                {/* Option chips parsed from the AI's emoji-numbered choices */}
                {chips.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      marginTop: "6px",
                      paddingLeft: "4px",
                    }}
                  >
                    {chips.map((option, j) => (
                      <button
                        key={`${j}-${option}`}
                        onClick={() => void send(option)}
                        disabled={pending}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.85);
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = lightenHex(widgetColor, 0.95);
                        }}
                        style={{
                          fontSize: "13px",
                          padding: "6px 12px",
                          borderRadius: "999px",
                          border: `1px solid ${lightenHex(widgetColor, 0.55)}`,
                          background: lightenHex(widgetColor, 0.95),
                          color: widgetColor,
                          cursor: pending ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          lineHeight: 1.4,
                          transition: "background 0.15s ease",
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {/* Slot cards — grouped morning / afternoon / evening, max 6 */}
                {msg.component?.type === "slotList" && (msg.component.data as WidgetSlotItem[]).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      marginTop: "8px",
                      paddingLeft: msg.role === "user" ? "0" : "4px",
                    }}
                  >
                    {groupSlots((msg.component.data as WidgetSlotItem[]).slice(0, 6)).map((group) => (
                      <div
                        key={group.label}
                        style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                      >
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "#6B7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {group.emoji} {group.label}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {group.slots.map((slot, j) => (
                            <button
                              key={j}
                              onClick={() => {
                                // Open the booking summary instead of sending —
                                // the patient confirms (with optional name /
                                // identity) before anything reaches the AI.
                                setShowDatePicker(false);
                                setDraftName("");
                                setDraftForOther(false);
                                setDraft({ startTime: slot.startTime, endTime: slot.endTime });
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
                                fontFamily: "inherit",
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
                      </div>
                    ))}
                  </div>
                )}

                {/* Service cards — name, benefit, duration, price + booking CTA */}
                {msg.component?.type === "serviceList" && (msg.component.data as WidgetServiceItem[]).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
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
                          setSelectedService(svc.name);
                          void send(`I'd like to book "${svc.name}"`);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = widgetColor;
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = lightenHex(widgetColor, 0.4);
                          e.currentTarget.style.boxShadow = "none";
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          border: `1.5px solid ${lightenHex(widgetColor, 0.4)}`,
                          background: "#ffffff",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                          fontFamily: "inherit",
                          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827", lineHeight: 1.3 }}>
                          {svc.name}
                        </div>
                        {svc.description && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {svc.description}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            marginTop: "2px",
                          }}
                        >
                          <span style={{ fontSize: "11px", color: "#9CA3AF" }}>
                            ⏱ {formatDuration(svc.durationMinutes)}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: "14px", color: widgetColor }}>
                            {formatPrice(svc.price)}
                          </span>
                        </div>
                        <span
                          style={{
                            display: "block",
                            marginTop: "4px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            background: widgetColor,
                            color: "#ffffff",
                            fontSize: "13px",
                            fontWeight: 600,
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}
                        >
                          Book Consultation
                        </span>
                      </button>
                    ))}
                    {/* Concern-based recommendation: skip the list, ask the AI */}
                    <button
                      onClick={() =>
                        void send(
                          "I'm not sure which service I need — can you recommend one based on my concern?",
                        )
                      }
                      disabled={pending}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = lightenHex(widgetColor, 0.95);
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      style={{
                        marginTop: "2px",
                        padding: "6px 10px",
                        borderRadius: "8px",
                        border: "none",
                        background: "transparent",
                        color: widgetColor,
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: pending ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        textAlign: "center",
                        transition: "background 0.15s ease",
                      }}
                    >
                      🤔 Not sure which one? Get a personal recommendation
                    </button>
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
                      <div>
                        <strong>Clinic:</strong> {clinicName}
                      </div>
                      <div style={{ color: "#6B7280", fontSize: "12px", marginTop: "2px" }}>
                        Appointment ID: {booking.id.slice(0, 8)}
                      </div>
                    </div>
                    {/* Post-booking actions — plain intents the AI already handles
                        via the injected appointment context. */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                      <button
                        onClick={() => void send("I'd like to reschedule my appointment")}
                        disabled={pending}
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: `1.5px solid ${lightenHex(widgetColor, 0.5)}`,
                          background: "#ffffff",
                          color: widgetColor,
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: pending ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        🔁 Reschedule
                      </button>
                      <button
                        onClick={() => void send("I'd like to cancel my appointment")}
                        disabled={pending}
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          borderRadius: "8px",
                          border: "1.5px solid #FECACA",
                          background: "#ffffff",
                          color: "#DC2626",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: pending ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        🗑 Cancel
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {/* Doctor cards — assembled locally from the directory endpoint */}
                {msg.component?.type === "doctorList" && (msg.component.data as WidgetDoctorItem[]).length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      marginTop: "8px",
                      paddingLeft: "4px",
                      maxWidth: "90%",
                    }}
                  >
                    {(msg.component.data as WidgetDoctorItem[]).map((doc) => (
                      <div
                        key={doc.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          border: `1.5px solid ${lightenHex(widgetColor, 0.4)}`,
                          background: "#ffffff",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "18px" }} aria-hidden>
                            👨‍⚕️
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>
                              {doc.name}
                            </div>
                            <div style={{ fontSize: "12px", color: widgetColor, fontWeight: 500 }}>
                              {doc.specialty || "Doctor"}
                              {doc.qualification ? ` · ${doc.qualification}` : ""}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "#6B7280" }}>
                          {doc.yearsOfExperience != null && doc.yearsOfExperience > 0
                            ? `${doc.yearsOfExperience} years experience`
                            : "Experienced specialist"}
                          {doc.consultationFee != null ? ` · ${formatPrice(doc.consultationFee)}` : ""}
                        </div>
                        {doc.about && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {doc.about}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                          <button
                            onClick={() => void send(`Show me available times for ${doc.name}`)}
                            disabled={pending}
                            style={{
                              flex: 1,
                              padding: "7px 10px",
                              borderRadius: "8px",
                              border: `1.5px solid ${widgetColor}`,
                              background: "#ffffff",
                              color: widgetColor,
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: pending ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            📅 View Slots
                          </button>
                          <button
                            onClick={() => {
                              setSelectedService(null);
                              void send(`I'd like to book an appointment with ${doc.name}`);
                            }}
                            disabled={pending}
                            style={{
                              flex: 1,
                              padding: "7px 10px",
                              borderRadius: "8px",
                              border: "none",
                              background: widgetColor,
                              color: "#ffffff",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: pending ? "not-allowed" : "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            🩺 Book
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })}

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

            {/* Error — friendly card with a one-tap retry */}
            {error && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  fontSize: "13px",
                  color: "#B91C1C",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontSize: "15px", flexShrink: 0 }} aria-hidden>
                  ⚠️
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
                {retryText && (
                  <button
                    onClick={retryLast}
                    disabled={pending}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "999px",
                      border: "1px solid #FECACA",
                      background: "#ffffff",
                      color: "#B91C1C",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: pending ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    Try again
                  </button>
                )}
              </div>
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

          {/* Booking summary — review & confirm before the slot reaches the AI */}
          {draft && (
            <div
              style={{
                padding: "10px 12px",
                borderTop: "1px solid #F3F4F6",
                background: lightenHex(widgetColor, 0.97),
                flexShrink: 0,
              }}
              role="group"
              aria-label="Booking summary"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                  📋 Booking summary
                </span>
                <button
                  onClick={() => {
                    setDraft(null);
                    setDraftName("");
                    setDraftForOther(false);
                  }}
                  aria-label="Close booking summary"
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.7 }}>
                {selectedService && (
                  <div>
                    <strong>Service:</strong> {selectedService}
                  </div>
                )}
                <div>
                  <strong>Date:</strong> {formatSlotDate(draft.startTime)}
                </div>
                <div>
                  <strong>Time:</strong> {formatSlotTime(draft.startTime)} – {formatSlotTime(draft.endTime)}
                </div>
              </div>

              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmDraft();
                  }
                }}
                placeholder={draftForOther ? "Patient's full name (optional)" : "Your full name (optional)"}
                aria-label="Patient name"
                maxLength={120}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  marginTop: "8px",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid #D1D5DB",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  color: "#111827",
                  background: "#ffffff",
                  outline: "none",
                }}
              />

              {/* Patient identity — never assume the account owner is the patient */}
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                {[
                  { key: false, label: "For me" },
                  { key: true, label: "For someone else" },
                ].map((option) => (
                  <button
                    key={String(option.key)}
                    onClick={() => setDraftForOther(option.key)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "999px",
                      border: `1.5px solid ${draftForOther === option.key ? widgetColor : "#D1D5DB"}`,
                      background: draftForOther === option.key ? lightenHex(widgetColor, 0.9) : "#ffffff",
                      color: draftForOther === option.key ? widgetColor : "#6B7280",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button
                  onClick={confirmDraft}
                  disabled={pending}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: widgetColor,
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✅ Confirm Booking
                </button>
                <button
                  onClick={() => {
                    setDraft(null);
                    setDraftName("");
                    setDraftForOther(false);
                  }}
                  disabled={pending}
                  style={{
                    flex: 1,
                    padding: "9px 10px",
                    borderRadius: "8px",
                    border: `1.5px solid ${lightenHex(widgetColor, 0.5)}`,
                    background: "#ffffff",
                    color: widgetColor,
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✏️ Change Details
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
              onClick={() => {
                setShowDatePicker((prev) => {
                  if (!prev) setDraft(null);
                  return !prev;
                });
              }}
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
