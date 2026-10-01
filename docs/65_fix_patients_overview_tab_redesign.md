# FIX/REDESIGN PROMPT — Clean Up & Redesign the Patient Profile "Overview" Tab
**Target tool:** OpenCode
**Type:** UI/content cleanup on the existing Patients module's "Overview" sub-tab only — no changes to the patient header banner, the other tabs (History/Clinical/Medications/Documents/Appointments), or any other part of the app.
**Reference:** `vt1.png` (annotated screenshot) — X marks indicate elements to remove; the circled "Latest Vitals" 4-card grid is the **visual reference** for how the new vitals cards should look (icon in a colored circle, label, large bold value, unit) — not its exact position, which changes per this spec.

---

## 0. IMPORTANT — READ BEFORE STARTING
- Do **not** touch the top global header, sidebar, or the patient profile's header banner (avatar, name, First Visit/Returning badge, age/gender/phone/UHID, allergy pill, "Last seen," Merge Duplicate/Edit Patient buttons) — all of that is already correct and out of scope.
- Do **not** touch the History, Clinical, Medications, Documents, or Appointments tabs — this task is scoped **only** to the "Overview" tab's content area.
- Before writing any code, audit the current Overview tab implementation and report:
  1. The current "Basic Health Info" card's exact structure (the user has flagged it as messy/duplicated — e.g. showing UHID twice, vitals shown in two separate places "Last Encounter" and "Vitals Grid").
  2. Whether "Known Allergies" and "Medical Conditions" already exist as simple text fields on `patients` (from an earlier phase) — reuse these exactly for the new Critical Safety Alerts section; do not build a new structured clinical-data model.
  3. Where the most recent check-in vitals data currently lives (from the Phase covering check-in vitals capture) and confirm it includes or can be extended to include Blood Sugar.
  4. Whether an AI Patient Summary component/endpoint already exists (from the Patients-tab AI summary work) — reuse it exactly, do not rebuild.
  Report all findings before implementing.

## 1. OBJECTIVE
Replace the current Overview tab's cluttered, duplicated layout with a clean two-column layout: a simplified **Basic Information** card on the left, and an **AI Patient Summary** card followed by a **Today's Vitals** card grid on the right — removing everything redundant or unnecessary (old duplicate info, Recent Visit, Next Appointment, Notes, Documents).

## 2. SCOPE

### A. Left Column — "Basic Information" card (simplified)
Show only:
- **Critical Safety Alerts** — a prominent alert banner at the top of this card surfacing the patient's real, already-stored **Known Allergies** and **Medical Conditions** (reuse the existing simple text fields — do not create new structured clinical fields). Style as a clear, high-contrast warning banner (e.g. red/orange accent) when either field has real content; show nothing or a muted "No known allergies/conditions" note if both are empty — never fabricate.
- **Blood Group** (existing field).
- **Height / Weight** — show both real values plus a computed **BMI** (e.g. "165 cm · 65 kg · BMI 23.88") — compute BMI from real height/weight, do not store it as a separate manually-entered field if it can be derived.
- **Current Medications** — show only the **names** of medications from the patient's most recent **active** prescription (reuse Phase 18's prescription data) — no dosage/route/frequency detail here; note (or link) that full detail is available in the Medications tab.

Remove entirely from this card (and from the Overview tab generally): Patient ID, Full Name, Age/Gender (already shown in the header banner above — do not repeat them here).

### B. Right Column
1. **AI Patient Summary** (top) — reuse the existing AI summary component/logic exactly (from the Patients-tab AI integration work): show **"No summary has been generated for this patient."** when no summary exists yet, or a real, concise **2-line** summary of the patient's last visit for the doctor when one has been generated — do not fabricate summary text, and do not call the AI unnecessarily if a cached summary already exists.
2. **Today's Vitals** (directly below AI Summary) — a grid of **individual cards, one per vital**: **Blood Pressure, Temperature, Pulse, SpO2, Blood Sugar** — these are the vitals recorded by the receptionist at this patient's most recent check-in (reuse the existing check-in vitals data; if Blood Sugar isn't currently part of the captured vitals set, add it as an additional optional vitals field, consistent with however the existing vitals capture form is structured). Each card: icon in a colored circle (top), vital label, large bold value, unit below/beside the value — matching the visual style of the reference's circled "Latest Vitals" grid. If a specific vital wasn't recorded, show a clear empty/dash state for that card rather than omitting it or fabricating a value.

### C. Remove Entirely From the Overview Tab
- The old "Recent Visit" card.
- The old "Next Appointment" card (this is redundant with the "Next Appointment" summary already shown in the header banner area).
- The "Notes" section.
- The "Documents" section (including the "Drop a file here / Upload Document" dropzone) — Documents already has its own dedicated tab; do not show it here too.
- The old messy "Basic Health Info" structure in its entirety (the version showing UHID repeated, "Last Encounter" vitals, and a separate duplicate "Vitals Grid") — this is being fully replaced by Section A + B above, not kept alongside them.

## 3. DESIGN REQUIREMENTS
- Clean, modern, professional, **compact**, high-contrast — reuse this project's existing design tokens (`design_system_profile.json`/`design.md`: primary teal, established card radius/padding/typography scale) exactly as used elsewhere in the app (e.g. the Dashboard's stat-card pattern) — do not introduce a new visual style for this tab.
- Vitals cards should feel visually consistent with any other stat/metric card pattern already established in this project (icon-badge + bold value + label), not a one-off design.
- Maintain a two-column layout on desktop; stack to a single column responsively on narrow viewports.

## 4. CONSTRAINTS
- Do not touch the header banner, sidebar, global header, or any other Patients tab besides Overview.
- Do not invent new structured clinical-data fields — reuse the existing simple Allergies/Medical Conditions text fields and existing vitals/prescription data exactly.
- Do not fabricate any data (AI summary text, vitals values, medication names) — real data or an honest empty state, every time.
- Do not remove the Documents tab itself (elsewhere in the Patients module) — only remove the redundant Documents *section that currently appears inside Overview*.

## 5. PROCESS
1. Report the Section 0 audit findings before implementing.
2. Propose the exact BMI-calculation approach and the Blood Sugar vitals-field addition (if not already present) before implementing.
3. Implement: remove the old duplicated Basic Health Info / Recent Visit / Next Appointment / Notes / Documents content from Overview → build the simplified Basic Information card (left) → build AI Patient Summary + Today's Vitals grid (right) → responsive layout pass.
4. Provide a verification checklist: open a patient with real allergies/conditions/medications/vitals recorded and confirm the Critical Safety Alerts, Basic Information, AI Summary, and Vitals grid all show correct real data; open a patient with none of this recorded and confirm every section shows the correct honest empty state (no fabricated content); confirm Recent Visit/Next Appointment/Notes/Documents no longer appear anywhere in the Overview tab; confirm the header banner and all other tabs are unaffected.

Confirm your Section 0 audit findings back to me before writing code.
