# INIT PROMPT — MedBook AI
## Phase 14: Human Takeover / Chat Inbox
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.5
**Target tool:** OpenCode
**Prerequisite:** Phase 13 (WhatsApp Conversational Booking) complete and verified — real patient conversations are flowing through WhatsApp.

---

## 0. IMPORTANT — READ BEFORE STARTING
This phase is scoped as a **functional MVP**: view active conversations, take over from the AI, send a manual reply, release back to automatic mode. It is not a full omnichannel support-desk product — don't over-build.
- Do **not** rebuild the WhatsApp channel adapter or orchestrator from Phase 13 — this phase sits on top of the conversation-state table already introduced there.
- Do **not** build ticketing, canned responses, multi-agent assignment, or SLA tracking — explicitly out of scope for this MVP.
- Before writing any code: inspect the `whatsapp_conversations` (or equivalent) table from Phase 13, confirm whether a `human_takeover` field was already added there (Phase 13 noted it as optional/cheap-to-add), and inspect how the WhatsApp webhook currently decides whether to let the AI respond. Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–13.

## 2. OBJECTIVE
Give clinic staff a simple Chat Inbox showing active WhatsApp conversations, where they can read the thread, take over from the AI for a specific patient conversation, send manual replies, and hand control back to the AI — all scoped correctly per clinic via RLS.

## 3. SCOPE

### A. Conversation state extension
- If not already present from Phase 13, add `human_takeover` (boolean, default `false`) to the conversation table.
- Add `last_message_preview` (text, truncated) and `unread_by_staff` (boolean) or equivalent fields to support a usable inbox list view — check what's minimally needed and don't over-model this.

### B. Webhook behavior change (small, precise edit to Phase 13's logic)
- In the WhatsApp webhook handler: before invoking the AI orchestrator for an incoming message, check `human_takeover` for that conversation. If `true`, **do not** call the AI — instead, store the incoming message and mark it unread for staff, and do not auto-reply at all (a human is expected to respond).
- If `false` (default), behavior is unchanged from Phase 13 — the AI responds as before.

### C. Chat Inbox UI (`/app/inbox` or similar)
- **Conversation list**: all active WhatsApp conversations for the clinic, showing patient name/number, last message preview, timestamp, unread indicator, and takeover status (AI-handled vs. human-handled).
- **Thread view**: selecting a conversation shows the full message history (patient + AI + any prior human replies), clearly distinguishing sender (patient / AI / staff member name).
- **Takeover control**: a clear "Take over this conversation" action that sets `human_takeover = true`. While in takeover mode, staff can type and send a message directly to the patient via the WhatsApp Cloud API (reuse the message-sending function built in Phase 13's dispatcher/channel adapter — don't build a second WhatsApp-sending path).
- **Release control**: a clear "Return to AI" action that sets `human_takeover = false`, so the AI resumes handling future messages in that thread.
- **RLS/permissions**: scoped via `clinic_members` — confirm whether all roles (owner/admin/staff) should have inbox access, or if this should be owner/admin only; per the base PRD's general pattern (staff typically handles day-to-day patient-facing work), staff access is likely appropriate here — flag back if uncertain rather than assuming.

### D. Notifications (optional, keep light)
- Consider a simple in-app indicator (e.g. a badge count on the Inbox nav item) for unread staff messages — real-time push notifications (browser push, etc.) are out of scope for this MVP unless trivially available from existing infrastructure.

## 4. DATABASE WORK REQUIRED
- Migration: extend the Phase 13 conversation table with `human_takeover`, `last_message_preview`, `unread_by_staff` (or equivalent) if not already present.
- Confirm message history storage: Phase 13 likely already logs inbound/outbound messages somewhere for conversation-state purposes — reuse that table for the thread view rather than creating a duplicate message log. If no persistent message history exists yet (only ephemeral state), add a `whatsapp_messages` table: `id, conversation_id, sender_type ('patient'|'ai'|'staff'), sender_user_id (nullable, for staff), content, sent_at`.
- RLS scoped via `clinic_members`.

## 5. DEFINITION OF DONE
- [ ] Chat Inbox lists all active conversations for the clinic, correctly scoped.
- [ ] Thread view shows accurate message history with clear sender attribution.
- [ ] Takeover correctly stops the AI from auto-responding to that conversation.
- [ ] Staff can send manual replies that actually reach the patient via WhatsApp.
- [ ] Release correctly resumes AI handling for future messages in that thread.
- [ ] Cross-tenant isolation verified — a user from a different clinic cannot see or act on this clinic's conversations.
- [ ] No duplicate WhatsApp-sending implementation — reuses Phase 13's message-sending function.

## 6. CONSTRAINTS
- Do not build ticketing, agent assignment, canned responses, or SLA/analytics features — MVP scope only.
- Do not duplicate the WhatsApp message-sending logic from Phase 13.
- Do not disable RLS.
- Do not change AI behavior/safety rules from Phase 5/6/13 — this phase only adds an on/off switch per conversation, it doesn't touch what the AI does when it is active.

## 7. PROCESS
1. Inspect Phase 13's conversation-state table and webhook logic; report findings before implementing.
2. Propose the exact schema additions and inbox UI structure before implementing.
3. Implement: migration (takeover/message-history fields) → webhook takeover check (small, precise edit) → Chat Inbox list view → thread view → takeover/release controls → manual reply sending (reusing Phase 13's sender).
4. Provide a verification checklist: start a WhatsApp conversation as a test patient, confirm it appears in the inbox; take over, confirm the AI stops responding and a staff reply reaches the patient; release, confirm the AI resumes; confirm a second test clinic's staff cannot see or act on this clinic's conversations.

Confirm your understanding and the Phase 13 schema/webhook audit back to me before writing code. Do not start Phase 15 (Manual Booking) — I'll provide that init prompt once this phase is verified.
