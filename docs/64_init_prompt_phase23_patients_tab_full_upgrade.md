# INIT PROMPT — MedBook AI
## Phase 23: Patients Tab — Full Split-Pane Directory, Complete Profile, AI Summary, Documents & Inline Queue Integration
**Target tool:** OpenCode
**Reference files (exact visual/structural source of truth — memorized from earlier analysis):** `Patients_queue_html_css.txt`, `Write_Prescription_html_css.txt`, the Doxmate queue transcript.
**Design authority:** `design_system_profile.json` — use MedBook AI's own primary color everywhere; the reference files' own colors are structure/layout references only, not a color source.
**Reference documents:** Phase 4 (Patients CRM — already built: search/filter/sort/pagination, basic profile), Phase 17 (vitals), Phase 18 (consultation/prescription — Write Prescription screen already largely matches this reference), Phase 5 (AI orchestrator).

---

## 0. HOW TO USE THIS PROMPT
This is a **big, multi-part build**. Follow the numbered steps below **in order**. After each step, briefly confirm it works before moving to the next — do not attempt everything in one pass. Reuse everything already built (Phase 4's search/list, Phase 17's vitals, Phase 18's prescriptions) — this phase's job is to **assemble these into one unified, richer Patients experience**, not rebuild any of them from scratch.

Before Step 1, audit and report:
- The current Patients page layout (is it already split-pane, or a simple list + separate profile page?).
- The current patient profile's existing tabs/sections (from Phase 4).
- Confirm Phase 18's Write Prescription screen/component (it should already closely match `Write_Prescription_html_css.txt` — confirm this and reuse it, don't rebuild).
- Confirm Phase 17's vitals data and Phase 18's prescription data are queryable per-patient (not just per-visit) — this phase needs a patient's **full history** across all visits, not just their current/most recent one.

---

