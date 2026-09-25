# INIT PROMPT — MedBook AI
## Phase 22: Edit Doctor/Service Profile (3-Tab Modal) + Pre-Consultation Questions (AI/WhatsApp-Wired)
**Target tool:** OpenCode
**Reference documents:** Phase 20 (Add Doctor), Phase 21 (Doctors page, Add Service), Phase 60-fix (Generate Slots) + reference screenshots (`t32`, `qs1`, `qs01`, `qs2`).
**Design authority:** `design_system_profile.json` — teal (`colorPalette.brand.primary`), not the reference's violet/blue.

---

## 0. IMPORTANT — READ BEFORE STARTING
This phase reuses almost everything already built in Phase 20/21/60 — it's an **edit-mode wrapper + one genuinely new feature (Pre-Consultation Questions)**, not a rebuild.

Before writing any code, audit:
1. The current "View Profile" (doctor grid card) and "view detail" (service) buttons — confirm their current end-state button (the user describes a "Done" button that needs replacing).
2. Confirm Phase 20's Add Doctor form fields, Phase 60's slot-generation component, and Phase 20's vitals-configuration component are each implemented as reusable components (not hardcoded only inside the "Add" modal) — this phase needs to mount the **same** components inside an **edit** context, pre-filled with the existing record's data. If they're currently only usable in "create" mode, refactor them to accept an optional existing-record prop/mode rather than duplicating the UI.
3. Confirm the exact current Phase 5/6/13 AI orchestrator system-prompt-assembly and WhatsApp-message-sending functions, since Pre-Consultation Questions must hook into them.
Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
1. Replace the doctor/service profile view's end-of-page action with an **"Edit Profile"** button + a **"Profile last updated: {date}"** timestamp.
2. Build the **Edit Doctor Profile** modal (and the equivalent **Edit Service** modal) as a **3-tab interface** (Details / Availability & Slots / Vitals Configuration — per `t32`), reusing Phase 20/60's existing components in edit mode, pre-filled with real data.
3. Build the new **Pre-Consultation Questions** feature: a toggle in the Details tab, and a dedicated configuration modal letting a doctor/service define up to 3 questions the AI should ask patients — either during WhatsApp booking or immediately after — wired into the real AI/WhatsApp conversation flow (Phase 5/6/13), with answers captured and linked to the appointment.

## 3. SCOPE

### A. Profile View — button change
- On the doctor (and service) detail/profile view, replace the current end-of-page "Done" button with **"Edit Profile"**, which opens the Edit modal (Section B).
- Below/near it, show **"Profile last updated: {real last-modified date, e.g. 9/22/2026}"** — pull from the record's real `updated_at` timestamp, formatted via the project's existing shared `datetime.ts` utility — never hardcode a date.

### B. Edit Doctor Profile Modal — 3 Tabs (per `t32`)
Header: icon + **"Edit Doctor Profile"**, subtitle **"Update {doctor name}'s information and availability"**, teal band, close "X". Below the header, a pill-style tab switcher: **Details | Availability & Slots | Vitals Configuration**.

