# INIT PROMPT — MedBook AI
## Phase 21: Doctors Tab Page (Grid/List Views) + Upgraded "Add New Service" Modal (Slots & Multi-Patient Windows)
**Target tool:** OpenCode
**Reference documents:** Phase 20 (Add Doctor upgrade — availability slot generation, consultation modes) + this document's detail + reference screenshots (`t16`, `t22`, `t23`).
**Design authority:** `design_system_profile.json` — teal (`colorPalette.brand.primary`), not the reference's violet/blue.

---

## 0. IMPORTANT — READ BEFORE STARTING

**Coexistence note (do not remove anything yet)**: this project already has a simpler, existing "Add Service" flow (from Phase 2). That old flow is **not being removed in this phase** — removal is explicitly deferred to a later prompt. This phase builds the **new, detailed** Add/Edit Service experience specifically inside the **Doctors tab's "Services" toggle view** (per `t16`'s existing Doctors/Services segmented control at the top of the Doctors page, which the user confirms already exists and already works for switching between Doctor records and Service records in list view). Do not touch or remove the old standalone Services page/flow in this phase.

**Reconciliation with Phase 20**: Phase 20 introduced `doctors.consultation_mode` (`single_slot`/`shared_window`) with one clinic-wide `max_patients_per_window` per doctor. This phase's service-level detail reveals a **more precise, per-slot** capacity model: each individual generated/custom slot carries its **own** "Patient Limit" (e.g. one slot might allow 6 patients, another only 4). **This refines, not replaces, Phase 20's design** — treat "Patient Limit" as a **per-slot field**, not a single doctor/service-wide number. If Phase 20 was already implemented with only a single global cap, extend it now to per-slot capacity (migrate any existing shared-window doctor data to apply their existing global cap as the default per-slot value, so nothing breaks). Confirm this reconciliation approach before implementing.

Before writing any code, audit:
1. The current Doctors tab page — is the Doctors/Services toggle, grid view, list view (per `t16`/Image 2), search, and Filters already built? The user states these already exist — confirm exactly what's present vs. what still needs completing (per Section 1 below).
2. The current "Add Service" flow (old, Phase 2) and its data model (`services` table) — this phase's new modal must write to the same underlying `services` table (extended with new fields), not a parallel table.
3. Phase 20's `doctors.consultation_mode`/slot-storage implementation, to correctly extend it to per-slot capacity and to reuse the same slot-generation UI component for services (don't rebuild it a second time).
Report findings before implementing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from this project.

