# Chat Widget — Response & UI Behaviour

How the website chat widget renders AI responses: text bubbles, structured
cards/buttons, and the rules that keep them consistent.

> The AI itself (system prompt, tools, booking logic, medical safety) is
> **identical** to WhatsApp — both channels call the same
> `runReceptionistTurn` orchestrator (`lib/ai/orchestrator.ts`). Only the
> **presentation** differs.

---

## 1. Message architecture

Every assistant turn returns from `/api/widget/chat` with:

| Field | Meaning |
|---|---|
| `reply` | The model's full free-text response (always stored in API history). |
| `caption` | A **hardcoded template** string (not model text) used as the bubble when a card is shown. |
| `component` | Structured UI card sourced **from tool results only** (`getServices` / `getAvailability` / `createAppointment`) — never from the model's imagination. |
| `sessionContext` | Hidden history message after a booking so the AI can reschedule/cancel the same appointment later. |

Rendering rule (`components/widget/widget-chat.tsx`):

- **Component present** → show the deterministic `caption` bubble + the card below it.
- **Confirmation card** → **no text bubble at all**; the card speaks for itself.
- **No component** → show the model's full `reply` as a normal bubble.

Captions are fixed templates, so the card's data is never duplicated in text:

| Component | Caption (fixed) |
|---|---|
| `serviceList` | `Here are our services:` |
| `slotList` | `Here are the available times:` |
| `confirmation` | *(no bubble — card only)* |

This matches the system-prompt rule: **minimal text whenever a picker is
attached**; normal short sentences only when there is no card.

---

## 2. Opening greeting

```
{welcome_message from AI settings}
```
Fallback: `Hi! I'm {agentName}, the AI assistant for {clinicName}. How can I help you today?`

---

## 3. Card & button types

### 3.1 Service cards (`serviceList`)

Vertical clickable cards, one per service:

```
AI bubble: Here are our services:

┌──────────────────────────────────────┐
│ Skin Consultation              $50  │
│ Acne, rash and skin evaluation      │   ← description (truncated)
│ ⏱ 30 min                            │   ← duration
└──────────────────────────────────────┘
│ General Checkup               $30   │
│ ...                                 │
└──────────────────────────────────────┘
```

- Styled with the widget's accent color (hover highlights the border).
- **Click** → sends the text `I'd like to book "{service name}"` as the user's
  message; the AI continues the flow from there.

### 3.2 Time-slot buttons (`slotList`)

Color-themed pill buttons (max 6 shown — same cap as WhatsApp):

```
AI bubble: Here are the available times:

[ 2:00 PM ]  [ 4:30 PM ]  [ 6:00 PM ]
```

- Each pill shows the start time (and `to {end}` when the slot is longer than
  the default).
- **Click** → sends `I'd like the {time} slot`.

### 3.3 Booking confirmation card (`confirmation`)

Shown after a successful `createAppointment` — replaces the text bubble:

```
┌─────────────────────────────────────┐
│ ✓  Appointment Confirmed            │   ← green-tinted card
│ Date: 20 Aug                        │
│ Time: 2:00 PM – 2:30 PM             │
│ Service: Skin Consultation          │
└─────────────────────────────────────┘
```

- Simultaneously a **hidden session-context message** is injected into history
  (not visible to the user) containing the appointment ID, so later
  reschedule/cancel requests target this exact booking.

### 3.4 Date picker strip

A pinned strip above the composer (toggled from a calendar button):

```
[ Today ] [ Tue 12 ] [ Wed 13 ] [ Thu 14 ]  →  ←   [ ✕ ]
```

- Horizontal scroll of upcoming days.
- **Click a day** → closes the strip and sends
  `Show me available times for {Today|Tuesday|...}` → the AI calls
  `getAvailability` and returns a `slotList`.

---

## 4. Text-only responses (no card)

For everything else the widget shows the model's full reply as a normal bubble:

- FAQ / price / location / timing answers (fact → value → next step)
- One-question-at-a-time intake (name, email, pre-consultation questions)
- Medical-question refusals (`I can't help with medical questions…`) and
  emergency guidance
- Reschedule / cancel confirmations and clarifying questions
- Language mirroring (English / Roman Urdu / Hinglish)

Bubbles render with `stripMarkdown()` — no markdown formatting appears; user
bubbles use the widget accent color, assistant bubbles are neutral with a
light border.

---

## 5. Deduplication of stale cards

The model sometimes re-calls `getServices` / `getAvailability` on later turns.
The widget keeps `serviceChosenRef` / `slotChosenRef` flags and **suppresses
any `serviceList` or `slotList` component after the user has already picked
one**, so old cards never re-render mid-conversation.

---

## 6. States & errors

| State | Rendering |
|---|---|
| Thinking | Pulsing three-dot indicator: `{agentName} is typing…` |
| HTTP 429 | User's message is rolled back; usage-limit error shown. |
| Provider error | "The AI assistant has reached its usage limit for today…" / "…temporarily busy…" |
| Network error | `Network error — check your connection and try again.` |

---

## 7. Widget vs WhatsApp

| | Chat widget | WhatsApp |
|---|---|---|
| AI text / behaviour | Same orchestrator, same system prompt | Same |
| Services | Clickable cards | List menu (`serviceList` rows) |
| Time slots | Pill buttons (≤6) | List menu (≤6) |
| Dates | Pinned date-picker strip | List menu of dates |
| Booking result | Confirmation card, no bubble | `🎉 Your appointment is booked!` text + details |
| Button confirm | *(handled by AI text flow)* | `Shall I book this for you? 😊` → [Confirm booking] [Not now] |
| Numbered options | Not used — clicks send the answer | `1️⃣ 2️⃣ 3️⃣` emoji numbers in text |
| Captions with cards | Fixed templates (`Here are our services:`) | Same caption rule applies |

---

## 8. Key source files

| File | Role |
|---|---|
| `components/widget/widget-chat.tsx` | Widget UI: bubbles, cards, date strip, dedup, errors |
| `app/api/widget/chat/route.ts` | Widget API — builds context, calls `runReceptionistTurn` |
| `lib/ai/orchestrator.ts` | Shared AI loop; builds `component` + `caption` from tool results |
| `lib/ai/system-prompt.ts` | Behaviour, minimal-text-with-picker rule, medical marker |
| `lib/ai/tools.ts` | `getServices` / `getAvailability` / `getClinicInfo` / `createAppointment` |