**Details tab** — reuses Phase 20's Add Doctor field set exactly, pre-filled with the doctor's current real data, in this layout:
- Basic Information: Doctor Name*, Years of Experience*, Specialty* (with real current value, e.g. "Cardiology"), Qualification/Degree*, Consultation Fee (₹)*, Consultation Type (e.g. "Both"), Follow-up Fee (₹), Valid For, Period, and the **dynamic rule banner** (e.g. "Follow-up visits within 15 day(s) will be charged ₹1500.00 instead of ₹2000.00") — all reusing Phase 20's exact fields/logic, not rebuilt.
- Contact & Details: Email Address (optional), Phone Number (optional), **Registration/License Number (optional)** (confirm this matches Phase 20's "Medical Registration Number" field — same field, just relabeled here, don't create a duplicate), Title* (with real current value, e.g. "Cardiologist"), Professional Description (optional, 600-char counter, pre-filled), Doctor Signature (optional) — if a signature already exists, show a **Signature Preview** with **Replace** / **Remove** actions (per Phase 20's spec) instead of the empty upload dropzone.
- **NEW: Pre-Consultation Questions section** (per `qs01.JPG`) — a bordered card with icon + title "Pre-Consultation Questions", subtitle "Collect patient information before appointments", and a toggle switch (default **off**). When off: centered placeholder — icon, bold "Pre-consultation questions are disabled", subtext "Enable to collect patient information before appointments", and a **"Learn more about this feature →"** link. Toggling this switch on (or clicking "Learn more") opens the **Pre-Consultation Questions configuration modal** (Section C).

**Availability & Slots tab** — reuses Phase 60's fixed slot-generation component exactly, in edit mode, pre-filled with the doctor's existing configuration: "How do you see patients?" (One patient at a time / Multiple patients at once, showing the currently-selected mode), Select Working Days (existing selected days highlighted), "Same time slots for all selected days" checkbox, and per-day Time Range(s) + Slot Duration + Generate Slots + the existing generated slot list (showing real current slots, each editable/deletable) — title this section **"Update Availability & Slots"**.

**Vitals Configuration tab** — reuses Phase 20's vitals-configuration component exactly, in edit mode, pre-filled with the doctor's current selections: Basic Measurements (Height/Weight/BMI), Vital Signs (Blood Pressure/Pulse/Temperature/SpO2/Respiratory Rate) checkboxes reflecting current state, Custom Vitals list (or "No custom vitals configured" if none), "+ Add Custom Vital".

**Footer**: "Changes will be saved automatically" (left, with a checkmark icon) — this text describes the modal's UX intent; functionally, treat **"Update Doctor"** (right, primary teal) as the actual save/commit action, with **"Cancel"** (left of it) discarding changes and closing — confirm this interpretation makes sense given the codebase's existing save patterns, or implement genuine autosave-per-field if that's a cleaner fit; note which approach you took.

### C. Pre-Consultation Questions Configuration Modal (per `qs1.JPG`/`qs2.JPG`) — NEW FEATURE
Header: icon + **"Pre-Consultation Questions"**, subtitle **"Configure questions for {doctor/service name}"**, teal band, close "X".

**"When to Ask Questions?"** — two selectable cards:
1. **During Booking** ("Before confirmation") — "AI Assistant asks these questions via WhatsApp during the booking conversation, before confirming the appointment."
2. **After Booking** ("Via WhatsApp instantly") — "AI Assistant asks these questions via WhatsApp immediately after the appointment is confirmed."
(Selected card gets a highlighted border + checkmark, per the reference.)

**"Questions (N/3)"** with an **"+ Add Question"** button (top-right) — up to 3 questions maximum:
- Empty state: dashed border box, chat-bubble icon, "No questions added yet," "Add up to 3 questions to ask your patients," and an **"Add First Question"** button.
- Each added question row: a drag-handle (`⋮⋮`), a numbered badge (1/2/3), a text input (placeholder: "Enter your question... (e.g., What symptoms are you experiencing?)"), a character counter ("0/100"), a small emoji/smiley icon (purpose: likely a quick-insert of a friendly tone marker or an AI-suggestion trigger — confirm/report what this icon does if you can infer it from context; if its function can't be determined, implement it as a harmless decorative/placeholder affordance rather than guessing a fabricated behavior), and a delete (trash) icon.
- Drag-to-reorder changes question order/numbering.

**Footer**: "Configuration will be saved and activated" (left, checkmark icon), **Cancel** / **Save Configuration** (primary teal) buttons (right).

### D. Wire Pre-Consultation Questions into the Real AI/WhatsApp Flow (the part that makes this a real feature, not just a settings UI)
1. Store configuration: `pre_consultation_questions` — `id, doctor_id (nullable) or service_id (nullable, exactly one set), timing ('during_booking'/'after_booking'), question_text, display_order, active`.
2. **During Booking**: when the AI orchestrator (Phase 5/6/13) is progressing a WhatsApp booking conversation for a doctor/service that has active "during booking" questions, it must ask them (in order) as part of the conversation, before finalizing `createAppointment` — capture each answer.
3. **After Booking**: when an appointment is successfully created for a doctor/service with active "after booking" questions, trigger a follow-up WhatsApp message (via the Notification Dispatcher, Phase 11) asking these questions, and capture the patient's WhatsApp replies as answers linked to that appointment.
4. Store captured answers: `pre_consultation_answers` — `id, appointment_id, question_id, answer_text, answered_at`.
5. Surface captured answers somewhere useful — at minimum, visible to the doctor on the Phase 18 consultation screen (so the doctor sees the patient's pre-consultation answers before/during the visit) — this is the actual payoff of the feature; don't build the configuration UI without also making the answers usefully visible.
6. This must not break the existing, already-hardened AI safety rules and deterministic-vs-free-text handling established across Phase 5/6/13's stabilization work — asking a configured question is itself a scripted, deterministic step in the conversation (the AI reads the exact configured question text), not a new open-ended AI-improvisation point.

### E. Apply the Same Structure to Services
- Build the equivalent **Edit Service** modal with the same 3-tab pattern (Details / Availability & Slots / Vitals Configuration — omit Vitals Configuration if it genuinely doesn't apply to services, or keep it if services can also have doctor-independent vitals relevance; use judgment and note your decision), reusing Phase 21's Add Service fields and the same Phase 60 slot component.
- Include the same Pre-Consultation Questions toggle + configuration modal, scoped to `service_id` instead of `doctor_id` (per the schema in Section D.1) — same underlying feature, same AI/WhatsApp wiring, just attached to a service-based booking instead of a doctor-based one.
- Do not build a second, separately-implemented Pre-Consultation Questions system for services — same shared components/tables, just parameterized by doctor vs. service.

## 4. DATABASE WORK REQUIRED
- Migration: `pre_consultation_questions` and `pre_consultation_answers` (Section D.1/D.4), RLS scoped via `clinic_members`.
- No changes needed to Phase 20/21/60's existing doctor/service/slot schemas — this phase reuses them in edit mode.

## 5. DEFINITION OF DONE
- [ ] "Edit Profile" button + real "Profile last updated" timestamp replace the old "Done" button on both doctor and service profile views.
- [ ] Edit Doctor Profile modal shows all 3 tabs, each correctly pre-filled with real existing data, reusing Phase 20/60's exact components in edit mode (not duplicated).
- [ ] Pre-Consultation Questions toggle + configuration modal work exactly per the reference screenshots, with the 3-question limit enforced.
- [ ] Configured "During Booking" questions are genuinely asked by the AI during a real WhatsApp booking conversation, in order, before appointment creation.
- [ ] Configured "After Booking" questions genuinely trigger a real WhatsApp follow-up message via the Notification Dispatcher after a successful booking.
- [ ] Captured answers are stored and visible to the doctor on the Phase 18 consultation screen.
- [ ] The exact same Edit modal + Pre-Consultation Questions pattern is implemented for Services, sharing components/schema (parameterized by doctor vs. service), not duplicated.
- [ ] Zero regression to Phase 20/21/60's Add Doctor/Add Service flows or any existing AI/WhatsApp booking behavior.
- [ ] All colors use MedBook AI teal.

## 6. CONSTRAINTS
- Do not duplicate Phase 20/60's Details/Availability/Vitals components — reuse them in edit mode via a shared component with a create/edit mode prop.
- Do not build Pre-Consultation Questions as a settings-only feature with no real AI/WhatsApp wiring — the payoff (questions actually asked, answers actually captured and surfaced) is mandatory, not optional polish.
- Do not weaken any existing AI safety/deterministic-handling rule while adding this scripted-question step.
- Do not fabricate the small emoji/smiley icon's behavior if its purpose can't be reasonably inferred — implement it as inert/decorative and report this back rather than guessing a function that might mislead users.
- Do not disable RLS.

## 7. PROCESS
1. Report the Section 0 audit findings (current profile-view button, current reusability of Phase 20/60 components, current AI orchestrator/WhatsApp function signatures) before implementing.
2. Propose the shared create/edit component refactor approach and the AI-wiring approach for Pre-Consultation Questions before implementing.
3. Implement: profile-view button change → Edit modal shell (3 tabs) reusing existing components in edit mode → Pre-Consultation Questions schema + configuration modal → AI orchestrator wiring (during-booking scripted questions) → Notification Dispatcher wiring (after-booking follow-up) → answer capture + doctor-visible surfacing (Phase 18) → replicate the full pattern for Services.
4. Provide a verification checklist: edit an existing doctor's Details/Availability/Vitals and confirm all three tabs correctly load and save real existing data; configure 2 "during booking" questions for a doctor and complete a real WhatsApp test booking, confirming the AI asks both questions in order and captures the answers; configure an "after booking" question and confirm a real WhatsApp follow-up message is sent after booking, with the reply captured; confirm captured answers appear on the doctor's Phase 18 consultation screen for that appointment; repeat the core checks for a Service; confirm the "Profile last updated" timestamp reflects a real, correct date after saving an edit.

Confirm your Section 0 audit findings and your proposed component-reuse and AI-wiring approach back to me before writing code.
