# FIX PROMPT — Widget: (A) Eliminate Long Text, Tabs/Buttons Only + (B) CRITICAL: AI Auto-Books Duplicate Appointment Instead of Rescheduling/Cancelling

## Priority order
Fix **Bug B first** — it's a data-integrity/safety issue (the AI is creating appointments the user didn't confirm). Bug A is a UX polish issue. Both must be fixed before this phase is considered done.

---

## Bug B (CRITICAL): User asks to cancel/reschedule → AI books an unrelated new appointment instead, without confirmation

### Observed behavior
User: *"i want to cancel previous appointment i want to change my schedule appointment"*
AI response: *"Your previous appointment was not found for rescheduling, so I have successfully booked a new Chemical Peel appointment for you on August 19, 2026, at 09:00 under the name Zimal Fatima."*

This is wrong in multiple serious ways:
1. The AI **silently created a brand-new appointment** the user never explicitly confirmed a time for — the user hadn't said "book 9am," they were asking to change an *existing* booking.
2. It claims the previous appointment "was not found" and then, instead of asking the user for clarification, **unilaterally decided to book a replacement** — this violates the core safety rule from Phase 5 ("never claim/create a booking without explicit confirmation from the user for that specific time").
3. The result is a clinic now has **two live appointments** for this patient (the original 1:30 PM Aug 18 booking, which was never actually cancelled, plus this new unconfirmed 9:00 AM Aug 19 one) — this is a real data-integrity problem, not just a conversational awkwardness.

### Step 1 — Diagnose
1. Check whether a `rescheduleAppointment` / `cancelAppointment` tool call was actually attempted by the model for this turn, or whether the model just generated a `createAppointment` call directly because it couldn't identify which appointment to reschedule.
2. Check how the orchestrator identifies "the previous appointment" — does it have any way to look up the user's existing appointment(s) in this conversation (e.g. by the patient name/phone/email captured earlier in the same session, or a stored `appointment_id` from the earlier successful booking in this conversation)? If not, that's the root gap — the AI has no reliable way to know *which* appointment to reschedule/cancel.
3. Confirm whether `rescheduleAppointment`/`cancelAppointment` tools (from Phase 5's tool list) were even invoked at all in this turn, or whether the model just fell back to `createAppointment` because it had no better option available to it.

### Step 2 — Fix
1. **Give the AI a reliable way to reference the current conversation's appointment(s).** After a successful booking within a session, retain the created `appointment_id` (and patient identity) in the conversation/session context, so a later "cancel/reschedule my appointment" in the same session can resolve unambiguously to that specific appointment — don't require the AI to guess or search broadly.
2. **Never auto-create a replacement booking as a fallback when reschedule/cancel intent is detected but the target appointment isn't confidently identified.** Instead, the AI must:
   - If exactly one appointment is identifiable in this session/context: ask the user to confirm which appointment ("You'd like to reschedule your Chemical Peel on Aug 18 at 1:30 PM — is that right?") before taking any action.
   - If no appointment can be confidently identified (e.g. a brand-new session with no prior booking in context): ask the user for identifying details (name and/or the date/time of the existing appointment) rather than silently booking something new.
   - Only after the user confirms which appointment, proceed with an actual `cancelAppointment`/`rescheduleAppointment` tool call — never substitute a fresh `createAppointment` call as a stand-in for a reschedule/cancel request.
3. **Strengthen the system prompt's safety rules** (extending Phase 5's existing rules) with an explicit instruction: *"Never create a new appointment as a substitute when the user is asking to cancel or reschedule an existing one. If the existing appointment cannot be identified, ask the user for clarification instead of taking any booking action."*
4. **Add a code-level guard**, not just a prompt instruction: if the detected user intent is reschedule/cancel (this can be inferred from the tool the model attempts to call, or from a lightweight intent check before allowing `createAppointment` to fire), and the model's next action is `createAppointment` instead of `rescheduleAppointment`/`cancelAppointment`, block it and force a clarifying question instead. Don't rely on prompt wording alone for something this consequential.

### Step 3 — Clean up the bad data created during testing
- Manually cancel/delete the erroneous duplicate appointment created for "Zimal Fatima" on Aug 19 at 9:00 AM from the database (or via the dashboard's appointment actions), since it was created incorrectly during this test.

### Step 4 — Re-test
1. Book an appointment through the widget, then in the same session say "I want to reschedule/cancel that appointment" — confirm the AI correctly identifies the existing appointment, asks for confirmation, and only then calls the real reschedule/cancel tool (verify on `/app/calendar` that the original appointment was actually modified/cancelled, not duplicated).
2. Test rescheduling to a new time the user picks — confirm it updates the *same* appointment record (same `id`), not a new one.
3. Test in a fresh session with no prior booking context — say "cancel my appointment" — confirm the AI asks for identifying details instead of inventing or booking anything.
4. Confirm double-booking protection (`checkSlotAvailability`) still applies to the new time when rescheduling.

---

## Bug A: Responses are too long — should be tabs/buttons only, minimal text

### Fix required
1. Tighten the system prompt further: for every turn where a structured component (service list, date picker, time slots, confirmation) is shown, the AI's text must be reduced to a single short line — e.g. just "Here are our services:" / "Here are the available times:" — with **zero** restated details (no per-service descriptions, no full date/time lists spelled out in text, since the buttons already show this).
2. The AI should still write normal, full sentences only for turns with **no** attached component (e.g. general FAQ answers, the plain question asking for the user's name, clarifying questions from the Bug B fix above).
3. Re-test the full flow (services → select service → date → time → name → confirm) and confirm each step shows only a short prompt line plus the relevant buttons/cards — no long paragraphs duplicating what's already visible as tappable UI.

## Constraints (both bugs)
- Do not weaken or remove the double-booking/availability checks while fixing this.
- Do not fix Bug B by simply making the AI refuse all reschedule/cancel requests — it must still be able to actually perform them correctly, just never as an unconfirmed side-effect substitution.
- Keep the fix for Bug A scoped to text verbosity — don't reduce the actual information available to the user, just stop repeating it outside the structured components.

Report back: how appointment identity is now tracked across a session (Bug B fix), confirmation that the erroneous test appointment was cleaned up, and the Bug A re-test results (screenshots or transcript of a full, minimal-text booking flow).
