# INIT PROMPT — MedBook AI
## Phase 10: Doctor Management & Multi-Doctor Availability
**Reference documents:** Base PRD (Phases 1–9, already implemented) + `PRD-Feature-Expansion-v1.1.md` Section 4.1
**Target tool:** OpenCode
**Prerequisite:** Phases 1–9 complete and verified. This is the first phase of the Feature Expansion Addendum.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is an **extension of the existing, fully-built project** — not a new build.
- Do **not** rebuild, replace, or unnecessarily refactor any existing functionality from Phases 1–9.
- Do **not** create a new project or a parallel appointments/services system.
- Today's implicit assumption across the whole app is **one doctor = the clinic owner**. This phase generalizes that to **one or more doctors per clinic**, while guaranteeing every existing single-doctor clinic continues to work exactly as before, unchanged.
- Before writing any code: inspect the existing `clinics`, `clinic_members`, `services`, `availability_rules`, and `appointments` tables/logic, and the existing `checkSlotAvailability()` function from Phase 3. Report findings before implementing — this phase's correctness depends on understanding exactly how that function currently resolves availability.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–9. This phase touches core booking logic (`checkSlotAvailability`) — treat changes here with the same care as the original double-booking-protection work in Phase 3, since a bug here silently breaks every booking channel (dashboard, AI widget, and soon WhatsApp).

## 2. OBJECTIVE
Let a clinic have multiple doctors, each with their own profile, optional individual availability, and optional service assignment — while every single-doctor clinic already using the product keeps working unchanged (backward-compatible by default).

## 3. SCOPE

