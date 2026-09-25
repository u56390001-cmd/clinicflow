# INIT PROMPT — MedBook AI
## Phase 13: WhatsApp Conversational Booking
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.4
**Target tool:** OpenCode
**Prerequisite:** Phase 12 (WhatsApp Connection + AI Agent Configuration) complete and verified — a clinic can connect their WhatsApp Business number and configure tone/enable-state.

---

## 0. IMPORTANT — READ BEFORE STARTING
This phase makes WhatsApp actually functional: incoming patient messages are received and answered by the same AI logic already powering the widget and internal test chat.
- Do **not** build a third, separate AI/booking implementation for WhatsApp. The entire point of Phase 5's `AIProvider` abstraction and Phase 6's "one orchestrator, multiple channels" pattern is that WhatsApp becomes a new **channel adapter**, not a new brain.
- Do **not** rebuild `checkSlotAvailability()`, appointment creation, reschedule, or cancel logic — reuse Phase 3/5/10's existing functions exactly as the widget does.
- Learn from Phase 6's hard-won lessons (documented across many fix cycles in this project): do not route deterministic selections (doctor choice, date, time slot) through free-text LLM interpretation when a structured WhatsApp interactive message (list/button) can represent the same choice unambiguously. Build this correctly from the start here — don't repeat the loop/duplication bugs that took multiple iterations to fix in the widget.
- Before writing any code: inspect the current orchestrator's channel-agnosticism. Confirm whether Phase 5/6's core logic (`AIProvider`, the six tools, the message/history handling fixed during Phase 6's stabilization) is already cleanly separated from the widget's specific UI/transport layer, or whether some of it is currently widget-coupled and needs a small refactor to become genuinely channel-agnostic. Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–12, applying everything learned from Phase 6's extensive widget-stabilization work (message architecture, conversation-history correctness, deterministic-vs-AI-driven action separation, reschedule/cancel confirmation safety) directly to this new channel from day one.

## 2. OBJECTIVE
A patient messages a connected clinic's WhatsApp number and can: ask FAQs, browse services, check real availability (optionally per-doctor, per Phase 10), book/reschedule/cancel an appointment, and receive confirmations — all through the existing, proven AI logic, with WhatsApp's native interactive messages (lists/buttons) used for discrete choices instead of free text wherever possible.

## 3. SCOPE

### A. Inbound webhook (`/api/whatsapp/webhook`)
- Implement Meta's WhatsApp Cloud API webhook verification (GET challenge-response) and message receipt (POST) endpoints — research Meta's current documented webhook contract directly rather than assuming remembered details.
- Route incoming messages to the correct clinic via the `phone_number_id` stored in `clinic_whatsapp_config` (Phase 12).
- If `whatsapp_enabled` is false for that clinic (Phase 12's toggle), or the clinic isn't connected/found, respond gracefully (no crash, and per WhatsApp's model, likely just don't auto-reply, or send a clear "AI assistant is not available for this number" fallback if appropriate) — never leak errors back to the patient's chat.

### B. Channel-agnostic orchestrator integration
- Wire WhatsApp messages into the **same** orchestrator/tool-calling logic used by `/app/ai-test` and the public widget. If Section 0's audit found any widget-specific coupling, extract the shared logic into a clean, channel-independent function first, then build thin adapters: one for WhatsApp message format ↔ internal message format, reusing the existing widget adapter as a reference for the pattern (not copying its UI-specific code, just its "translate this channel's format to/from the shared orchestrator" role).
- All six tools (`getClinicInfo`, `getServices`, `getAvailability`, `createAppointment`, `rescheduleAppointment`, `cancelAppointment`) work identically — including the Phase 10 doctor-awareness extensions and Phase 6's reschedule/cancel confirmation-before-action safety rule.
- `booking_source = 'ai_agent'` remains correct (WhatsApp is still the AI agent, per the existing schema — no new booking_source value needed unless you want to distinguish widget-AI from WhatsApp-AI for analytics; if so, propose the addition rather than assuming).

### C. Deterministic vs. free-text handling (apply Phase 6's lessons proactively)
- Where WhatsApp interactive messages (List Messages, Reply Buttons) can represent a discrete choice — doctor selection (if >1 visible doctor), service selection, date selection, time slot selection — **send them as WhatsApp interactive messages**, and handle the patient's tap as a direct, deterministic state transition (calling the relevant tool directly with the selected id), **not** as free text re-interpreted by the LLM.
- Reserve free-text LLM interpretation for genuinely open-ended input: the patient's name, FAQ questions, ambiguous requests ("I want to change my appointment" with no active button context), general conversation.
- Track conversation/session state explicitly per patient-clinic WhatsApp thread (selected service/doctor/date/slot, pending appointment id for reschedule/cancel context) — reuse or extend whatever explicit state mechanism Phase 6's later fixes introduced for the widget, don't reinvent a second state model.

### D. Returning-patient recognition
- On an inbound message, look up `patients.whatsapp_number` (added in Phase 11) for that clinic. If a match is found, skip redundant intake (don't re-ask for name if already known) and personalize the greeting. If no match, proceed as a new-patient flow and capture their WhatsApp number on successful booking (writing to `patients.whatsapp_number`).
- This is WhatsApp-specific logic (the widget has no equivalent stable identity today) — implement it as part of the WhatsApp channel adapter, not the shared orchestrator, since it depends on phone-number identity that other channels don't have.

### E. Reminders via the Notification Dispatcher
- Implement the `channel: 'whatsapp'` case in Phase 11's `notifyPatient()` dispatcher (previously stubbed) using the WhatsApp Cloud API's message-sending endpoint.
- Wire `appointment_reminder` notifications to actually send via WhatsApp when `patients.notification_preference` includes `whatsapp` — confirm the reminder-triggering logic (timing — e.g. 24h before) either already exists from Phase 8/email or needs to be added as a scheduled job/cron (check current infrastructure for scheduled tasks; if none exists, propose the simplest viable approach — e.g. a Supabase scheduled function or an external cron hitting an API route — and confirm with me before building new infrastructure).

### F. Safety rules (identical to Phase 5/6 — do not weaken)
- Never fabricate availability — always call `getAvailability()`.
- Never claim a booking exists before the tool call confirms successful DB creation.
- Never substitute a new booking when the patient intends to reschedule/cancel — identify the specific appointment (via the session state and/or `patients.whatsapp_number` lookup) and confirm with the patient before acting, exactly as fixed for the widget in Phase 6.
- Medical questions still escalate, never diagnose/prescribe.
- Rate limit the webhook endpoint per sender/clinic to prevent abuse.

## 4. DATABASE WORK REQUIRED
- Confirm/add a `whatsapp_conversations` (or reuse an existing generalized session table if Phase 6's later fixes introduced one) table tracking: `clinic_id`, `patient_whatsapp_number`, `patient_id` (nullable until matched/created), session state (selected service/doctor/date/slot, pending appointment id), `last_message_at`, for conversation continuity across multiple inbound messages.
- RLS scoped via `clinic_members` for any dashboard-visible parts of this data (full inbox visibility is Phase 14 — this phase just needs the data model to exist correctly).

## 5. DEFINITION OF DONE
- [ ] Webhook verification and message receipt work correctly against Meta's Cloud API.
- [ ] Messages route to the correct clinic and respect the `whatsapp_enabled` toggle.
- [ ] Same orchestrator/tools used as widget/internal chat — no duplicated AI logic.
- [ ] Discrete choices (doctor/service/date/slot) use WhatsApp interactive messages and deterministic handling, not free-text LLM re-interpretation.
- [ ] Returning-patient recognition works via `whatsapp_number` lookup.
- [ ] Full booking flow works end-to-end via WhatsApp: FAQ → service → (doctor if applicable) → date → slot → confirm → real appointment created, visible on `/app/calendar`.
- [ ] Reschedule/cancel via WhatsApp correctly identifies and confirms the target appointment before acting (no repeat of the earlier widget bug).
- [ ] WhatsApp reminders send correctly via the dispatcher for patients who opted in.
- [ ] All Phase 5 safety rules verified on this channel too.
- [ ] Webhook rate-limited.

## 6. CONSTRAINTS
- Do not build a separate AI/booking logic path for WhatsApp — extend the shared orchestrator.
- Do not route unambiguous button/list selections through free-text LLM interpretation.
- Do not weaken any existing safety rule from Phase 5/6.
- Do not build the Chat Inbox/human-takeover UI yet — Phase 14. This phase can add the underlying `human_takeover` state field to the conversation table if convenient (cheap to add now, avoids another migration in Phase 14) but does not need to build any UI for it.
- Research Meta's current WhatsApp Cloud API message-sending and interactive-message documentation directly rather than assuming remembered syntax.

## 7. PROCESS
1. Complete the Section 0 orchestrator-coupling audit and report findings before writing code.
2. Research and confirm Meta's current webhook + message-sending + interactive-message API contract.
3. Propose the WhatsApp channel adapter design (how it translates to/from the shared orchestrator) and the conversation-state table schema before implementing.
4. Implement: migration (conversation state table) → webhook verification/receipt → channel adapter wired to shared orchestrator → deterministic interactive-message handling for discrete choices → returning-patient recognition → reschedule/cancel confirmation logic → WhatsApp reminder implementation in the dispatcher → rate limiting.
5. Provide a verification checklist: complete a full booking via WhatsApp (using a real or sandbox test number per Meta's testing tools), confirm it appears on the calendar; test with a clinic that has multiple visible doctors (Phase 10) and confirm doctor selection works via interactive message; test reschedule and cancel and confirm correct target identification with confirmation; message again as a returning patient and confirm recognition; test a medical question and confirm escalation; confirm reminders send for an opted-in patient; confirm webhook rate limiting.

Confirm your understanding, the Section 0 audit, and your Meta API research findings back to me before writing code. Do not start Phase 14 (Human Takeover / Chat Inbox) — I'll provide that init prompt once this phase is verified.
