# INIT PROMPT — MedBook AI
## Phase 11: Notification Dispatcher (Multi-Channel Abstraction)
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.2
**Target tool:** OpenCode
**Prerequisite:** Phase 10 (Doctor Management) complete and verified.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is a **refactor phase with no new user-facing functionality yet** — the goal is to make Phase 8's existing Resend email-sending code reusable for future channels (WhatsApp in Phase 13, SMS reserved for later), without changing any current behavior.
- Do **not** rebuild Phase 8's email templates or email-sending logic — wrap/reuse them.
- Do **not** implement WhatsApp or SMS sending in this phase — only build the interface/abstraction and the email implementation behind it.
- Before writing any code: inspect every place in the codebase that currently sends an email (appointment confirmation/cancellation/reschedule, billing emails from Phase 8, auth emails if custom-built). List every call site — this determines what needs to be routed through the new dispatcher.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–10. This mirrors the exact discipline already applied to the `AIProvider`/`GeminiProvider` abstraction in Phase 5 — same pattern, applied to notifications instead of AI.

## 2. OBJECTIVE
Introduce a single `notifyPatient()` function that all patient-facing (and clinic-facing, where applicable) notifications flow through, with `channel` as an explicit parameter. Today only `email` is implemented (wrapping existing Resend logic, unchanged output/behavior). This sets up Phase 13 (WhatsApp reminders) to be a clean addition rather than a redesign.

## 3. SCOPE

### A. Define the dispatcher interface
```ts
type NotificationChannel = 'email' | 'whatsapp' | 'sms';

type NotificationType =
  | 'appointment_confirmation'
  | 'appointment_cancellation'
  | 'appointment_reschedule'
  | 'appointment_reminder'
  | 'new_appointment_notification'   // clinic-facing: doctor/staff notified of new booking
  | 'payment_submitted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'subscription_expiring';

type NotifyPatientInput = {
  clinicId: string;
  patientId?: string;        // optional for clinic-facing notification types
  recipientUserId?: string;  // for clinic-facing notifications to staff/owner
  channel: NotificationChannel;
  type: NotificationType;
  payload: Record<string, unknown>;  // type-specific data (appointment details, plan/amount, etc.)
};

async function notifyPatient(input: NotifyPatientInput): Promise<{ success: boolean; error?: string }>;
```
- Adjust naming/shape as needed to fit existing conventions, but keep the core idea: **one entry point, explicit channel, explicit type**.
- Internally, `notifyPatient()` dispatches to a channel-specific sender:
  - `channel: 'email'` → wraps the **existing** Phase 8 Resend logic exactly as it already behaves (same templates, same trigger conditions) — this phase must not change what emails look like or when they're sent, only how the sending call is invoked.
  - `channel: 'whatsapp'` → **stub only** in this phase: implement the function signature, have it log/no-op or return a clear "channel not yet available" result, since WhatsApp sending doesn't exist until Phase 13.
  - `channel: 'sms'` → same stub treatment, reserved for a later, unplanned phase.

### B. Migrate existing call sites (mechanical refactor, not a rewrite)
Go through every notification-sending call site found in the Section 0 audit (appointment lifecycle emails, billing emails from Phase 8, any others) and replace the direct Resend call with a call to `notifyPatient({ ..., channel: 'email', ... })`. The actual email content/template/trigger logic underneath should be untouched — only the entry point changes.

### C. Patient channel preference (schema, not behavior yet)
- Add `notification_preference` (enum: `email` | `whatsapp` | `both`, default `email`) and `whatsapp_number` (nullable) to `patients`.
- These fields are **not used to change routing behavior yet** in this phase (since WhatsApp isn't implemented until Phase 13) — just add them now so Phase 13 doesn't need another migration, and so the Patients CRM UI (Phase 4) can optionally expose a field to capture a patient's WhatsApp number during manual/AI booking if convenient (not mandatory this phase — flag if it's low-effort to add now vs. deferring to Phase 13).

## 4. DATABASE WORK REQUIRED
- Migration: add `notification_preference`, `whatsapp_number` to `patients` (nullable/default, backward-compatible).
- No new tables required for this phase — the dispatcher itself is a code-level abstraction, not a stored-config system (unless the audit reveals a genuine need, e.g. per-clinic notification toggles that don't already exist — report and confirm before adding).

## 5. DEFINITION OF DONE
- [ ] `notifyPatient()` (or equivalently named) function exists with the interface above.
- [ ] Every existing email call site from Phases 3, 4, 8 (appointment lifecycle, billing lifecycle) now routes through it with `channel: 'email'`.
- [ ] All existing email behavior is verified unchanged — same content, same trigger timing, same recipients as before this refactor.
- [ ] `whatsapp`/`sms` channels exist as defined-but-stubbed cases, not silently missing.
- [ ] `patients.notification_preference` / `whatsapp_number` fields added, backward-compatible, no behavior change yet.
- [ ] No regression in Phase 8 billing emails or Phase 3 appointment emails.

## 6. CONSTRAINTS
- Do not change any existing email template, copy, or trigger condition — this is a plumbing refactor only.
- Do not implement actual WhatsApp/SMS sending in this phase.
- Do not remove or bypass the existing Resend integration — wrap it.
- Do not add UI for notification preferences yet unless it's trivially cheap to add the field to an existing form — the primary deliverable is the backend abstraction.

## 7. PROCESS
1. Audit and report every current email-sending call site before touching code.
2. Propose the exact dispatcher interface (confirming/adjusting the shape above to fit existing type conventions) before implementing.
3. Implement: migration (patient fields) → dispatcher function + email channel implementation (wrapping existing Resend logic) → migrate all call sites → stub whatsapp/sms.
4. Provide a verification checklist: trigger every existing notification type (appointment confirmation/cancellation/reschedule, billing submitted/approved/rejected, subscription expiring) and confirm each still sends the correct email with correct content, now via the dispatcher; confirm calling `notifyPatient()` with `channel: 'whatsapp'` returns the expected stub result without crashing anything.

Confirm your understanding and the Section 0 call-site audit back to me before writing code. Do not start Phase 12 (WhatsApp Business Connection) — I'll provide that init prompt once this phase is verified.