## STEP 1 — Convert the Patients Page to a Master-Detail Split-Pane Layout
- Left Pane (~30–35% width, min-width ~360px, independently scrollable): the patient directory/list (Phase 4's existing search/filter/sort, restyled into this pane).
- Right Pane (~65–70% width, flex-grow): the active patient's full profile, loading dynamically when a patient is selected on the left — **without losing the left list's scroll position or navigating away from the page** (a true split-pane, not a page navigation to `/patients/[id]`).
- On mobile/narrow viewports: the reference notes the list panel is hidden when a detail view is open (`.patient-list-panel { display: none }` at ≤768px) — implement an equivalent responsive pattern: list view by default on mobile, tapping a patient shows the detail view full-width with a clear "back to list" affordance.
- URL should still reflect the selected patient (e.g. `/app/patients?id={patientId}`) so the view is bookmarkable/refreshable, per the reference's state-sync pattern — reuse whatever URL-state pattern is already established elsewhere in this project.

## STEP 2 — Left Pane: Patient Directory (extend Phase 4, restyle into this pane)
- Header: "Patients" title + **"Add Patient"** primary button (reuse Phase 4's existing add-patient action).
- Search input: "Search name or phone..." (reuse Phase 4's exact existing search logic — do not duplicate).
- KPI stats row (3 small cards): **Total** (real count), **New This Month** (real count of patients created this calendar month), **Today** (real count of patients checked in today, per Phase 17's `visits` data).
- Sub-tabs: **Today** | **All Patients**.
- Under "All Patients," segment filter pills: **All** | **Returning** | **First Visit** (a "Returning" patient = has more than 0 prior completed visits; "First Visit" = 0 prior visits — compute this from real `visits`/`appointments` history, don't guess or hardcode).
- Patient cards (scrollable list): circular initial-badge avatar, bold name, meta sub-text (gender initial + registration date + patient ID, e.g. "F · 30 Aug 2026 · CLI-2026-00001"). Clicking a card sets it as selected/active (highlighted) and loads it into the right pane.

## STEP 3 — Right Pane: Profile Header
- Large circular initials avatar.
- Patient name (bold) + a dynamic colored status pill: **"First Visit"** or **"Returning"** (per Step 2's real computed logic).
- Meta row: "Patient since {real registration date}", gender, UHID (Patient ID — reuse whatever format was already reconciled in an earlier phase, e.g. `CLI-YYYY-XXXXX` — do not introduce a second inconsistent format), phone number.
- Action buttons (top-right): **"Edit"** (opens the existing Phase 4 patient-edit flow), and — **only when this patient currently has an active/waiting visit today** (per Phase 17's `visits` table) — also show **"Write Prescription"** and a solid green **"Start Consultation"** button (see Step 8 for this integration).

## STEP 4 — Profile Tab Manager
Horizontal tab row with an active underline indicator (teal): **Visit History | Health Info | Vitals | Prescriptions | Documents | All Appointments**.
- Switching tabs swaps only the lower content area — the header (Step 3) stays fixed/visible.

## STEP 5 — "Visit History" Tab (default/first tab)
Two-column layout within this tab:
- **Left (~60% width): AI Patient Summary** card — subtle indigo/purple-tinted (or MedBook AI's own subtle teal-tinted equivalent) bordered container, title "AI Patient Summary", "Auto-generated" badge, and a refresh/reload icon.
  - **Logic**: if this patient has zero recorded consultations/visits, show the fixed message: *"Summary will be available after consultation history is created."* — do not call the AI for this case.
  - If the patient has one or more real consultations, call the AI (reuse Phase 5's `AIProvider`/`GeminiProvider` abstraction — do not create a second AI integration) with the patient's real historical vitals, diagnoses, prescribed medicines, and doctor notes (from Phase 17/18), and render the model's returned structured bulleted summary of clinical progression.
  - The refresh icon re-triggers this summary generation on demand (`GET`/action equivalent to `/api/patients/{id}/ai-summary`, per the reference's described endpoint — adapt to this project's existing API/action conventions).
  - Below the AI Summary: a **Timeline** of past visits (date, doctor, diagnosis snippet) — or, if zero visits exist, an empty state: calendar/folder icon, "No visits recorded yet," subtext "Start a consultation to begin recording visit history."
- **Right (~40% width): Basic Health Info** card — Patient ID, Blood Group, Height/Weight (most recent recorded vitals, per Phase 17), Allergies (from Phase 18's prescription "Past History"/allergies field if captured there, or "No allergies recorded" if none), Current Meds (most recently prescribed active medicines, or "None").

## STEP 6 — "Health Info" Tab
- A more detailed version of the Basic Health Info card's data (Blood Group, allergies, conditions/past history — reuse the "Conditions"/"Past History" concept visible in the Write Prescription reference if that data is captured there) — editable here if it isn't editable elsewhere, or a clear pointer to where it's edited (e.g. during a consultation) if it's consultation-entered data rather than directly patient-editable.

## STEP 7 — "Vitals" Tab
- A chronological list/table of this patient's real recorded vitals across all their visits (Phase 17's `vitals`/`doctor_vitals_config`-shaped data) — most recent first. Reuse the exact vitals field set already established (Height/Weight/BMI/BP/Pulse/Temp/SpO2/Respiratory Rate, per whatever doctor-specific configuration applied to each visit).
- Empty state if no vitals recorded yet.

## STEP 8 — "Prescriptions" Tab
- List of this patient's past prescriptions (Phase 18's `prescriptions` records), each showing date, doctor, diagnosis, and a way to view/print/reprint that specific prescription (reuse Phase 18's existing print-preview).
- Empty state if none exist yet.

## STEP 9 — "Documents" Tab
- A dashed-border upload dropzone card: "No documents yet" placeholder + **"Upload Document"** primary button/link.
- Clicking Upload opens the native file picker; on selection, upload to Supabase Storage (reuse the established storage pattern from earlier phases — e.g. Website Builder's gallery uploads, or Phase 20's doctor-signature uploads), record the file (patient-scoped: `id, patient_id, file_path, document_name, uploaded_at`), and add it to this tab's list immediately (no full page reload).
- Each uploaded document in the list should be viewable/downloadable and deletable (owner/admin/staff per the established role permissions).

## STEP 10 — "All Appointments" Tab
- A simple table/list of every appointment this patient has ever had (all statuses, all booking sources) — reuse the existing appointments-fetching logic (Phase 3/17), filtered by `patient_id`, paginated if the list is long (reuse Phase 4's established pagination pattern).

## STEP 11 — Inline Queue Integration (the key new connective feature)
This is what ties the Patients tab to the live Appointments queue (Phase 17/18):
- When viewing a patient who currently has a `waiting` or `checked_in` visit today, the profile header (Step 3) shows their live status inline: e.g. "Today · Token #{N} · Waiting" (per the reference's `"Today · Token #1"` / `"Waiting"` text elements).
- If this patient is the **currently-eligible first-in-queue** patient (per Phase 17's queue-position logic), show the **"▶ Start Consultation"** button here too — clicking it triggers the exact same Phase 18 consultation-start transition as the Doctor Waiting List page, just accessible from this patient's own profile as a convenience. Do not duplicate that transition logic — call the same function.
- If this patient has no active visit today, simply don't show these queue-specific elements — the profile behaves as a normal historical record view.
- "Write Prescription" (Step 3) opens Phase 18's existing Write Prescription screen for this patient's current/active visit, exactly matching `Write_Prescription_html_css.txt`'s reference layout (which should already be built from Phase 18 — confirm, don't rebuild) — including its "← Back to Patients" breadcrumb correctly returning here to this split-pane view rather than to a different Appointments-context page.

## 3. DATABASE WORK REQUIRED
- Migration: `patient_documents` — `id, patient_id, clinic_id, file_path, document_name, uploaded_by_user_id, uploaded_at` (Step 9), RLS scoped via `clinic_members`.
- No other new tables expected — this phase primarily assembles/surfaces existing Phase 4/17/18 data into one richer view.
- Confirm/add an AI-summary caching approach if regenerating on every profile view would be wasteful (e.g. store the last-generated summary + timestamp, only regenerate on explicit refresh-icon click or when new visit data exists since the last generation) — propose this before implementing to avoid unnecessary AI API calls/costs.

## 4. DEFINITION OF DONE
- [ ] Patients page is a true split-pane (list + detail), URL-syncable, responsive on mobile.
- [ ] Left pane: search, KPI stats, Today/All Patients tabs, Returning/First Visit filters — all real data.
- [ ] Right pane header shows real patient info, correct First Visit/Returning status, and conditionally shows Write Prescription/Start Consultation only when a real active visit exists today.
- [ ] All six profile tabs (Visit History, Health Info, Vitals, Prescriptions, Documents, All Appointments) implemented with real data and correct empty states.
- [ ] AI Patient Summary correctly shows the "not yet available" message for zero-visit patients and a real, AI-generated summary (reusing Phase 5's provider) for patients with visit history.
- [ ] Document upload works end-to-end (upload → storage → list update, no reload).
- [ ] Start Consultation from this page calls the exact same Phase 18 function as the Doctor Waiting List — verified, not duplicated.
- [ ] Write Prescription opens the existing Phase 18 screen correctly, with correct back-navigation.
- [ ] All colors use MedBook AI's own palette.
- [ ] Zero regression to Phase 4/17/18's existing functionality.

## 5. CONSTRAINTS
- Do not duplicate Phase 4's search/list logic, Phase 17's vitals logic, Phase 18's prescription/consultation-start logic, or Phase 5's AI provider — this phase assembles and surfaces them, it doesn't reimplement them.
- Do not call the AI summary endpoint for patients with zero visit history.
- Do not fabricate a patient-ID format inconsistent with whatever was already established in an earlier phase.
- Do not disable RLS.

## 6. PROCESS (do this in order, confirming each step before moving on)
1. Complete the Section 0 audit and report findings.
2. Implement Step 1 (split-pane shell) and confirm it renders correctly with the existing patient list before adding anything else.
3. Implement Step 2 (left pane content) and confirm search/filters/KPIs work with real data.
4. Implement Step 3–4 (right pane header + tab manager shell, tabs initially empty) and confirm tab switching works.
5. Implement Steps 5–10 (one tab at a time — Visit History/AI Summary first since it's the most complex, then Health Info, Vitals, Prescriptions, Documents, All Appointments), confirming each tab independently before moving to the next.
6. Implement Step 11 (inline queue integration) last, since it depends on everything above being stable.
7. Provide a final verification checklist covering every Definition of Done item, testing with at least: a patient with zero visits (confirm correct empty states throughout), a patient with real visit/vitals/prescription history (confirm AI summary and all tabs show correct real data), and a patient currently in today's waiting queue (confirm the inline Start Consultation/Write Prescription integration works correctly and doesn't duplicate logic).

Confirm your Section 0 audit findings back to me before starting Step 1.