### A. `doctors` table and management UI
```
doctors: id, clinic_id, user_id (nullable — a doctor may not have a login account),
         name, specialty, credentials (jsonb — degrees/certifications, simple string array is fine),
         photo_url, consultation_fee, is_visible (boolean, default true),
         created_at, updated_at
```
- Dashboard UI (e.g. `/app/doctors`, or a "Doctors" tab alongside Services per the addendum's UI pattern): list, add, edit, remove doctors. Photo upload reuses the existing Supabase Storage pattern already established in Phase 7 (website images) — same bucket-security discipline (owner/admin write, appropriately scoped read).
- `is_visible` controls whether that doctor is offered for selection on the AI widget, website, and (later) WhatsApp — an invisible doctor still exists in records (e.g. for historical appointments) but isn't offered for new bookings.
- RLS: same established `clinic_members`-scoped pattern.

### B. Doctor-specific availability (backward-compatible extension)
- Add a **nullable** `doctor_id` column to `availability_rules`.
  - `doctor_id IS NULL` = clinic-wide default hours (this is the existing behavior from Phase 2 — every current clinic's data stays exactly as-is, interpreted as "applies to all doctors" going forward).
  - `doctor_id IS NOT NULL` = that specific doctor's hours override the clinic default for slot calculation involving them.
- Add the same nullable `doctor_id` to `blocked_times` (a specific doctor's day off vs. a clinic-wide closure).
- UI: extend the existing Availability page (Phase 2) with an optional doctor selector — "Set hours for: [Clinic default ▾ / Dr. X ▾]" — editing clinic-default hours behaves exactly as it does today; selecting a specific doctor edits/creates rows scoped to that `doctor_id`.

### C. Doctor-service association (optional, backward-compatible)
- Add a **nullable** `doctor_id` to `services`.
  - `NULL` = any doctor can perform this service (current behavior, unchanged for existing clinics).
  - Set = this service is specifically tied to that doctor (e.g. a specialist-only procedure).
- Services UI (Phase 2) gets an optional "Doctor" field on the service form — omit it and nothing changes from today's behavior.

### D. CRITICAL: Extend `checkSlotAvailability()` correctly
This is the highest-risk part of this phase — it's the shared function AI booking (Phase 5), widget booking (Phase 6), dashboard booking (Phase 3), and future WhatsApp/manual booking (Addendum Phases 13/15) all depend on.
1. Add an optional `doctorId` parameter.
2. Resolution logic when `doctorId` is provided: use that doctor's specific `availability_rules`/`blocked_times` if any exist for them; if none exist for that doctor, fall back to the clinic-wide default (`doctor_id IS NULL` rows) — a doctor with no custom hours set simply follows clinic defaults, don't force clinic admins to configure every doctor individually if they don't need to.
3. Resolution logic when `doctorId` is omitted (current single-doctor call pattern, used by any code not yet updated to pass a doctor): behave **exactly as today** — use clinic-wide default rules only. This guarantees zero behavior change for every existing single-doctor clinic and any code path not yet touched by this phase.
4. Double-booking check must also be scoped correctly: two different doctors can have appointments at the same clinic at the same time (that's fine); the same doctor cannot be double-booked.
5. Write focused tests/manual verification for: single-doctor clinic (no doctors table entries at all, or one doctor with no custom hours) behaves identically to before this phase; a doctor with custom hours correctly overrides clinic defaults; a doctor with no custom hours correctly falls back to clinic defaults; two doctors can be booked simultaneously; the same doctor cannot be double-booked.

### E. Downstream integration touchpoints (update, don't duplicate)
- **Appointment creation** (Phase 3 dashboard, Phase 5 AI tool `createAppointment`, Phase 6 widget): add an optional doctor selection step where relevant. For a clinic with only one doctor (or zero doctor records — treat as implicit single default), skip doctor selection entirely and behave exactly as today — don't force a doctor-selection UI step on clinics that don't need it.
- **AI tools** (`getAvailability`, `createAppointment`, etc. from Phase 5): extend their parameters to optionally accept/return doctor info, and update the system prompt so the AI asks "which doctor" only when a clinic actually has more than one visible doctor for the relevant service.
- **Calendar** (Phase 3): if a clinic has multiple doctors, consider a simple filter/color-coding by doctor (nice-to-have, don't over-build — a basic filter dropdown is sufficient for this phase).
- **Website Builder** (Phase 7): the "About" section's doctor profile currently assumes one doctor — decide with me whether this phase should extend it to show multiple doctors or leave single-doctor-focused for now (flag this back rather than assuming — it may be reasonable to defer multi-doctor website display to a later phase since it's presentational, not core booking logic).

## 4. DATABASE WORK REQUIRED
- Migration: `doctors` table (RLS scoped via `clinic_members`).
- Migration: add nullable `doctor_id` to `availability_rules`, `blocked_times`, `services`, `appointments` (appointments needs to record which doctor was booked, even for single-doctor clinics going forward, for consistency and future reporting — nullable/backfill-safe).
- Confirm indexes: `doctor_id` on all of the above where added, for query performance.

## 5. DEFINITION OF DONE
- [ ] `doctors` CRUD works, RLS-scoped, photo upload works.
- [ ] `is_visible` correctly hides/shows a doctor from booking surfaces without deleting their record.
- [ ] Doctor-specific availability/blocked-times work and correctly fall back to clinic defaults when unset.
- [ ] Doctor-specific service association works and defaults to "any doctor" when unset.
- [ ] `checkSlotAvailability()` extended correctly and verified against all five test cases in Section 3D.
- [ ] Existing single-doctor clinics (Phases 1–9's test clinic, e.g. MediFlow) continue to work with zero behavior change if no doctors are added.
- [ ] Dashboard booking, AI tool-calling, and widget booking all correctly support optional doctor selection without breaking single-doctor flows.
- [ ] Cross-tenant isolation verified for the new `doctors` table and doctor-scoped availability.

## 6. CONSTRAINTS
- Do not make `doctor_id` required anywhere — every new field is additive/nullable, and single-doctor clinics must be unaffected.
- Do not build the full multi-doctor website display, WhatsApp integration, or queue/token system — those are separate addendum phases.
- Do not disable RLS.
- Do not duplicate `checkSlotAvailability()` logic — extend the one existing function; if any booking pathway (dashboard/AI/widget) currently has its own separate availability-checking logic instead of calling the shared function, that's a pre-existing issue worth flagging to me, not something to silently duplicate further.

## 7. PROCESS
1. Inspect current `checkSlotAvailability()` implementation and all its call sites; report exactly how it currently resolves availability before proposing the extension.
2. Propose the exact migration set and the `checkSlotAvailability()` signature change before implementing.
3. Implement: migrations → `doctors` CRUD + photo upload → doctor-specific availability UI extension → doctor-service association → `checkSlotAvailability()` extension (with the 5 test cases run manually) → dashboard/AI-tool/widget doctor-selection integration → calendar filter (basic).
4. Provide a verification checklist covering: the existing single-doctor test clinic still books correctly with zero doctors added; add a second doctor with custom hours, confirm their slots differ correctly from clinic defaults; confirm the same doctor can't be double-booked while two different doctors can be booked at the same time; confirm AI booking asks for doctor choice only when >1 visible doctor exists; confirm cross-tenant isolation for the new tables.

Confirm your understanding and the `checkSlotAvailability()` audit findings back to me before writing code. Do not start Phase 11 (Notification Dispatcher) — I'll provide that init prompt once this phase is verified.
