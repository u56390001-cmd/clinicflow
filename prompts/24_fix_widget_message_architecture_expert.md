# FIX PROMPT — Expert-Level Fix: Message Formatting Architecture (Text + Structured UI Duplication)

## Diagnosis (read this first — this is an architecture problem, not a wording problem)

Previous fixes tried to solve this by adjusting the **system prompt** (telling the AI to "keep text short when a component is shown"). That approach is fundamentally unreliable because it depends on a language model consistently self-censoring its own text output to match whatever a separate rendering layer decides to show — LLMs are not reliable at this kind of exact, structural self-restraint turn after turn, which is exactly why the duplication keeps reappearing in different forms across multiple fix attempts.

**The correct fix is architectural: stop deriving structured UI (tabs/buttons/cards) by parsing or duplicating the model's free-text output. Instead, treat structured data and conversational text as two separate, independently-sourced fields on every message — one from tool-call results (deterministic, structured), one from the model's short caption (conversational, minimal).**

## Step 1 — Audit the current implementation and report back before changing anything
1. Find where a chat message object/type is defined in the widget's frontend and backend (e.g. `ChatMessage`, `AssistantMessage`, or similar).
2. Determine exactly how structured UI (service cards, slot buttons, date picker, confirmation card) currently gets attached to a message. Identify which of these two patterns (or a mix) is currently happening:
   - **Pattern 1 (likely current, fragile)**: The model returns a text response; a separate piece of code parses that text (regex/string matching, or re-deriving from a tool result) to detect "this looks like a service list" and attaches a card component — but the original full text is *also* still stored/rendered on the message, so both appear.
   - **Pattern 2 (target, correct)**: Tool calls (`getServices`, `getAvailability`, etc.) return structured JSON directly; that JSON is attached to the message as its own field (e.g. `message.component = { type: 'serviceList', data: [...] }`), completely independent of whatever text the model also produced for that turn.
3. Report which pattern is actually in place — this determines the fix.

## Step 2 — Redesign the message data model (target architecture)
Each assistant-turn message should carry **two independent, separately-sourced fields**:
```ts
type AssistantMessage = {
  role: 'assistant';
  text: string | null;           // short conversational caption ONLY — never the raw list/data
  component: {                    // structured UI, sourced directly from tool-call results
    type: 'serviceList' | 'slotList' | 'datePicker' | 'confirmation' | null;
    data: ServiceListData | SlotListData | DatePickerData | ConfirmationData | null;
  } | null;
};
```
Rules:
- `component.data` is populated **directly from the tool call's return value** (e.g. `getServices()`'s actual JSON result), never by parsing the model's text output. This makes the structured UI 100% reliable and decoupled from anything the model says.
- `text` is a **short, separately-generated caption** — ideally generated with a tightly scoped instruction/call that only ever asks for a one-line intro appropriate to the component being shown (e.g. "Write a single short sentence introducing this service list, no details.") — or, simpler and more robust: use a small set of **hardcoded, deterministic caption templates** keyed to `component.type` (e.g. `"Here are our services:"`, `"Here are the available times for {date}:"`, `"Your appointment is confirmed:"`) instead of relying on the model to phrase this correctly every time. This is more reliable than continuing to trust free-form model text for something that's really just UI chrome.
- When `component.type` is `null` (a plain conversational turn — FAQ answer, asking for the user's name, a clarifying question), `text` is the model's full normal response — no restriction needed there.

## Step 3 — Implement
1. Refactor the message construction logic (wherever the API route/orchestrator assembles the response sent to the frontend) to populate `text` and `component` independently per the rules above, sourcing `component.data` directly from the relevant tool's return value — not from parsing model text.
2. If adopting the deterministic-caption-template approach (recommended — more reliable than prompting the model to be brief every time): build a small mapping from component type → caption string/template, and use it whenever a component is present. Only fall through to genuine model-generated text when there's no component for that turn.
3. Update the frontend rendering: an assistant message bubble renders `text` (if non-null) as a normal chat bubble, and separately renders `component` (if non-null) as its dedicated UI element (service cards / slot buttons / date picker / confirmation card) — both can appear together (short caption + component), but `text` must never contain the same information `component.data` already displays.
4. Remove/delete any existing text-parsing logic that tries to detect structured content inside the model's free text (e.g. regex matching for service names/prices/times within a string) — this is the fragile mechanism causing the duplication, and it becomes unnecessary once `component.data` is sourced directly from tool results.

## Step 4 — Re-test thoroughly
Walk the full conversation end-to-end and confirm, at every turn:
1. "What services do you offer?" → short caption + service cards, no repeated details in the text bubble.
2. Selecting a service → short caption + date picker (or direct prompt for date), no duplicated text.
3. Providing a date → short caption + time slot buttons, no duplicated text.
4. Selecting a time → plain text asking for name (no component here — should be normal full sentence, not truncated).
5. Providing a name → short caption + confirmation card, no duplicated text.
6. A plain FAQ question (e.g. "What are your opening hours?") with no component → normal, full conversational text response (confirm this path wasn't over-restricted by the fix).
7. Confirm this holds on both the button-driven path and the manually-typed-text path (per earlier fixes, both input methods should work identically).

## Constraints
- Do not re-attempt a prompt-only fix ("tell the model to be brief") as the primary mechanism — prompt wording can remain as a secondary safety net, but the primary fix must be architectural (structured data sourced independently of model text), per Step 2.
- Do not break tool-calling/booking logic from Phase 5 — this is purely about how results are split into `text` vs `component` for display.
- Ensure the previously-fixed reschedule/cancel safety logic and double-booking checks remain intact and untouched by this refactor.
- Keep this consistent for all component types (services, dates, slots, confirmation) — fix all of them uniformly, don't patch just the services case again.

Report back: which pattern (1 or 2) was actually in place before this fix, confirm the text-parsing logic was removed (not just papered over), and provide the full re-test transcript from Step 4 showing clean, non-duplicated output at every turn.