## 2. OBJECTIVE
1. Complete the Doctors tab page: grid view (doctor cards, per `t16`) and list/table view (per Image 2), both reflecting the Doctors/Services toggle already in place, with working Filters/Search and an "Add Doctor" entry point (Phase 20's modal).
2. Build the new, detailed "Add New Service" modal (within this same Doctors-tab Services view) with the full field set specified below, including the same availability/slot-generation and consultation-mode UI pattern as Phase 20 — reused as a shared component, not duplicated.

## 3. SCOPE

### A. Doctors Tab — Grid View (per `t16`)
Confirm/complete each doctor card:
- Circular avatar placeholder, doctor name (bold), specialty (as a colored/link-styled sub-label), years of experience with a calendar icon.
- **Rating** stat block (star icon + numeric rating — real value if a rating system exists anywhere in the project already, otherwise `0`/placeholder until a real rating source exists — do not fabricate ratings).
- **Patients** stat block (real count of distinct patients this doctor has seen, per `visits`/`appointments` linked to `doctor_id` — real query, not a placeholder).
- Working-days pills (Mon–Sun), with **active/working days highlighted** (`colorPalette.brand.primary` or success-tinted) and non-working days shown muted/grey — reflecting this doctor's real configured `availability_rules`/slot template from Phase 20.
- Footer row: **"View Profile"** button (left), and small icon actions — edit (pencil), an active/inactive toggle switch (maps to Phase 10's `is_visible`), and delete (trash) icon.
- A small colored dot/indicator (top-right of the card, per `t16`) reflecting the doctor's active/inactive status at a glance.

### B. Doctors Tab — List/Table View (per Image 2)
- Table columns: Doctor (avatar + name + specialty), Specialty, Experience, Rating, Fee, Availability (working-day pills, same highlighting as the grid view), Status (Active/Inactive pill), Actions (view/eye icon, edit/pencil icon, active toggle, delete/trash icon).
- Both grid and list views read from the same underlying doctor-list query — no duplicated data-fetching logic; the view toggle (icons near the top-right, per Image 2) only changes presentation.

### C. Search & Filters (Doctors view)
- Search input: "Search doctors by name, specialty, or phone..." — real, working search (reuse the same search-implementation pattern already established and fixed for Appointments/Patients in earlier phases — debounced, actually filters results).
- **Filters** dropdown — confirm what's already functional; at minimum should support filtering by Specialty and Active/Inactive status; extend if genuinely missing rather than leaving it decorative (same "must have real effect on the data" standard established in the Appointments Filters fix).

### D. Add New Service Modal — full field set
Header: icon + title **"Add New Service"**, subtitle **"Create a new service or lab test"**, teal header band, close "X".

**Basic Information:**
- Service Name* (existing field, Phase 2 — reuse).
- Duration / Report Time (optional) — for a lab test, this may represent turnaround time rather than an in-clinic duration; keep as a flexible text/number+unit field.
- Category* — dropdown (reuse or extend Phase 2's category concept if one exists, e.g. Consultation / Diagnostic / Lab Test / Procedure — confirm the real existing categorization before inventing new category values).
- Performed by Doctor (optional) — dropdown of the clinic's doctors (Phase 10), optional — a service need not be tied to a specific doctor (e.g. a lab test performed by any technician).
- Price (₹)* (existing, Phase 2 — reuse).
- Follow-up Fee (₹), Valid For (numeric), Period (Day(s)/Week(s)/Month(s)) — same pattern as Phase 20's doctor-level follow-up-fee fields; reuse that same UI sub-component if it was built as one, rather than rebuilding it here.

**Contact & Details:**
- Description* — textarea, 600-character limit with live counter, helper text "This description will be shown to patients" (matches Phase 20's professional-description pattern — reuse the same character-counter component).
- Preparation Instructions (optional) — textarea (e.g. "Fast for 8 hours before this test").

**Availability & Slots** (reuse Phase 20's slot-generation component exactly, applied here to a service instead of a doctor):
- "How do you see patients?" — **One patient at a time** / **Multiple patients at once** radio cards, identical UI/behavior to Phase 20.
- Select Working Days — same day-picker pills.
- Manage Time Slots — per selected day: "Add Slot" button, each slot row: Slot Name (editable, click-to-edit), Start Time, End Time, and — **new, per this phase's reconciliation** — a **Patient Limit** field (numeric, "Patients") shown **only when "Multiple patients at once" is selected** for this service, applying independently per slot (e.g. one slot capped at 6, another at 4).
- "+ Add Another Slot" link.
- Persist using the same slot-storage schema/approach decided in Phase 20 (extended per Section 0's reconciliation to store `patient_limit` per slot row, not just per doctor/service).

**Footer**: "🔒 All data is securely stored" (left), Cancel + **Add Service** (primary teal, right).

## 4. DATABASE WORK REQUIRED
- Extend `services` (Phase 2/3) with: `duration_or_report_time`, `category` (confirm/extend existing), `performed_by_doctor_id` (nullable FK to `doctors`), `follow_up_fee`, `follow_up_valid_for`, `follow_up_period`, `preparation_instructions`, `consultation_mode` (`single_slot`/`shared_window`, default `single_slot` — additive, existing services unaffected).
- Extend the Phase 20 slot-storage schema (whatever table/structure was decided there) with a nullable `patient_limit` per slot row, used when the parent doctor/service is in `shared_window` mode; make sure `checkSlotAvailability()`'s shared-window logic (Phase 20) now checks each slot's own `patient_limit` rather than a single global number, migrating any already-existing global cap into each slot as a sensible default.
- RLS consistent with existing `clinic_members`-scoped pattern.

## 5. DEFINITION OF DONE
- [ ] Doctors tab grid view matches `t16`'s card structure with real, non-fabricated data (rating, patient count, working days).
- [ ] Doctors tab list view matches Image 2's table structure, sharing the same underlying data query as the grid view.
- [ ] Search and Filters on the Doctors view are genuinely functional (real effect on displayed data).
- [ ] Add New Service modal implements the full field set above, reusing Phase 20's slot-generation component (not duplicated).
- [ ] Per-slot Patient Limit works correctly for shared-window services, and `checkSlotAvailability()` correctly enforces per-slot capacity.
- [ ] Existing single-patient-per-slot services are completely unaffected.
- [ ] Old, existing simple Add Service flow (Phase 2) is untouched/still present — not removed in this phase.
- [ ] All colors use MedBook AI teal — no reference violet/blue.
- [ ] Zero regression to Phase 10/17/18/20's doctor, vitals, or consultation functionality.

## 6. CONSTRAINTS
- Do not remove or alter the old, simpler Add Service flow — explicitly deferred.
- Do not duplicate the slot-generation/consultation-mode UI component — reuse the exact one built in Phase 20.
- Do not implement Patient Limit as a single global number if Phase 20 built it that way — refine to per-slot per this phase's reconciliation.
- Do not fabricate doctor ratings or patient counts — real data or an honest zero/placeholder.
- Do not disable RLS.

## 7. PROCESS
1. Report the Section 0 audit findings (current Doctors tab state, current Add Service flow/schema, current Phase 20 slot-storage/capacity implementation) before implementing.
2. Propose the exact per-slot Patient Limit migration approach and confirm the shared slot-generation component's reuse plan before implementing.
3. Implement: Doctors tab grid/list view completion → Search/Filters completion → `services` schema extension → per-slot Patient Limit extension to Phase 20's schema and `checkSlotAvailability()` → Add New Service modal (reusing the shared slot-generation component).
4. Provide a verification checklist: confirm grid and list views show identical, correct real data; confirm Search/Filters genuinely narrow results; create a new service in "single patient at a time" mode and confirm booking works as before; create a new service in "multiple patients at once" mode with different per-slot patient limits and confirm each slot correctly enforces its own cap; confirm an existing shared-window doctor from Phase 20 still works correctly after the per-slot migration; confirm the old Add Service flow still exists unaffected.

Confirm your Section 0 audit findings and your proposed per-slot Patient Limit migration approach back to me before writing code.
