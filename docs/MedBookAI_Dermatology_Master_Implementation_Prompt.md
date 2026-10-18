# MedBook AI --- Dermatology Consultation Workspace

## Master Product Specification + AI Coding Agent Implementation Prompt

**Purpose:** This is the consolidated master brief for redesigning and
implementing the Dermatology encounter/consultation workspace in MedBook
AI. It combines the detailed dermatology workflow requirements with
engineering safeguards, Design System V2 consistency, reuse of the
existing General Physician clinical workflow, and the existing ZEGOCLOUD
teleconsultation integration.

**Source documents to use together** 1.
`dermatology-ehr-consultation-workflow-spec.md` --- structured
architecture and six-tab specification. 2. `derma ehr consultation.txt`
--- expanded workflow discussion, component-level UX, edge cases,
telehealth scenarios, prescription details, machine settings, billing,
and clarifications. 3. This master prompt --- implementation rules,
architecture audit, integration constraints, responsive behavior, and
acceptance criteria.

Treat the two source documents as product requirements. This master
prompt consolidates and operationalizes them; it does not authorize
discarding requirements merely because they are not currently
implemented.

------------------------------------------------------------------------

# 1. Mission and product principles

Redesign the existing Dermatology consultation workspace into a modern,
efficient, clinically safe, fully functional encounter workflow. The
interface should minimize unnecessary typing and clicks while preserving
clinical nuance, clinician review, auditability, patient safety, and
access to every required feature.

Use a **layered interaction model** throughout the workspace:

1.  **Primary automated flow:** use verified pre-intake, existing
    patient/encounter data, configured defaults, and approved templates
    to reduce repetitive entry.
2.  **Quick controls:** structured chips, toggles, steppers, segmented
    controls, and common-choice shortcuts for routine cases.
3.  **Search and custom overrides:** searchable medical dictionaries,
    type-to-create tags where permitted, custom parameters, and
    free-text notes for unusual cases.
4.  **Fallback input:** clinician-entered notes and voice dictation/AI
    scribe only when that capability exists, is authorized, and is
    connected to the real data workflow.

These layers complement one another; they are not mutually exclusive
alternatives. However, do not show fake AI, fabricated records,
unsupported integrations, or decorative controls. If a feature needs a
missing backend/API or an unsupported SDK capability, identify the gap
and implement only the safe, functional portion.

The source documents describe a target of very fast consultations. Treat
time targets as **aspirational UX goals**, not guaranteed clinical
throughput or permission to skip history, verification, consent, safety
checks, or clinician review.

## Non-negotiable principles

-   Use the project's actual **Design System V2** and established
    MedBook AI visual language.
-   Inspect the current repository and architecture before changing
    code.
-   Reuse existing clinical services and the General Physician
    workspace, especially prescription, investigations/labs, doctor
    notes, validation, save/approval, and audit workflows.
-   Reuse the existing ZEGOCLOUD integration and the actual installed
    SDK/UI Kit version.
-   Keep the six-tab dermatology workflow below as the intended
    consultation information architecture.
-   Preserve existing routes, data, permissions, and working
    functionality.
-   All save, upload, search, selection, PDF, communication, billing,
    and call actions must work end-to-end where the supporting service
    exists.
-   Never replace clinical data with mocks or create duplicate parallel
    prescription/encounter systems.
-   Use clinician approval for diagnoses, treatment plans, and
    AI-generated content.
-   Do not hard-code clinical medication doses, protocol bundles, device
    settings, or regulatory rules as universal truth.

------------------------------------------------------------------------

# 2. Mandatory architecture audit before implementation

Before writing code, inspect the actual application and produce a
concise architecture map.

## 2.1 Repository and UI audit

Identify: - Framework, routing, component boundaries, state management,
form/validation library, styling system, and installed dependencies. -
Design System V2 documentation, tokens, shared components, icon library,
breakpoints, and existing accessibility patterns. - Existing patient
workspace, all Dermatology tabs, all forms, dialogs, drawers, dropdowns,
uploads, save actions, and permissions. - Patient master profile,
encounter history/timeline, document/image storage, prescription output,
and visit completion behavior. - Existing tests, lint/type checks, and
test conventions.

## 2.2 General Physician workspace audit

Trace and reuse its existing: - Chief complaint and history. -
Examination and diagnosis/ICD handling. - Medication catalogue and
prescription item builder. - Laboratory tests/investigations. - Doctor
notes and patient instructions. - Draft/save/approve/sign/complete
lifecycle. - Validation, allergy checks, authorization, persistence,
audit trail, and PDF/output templates.

Dermatology-specific functionality must be added as compatible
extensions. Do not rebuild a second prescription engine if the General
Physician one already handles core prescribing.

## 2.3 ZEGOCLOUD audit

Inspect the actual installed ZEGOCLOUD package, SDK/UI Kit version,
integration wrapper, token/session service, room/join lifecycle,
permission handling, call events, reconnection, and end-call behavior.

Verify which capabilities are genuinely supported by the current
integration. Do not assume that the UI Kit exposes arbitrary video
frames, direct canvas access, whiteboarding, annotation,
push-to-patient-screen, rear-camera controls, call recording, transcript
capture, or custom overlays. Implement these only if the installed SDK
and existing app architecture support them safely.

Never expose server secrets or privileged credentials in frontend code.
Reuse the current secure token/session flow.

## 2.4 Data and capability inventory

For each requested feature, classify it as: - **Already implemented:**
reuse and improve. - **Implemented but incomplete:** finish without
duplicating. - **Missing UI but supported by backend:** implement and
connect it. - **Requires backend/integration work:** document and
implement only after the appropriate service is available. - **Requires
clinical governance/configuration:** create configurable
clinician/clinic-managed workflows rather than universal hard-coded
defaults.

Do not infer that the real application uses Supabase, JSONB, or a
specific storage path merely because those are mentioned in the source
specification. Verify the current database and services first.

After this audit, write a short plan, then implement the changes. Do not
stop after analysis or a mockup.

------------------------------------------------------------------------

# 3. Skills and Design System V2

Use the actual skills installed in the repository/agent environment; do
not assume a skill exists solely because it is named here.

-   **Design System V2 / UI implementation skill:** source of truth for
    typography, spacing, semantic colors, buttons, inputs, cards, tabs,
    dialogs, elevation, focus rings, breakpoints, and interaction
    states.
-   **Frontend UI/UX skill:** clinical hierarchy, information density,
    low-friction workflows, responsive behavior, empty/loading/error
    states, and usability.
-   **Frontend architecture/code-quality skill:** reusable components,
    typed interfaces, state/data flow, and minimal duplication.
-   **ZEGOCLOUD integration skill/documentation:** exact installed
    SDK/UI Kit version and its supported APIs.
-   **Accessibility/responsive-design skill:** keyboard navigation,
    touch targets, focus management, contrast, mobile layout, and
    reduced motion.
-   **Testing/debugging skill:** functional testing, integration
    testing, responsive QA, and regression checks.

If a skill is unavailable, use the project's documentation and existing
conventions. Do not install unrelated packages without a demonstrated
need.

### Design System V2 rules

-   Use shared V2 tokens and components; do not create an unrelated
    design language or arbitrary one-off colors.
-   Maintain MedBook AI's brand while making the clinical experience
    calm, polished, readable, and professional.
-   Use consistent button heights, icon sizes, field spacing,
    typography, borders, radii, focus styles, loading states, and
    disabled states.
-   Use the project's existing icon library; do not mix random icon
    packs.
-   Keep labels persistent; placeholders are not labels.
-   Use color as a supporting status cue, never as the only status
    signal.
-   Avoid decorative clutter, excessive borders, tiny metadata, and
    unnecessary cards.
-   Prefer meaningful whitespace and clear grouping over squeezing every
    field above the fold.
-   Three-column desktop layouts in the source material are a reference
    for information grouping, not a requirement to force three narrow
    columns at all viewport sizes.

------------------------------------------------------------------------

# 4. Intended six-tab consultation architecture

Use the following six encounter tabs as the intended information
architecture:

1.  **Clinical Overview & History**
2.  **Derm Examination & Visual Body Mapping**
3.  **Diagnosis & Clinical Assessment**
4.  **Treatment Plan & Prescriptions (Rx)**
5.  **In-Office Procedures & Biopsy Tracker**
6.  **Summary, Billing & Follow-up**

The existing application currently has some tabs such as Skin Overview,
Skin Examination, Photo & Body Mapping, Procedures, Dermatology Rx, and
Documents. Map current routes/components/data to the six-tab target
without breaking existing links or losing functionality.

**Documents and attachments remain accessible**, but do not
automatically create a seventh primary encounter tab just because the
current UI has a Documents tab. Integrate documents into the relevant
encounter context, photo/document area, or a clearly accessible
secondary section, unless the existing routing/architecture requires the
current tab to remain. If it must remain, explain the reason and
preserve the six-tab clinical workflow clearly.

Keep a compact, persistent patient header with patient name/ID, relevant
available demographics, encounter/visit status, and primary actions such
as Start/Join Video Consultation where appropriate. Keep Edit Profile
and Merge Duplicate permission-aware and available through an overflow
menu on smaller screens.

------------------------------------------------------------------------

# 5. Tab 1 --- Clinical Overview & History

## Purpose

Give the clinician a fast, reliable snapshot of the patient's
dermatological background, current concern, active medications/skincare,
allergies, and relevant risks. Physical and video consultations use the
same clinical history, with telehealth-specific context added when
relevant.

## 5.1 Recommended content

-   Patient snapshot: available demographics and patient/record ID.
-   Fitzpatrick skin type I--VI, if recorded or assessed; allow
    clinician correction.
-   Chief complaint: common quick choices such as acne, eczema flare,
    hair loss/alopecia, rash, mole check, pigmentation, or other
    configured choices.
-   HPI: duration, progression, severity, triggers, associated symptoms,
    and clinician notes.
-   Dermatology-specific triggers: sun exposure, new cosmetic/skincare
    products, stress, diet, or seasonal changes where clinically
    relevant.
-   Symptoms: itch/pruritus, pain, bleeding, scaling, burning, and other
    configurable options.
-   Past skin conditions: e.g., psoriasis, rosacea, keloid tendency,
    atopic dermatitis, and other recorded history.
-   Allergies/sensitivities: drug allergies and topical/contact
    sensitivities. Display verified allergy alerts prominently.
-   Current oral medications and current topical/skincare regimen,
    including retinoids, steroids, sunscreen, serums, antibiotics,
    hormonal therapy, or other recorded items.
-   Relevant systemic history, such as PCOS in a hormonal-acne context
    or thyroid history in a hair-loss context, and family history such
    as skin cancer/melanoma or autoimmune skin disease when available.
-   Patient pre-intake status and source.
-   Previous visit summary and a "Copy/Use Previous History" action for
    follow-up visits, with clear review/update behavior.
-   Patient-uploaded skin photos available before the visit.
-   A concise free-text HPI/clinical note and voice dictation only if
    the application actually supports it.

## 5.2 Time-saving interaction layers

-   **Digital pre-intake:** allow patients to complete supported history
    questions before the appointment through the existing patient
    portal/booking/QR/mobile flow if available. Show the submission
    timestamp/source and a review state.
-   **Review and import:** use a clear action such as "Review Intake" or
    "Approve & Import" only when there is real patient-submitted data.
    Show exactly what will be imported and do not overwrite
    clinician-confirmed data silently.
-   **Quick chips:** common complaint, duration, severity, triggers, and
    symptoms.
-   **Previous visit:** prefill/copy only relevant prior information;
    clearly mark it as carried forward and prompt review. Do not treat
    old data as current without confirmation.
-   **Custom input:** allow search or free text for a complaint or
    symptom not represented by chips.
-   **Voice/AI scribe:** if available, present generated content as a
    draft requiring clinician review. Never silently finalize a note or
    invent patient statements.

## 5.3 Desktop layout

Use a balanced three-zone/card arrangement where the actual viewport
permits it: - **Patient snapshot / intake status** - **Today's complaint
and HPI** - **Risks, allergies, current medications/skincare, and
relevant history**

Allergies and high-risk information should be prominent without relying
on red color alone. Empty or unknown information must be labelled as
missing/not recorded, not "negative."

## 5.4 Telehealth additions

When the visit is online, include available and verified: - Telehealth
consent status. - Identity-verification status. - Patient's current
location/city and emergency contact when collected and required by the
clinic workflow. - Patient-uploaded high-resolution skin photos with
zoom/inspection. - Live call context through the existing ZEGOCLOUD UI
Kit.

Do not show a green "verified/signed" badge unless the underlying system
confirms it. If location, emergency contact, consent, or identity data
is missing, show the appropriate pending/missing state.

------------------------------------------------------------------------

# 6. Tab 2 --- Derm Examination & Visual Body Mapping

## Purpose

Capture lesion location, morphology, visual evidence, clinical
observations, and appropriate dermatology-specific scoring without
forcing the clinician to type every detail.

## 6.1 Desktop layout

Use three functional zones when screen width permits: - **Body map /
lesion pins** - **Photos and dermoscopy / comparison** - **Selected
lesion details and morphology**

Reflow to a two-zone or single-column design on narrower screens.

## 6.2 Interactive body map

-   If a body-map component already exists, reuse and improve it.
-   Support front/back views where available.
-   Let the clinician select a body region and create a numbered
    lesion/location pin, such as "Pin #1 --- Left forearm."
-   List all pins with clear labels and selection state.
-   Each pin must link to its own observations, photos, and relevant
    diagnosis/procedure references where the data model supports it.
-   Allow edit/remove with appropriate confirmation and preserve history
    as required.
-   If a reliable persisted body-map component is not present, inspect
    the existing data model before building one. Do not create a
    decorative map that does not save data.

## 6.3 Lesion details and flexible tags

Support structured options where appropriate: - Primary morphology:
macule, papule, pustule, plaque, nodule, vesicle, and other configured
clinical terms. - Color: erythematous/red, hyperpigmented, violaceous,
hypopigmented, or other supported terms. - Border/texture/scale and
other clinically approved attributes. - Size with unit and sensible
numeric input/stepper. - Body site and laterality. - Additional
clinician observations.

**Never limit the clinician to a fixed chip list.** Include: 1. Quick
chips for common findings. 2. Searchable medical-term suggestions from a
configured/available terminology source. 3. A permitted custom-tag
creation path when a term is not found. 4. A concise free-text
observation field for every selected lesion. 5. Voice dictation only if
supported. 6. Specialty/visit presets (e.g., general dermatology,
cosmetic dermatology, dermato-oncology/mole check) only where clinic
configuration supports them.

Custom tags should be associated with the correct lesion/encounter and
should not automatically become global medical vocabulary for all
clinics unless a deliberate permissioned governance feature exists.

## 6.4 Photos, dermoscopy, and comparison

-   Reuse existing secure upload/storage services.
-   Show thumbnails, capture/upload date, body region, photo type, and
    available author/source.
-   Support baseline/follow-up tagging and explicit before/after
    pairing.
-   Provide accessible zoom/preview and side-by-side comparison for
    explicitly paired images.
-   Keep original clinical images unchanged; do not silently crop,
    enhance, or alter them.
-   Show upload progress, errors, retry, empty, and permission states.
-   Link a selected photo to the appropriate body pin where supported.

## 6.5 Scoring and mole checklist

Where clinically validated, supported by the application, and
appropriate to the visit: - Provide configured acne severity scoring
such as GAGS. - Provide configured psoriasis severity scoring such as
PASI. - For mole/skin lesion review, provide the ABCDE checklist:
asymmetry, border, color variation, diameter, and evolution.

Use validated formulas and units, show how a score was calculated, and
let the clinician review the inputs. Do not present a score as a
diagnosis or risk prediction on its own. Keep optional tools out of the
way when irrelevant.

## 6.6 ZEGOCLOUD/telehealth behavior

-   Use the existing video-call workspace and its supported UI Kit.
-   A video-frame snapshot button may be added only if the installed SDK
    safely exposes the required video frame and the app has the required
    permissions/consent.
-   If frame capture is unsupported, let the clinician use
    patient-uploaded photos or the existing upload flow instead.
-   Real-time annotation, whiteboard, screen-sharing, and patient
    rear-camera switching must be implemented only if actually supported
    by the installed integration. Do not fabricate controls.
-   If a captured frame is supported, let the clinician preview it,
    explicitly confirm/save it, and attach it to the selected lesion
    pin. Never silently add an unreviewed frame to the permanent record.

------------------------------------------------------------------------

# 7. Tab 3 --- Diagnosis & Clinical Assessment

## Purpose

Record the clinician's primary diagnosis, differential diagnoses,
coding, severity/chronicity where appropriate, and assessment narrative.

## 7.1 Suggested layout

Use a balanced layout with: - **Suggestions/favorites and diagnosis
search** - **Selected primary and differential diagnoses** -
**Assessment summary and clinical notes**

## 7.2 Search and selection

-   Provide search by ICD code, medical term, and supported
    plain-language synonym.
-   Reuse existing diagnosis/ICD search services and validated
    terminology data.
-   Use ICD-10 and/or SNOMED terminology only to the extent supported by
    current integrations and licensing/configuration.
-   Show code and label together, with the source/terminology when
    relevant.
-   Provide clinician/clinic favorites for frequently used diagnoses.
-   Allow multiple diagnoses where supported.
-   Allow a diagnosis to be designated as primary, differential,
    suspected, or provisional according to the existing data model.
-   If no suitable coded term exists, allow a clearly labelled
    provisional/free-text diagnosis if the existing workflow permits it;
    do not fabricate a code.

## 7.3 AI assistance

-   If a genuine AI decision-support service exists, it may suggest
    candidates based on the documented history and examination.
-   Show suggestions as **unconfirmed suggestions**, with a clear
    review/accept/reject action.
-   Never fabricate a confidence percentage or claim a diagnosis has
    been verified by AI if the service does not return calibrated,
    meaningful confidence data.
-   Do not automatically make an AI suggestion the confirmed primary
    diagnosis.
-   AI suggestions must not replace clinician judgment or required
    clinical review.

## 7.4 Assessment fields

Where supported: - Primary diagnosis and ICD/terminology code. -
Differential/suspected diagnoses. - Severity (mild/moderate/severe) and
chronicity (acute/chronic/recurrent) when clinically relevant. -
Assessment narrative, clinical templates/snippets, and voice dictation
if available. - Relevant next-step flags for tests, biopsy, referral, or
follow-up only when clinically selected or generated through a validated
workflow.

## 7.5 Patient-friendly explanation / telehealth

-   If the app has a patient education/communication feature, provide an
    editable patient-friendly explanation alongside the clinical
    diagnosis.
-   Share/push it to the patient only through an existing, supported
    patient portal/chat feature, with clinician review.
-   Whiteboard, live annotations, or educational visuals must not be
    represented as ZEGOCLOUD-native capabilities unless confirmed for
    the installed SDK.

------------------------------------------------------------------------

# 8. Tab 4 --- Treatment Plan & Prescriptions (Rx)

## Critical implementation constraint

The General Physician workspace already contains the standard
clinical/prescription workflow. **Reuse that implementation and its
APIs, validation, medication catalogue, investigations/labs, doctor
notes, save/sign/approval behavior, and audit trail.** Add
dermatology-specific extensions; do not create a separate incompatible
prescription engine.

## 8.1 Three-zone layout

On wide screens, use: - **Column 1 --- Search, categories, favorites,
protocol bundles** - **Column 2 --- Active prescription item builder** -
**Column 3 --- Patient-facing AM/PM routine preview and safety
warnings**

The source document's approximate 28% / 44% / 28% split is a reference,
not a rigid measurement. Let the central prescription editor retain
enough width for labels and controls. On tablet/mobile, stack sections
or use clearly labelled panels/drawers; do not force three narrow
columns.

## 8.2 Column 1: search and bundles

-   Smart medication combobox/command search using the real medication
    catalogue.
-   Search across generic/brand name, strength, form, and supported
    category.
-   Show enough result information to distinguish products and
    formulations.
-   Support keyboard navigation and a shortcut only if it fits existing
    app conventions.
-   Category filters where available: All, Topicals, Oral medicines,
    Cleansers/Sunscreens, and other configured categories.
-   Clinician/clinic favorites.
-   Configured protocol bundles grouped in accordions, e.g., acne,
    pigmentation, eczema/rash, anti-dandruff, or other clinic-defined
    categories.
-   A bundle must preview its contents before applying; applying it
    should add editable draft items to the prescription builder, not
    silently finalize an Rx.
-   Bundle content, defaults, eligibility, and versions must be
    clinician/clinic-managed and governed. Do not hard-code universal
    treatment kits or medication doses.

## 8.3 Column 2: active prescription item builder

Every selected medicine becomes a clear, editable card. Use the existing
prescription item model and preserve all standard GP fields.

### Shared fields where supported

-   Medication name, brand/generic, strength, and dosage form.
-   Dose/quantity, route, frequency/timing, duration, quantity, refills,
    and pharmacy instructions as supported by the existing system.
-   Start/stop dates where supported.
-   Special instructions, patient advice, and clinician notes.
-   Remove/edit actions with appropriate confirmation or undo.
-   Validation for required fields and clear field-level error messages.

### Topical medicine card

For topical products, show relevant fields from the medication model: -
Form: gel, cream, ointment, lotion, solution, serum, foam, etc. -
Application site/body area (multi-select where supported). -
Amount/quantity instructions. - Optional FTU/Fingertip Unit guidance if
configured and clinically appropriate. - Timing: AM, PM, both, or a
custom schedule. - Frequency and duration. - Clear application
instructions, e.g., clinician-entered site-specific advice. - Patient
education/precautions where appropriate.

An FTU visual guide may explain the configured unit and body-area
guidance, but must not imply that one FTU value applies identically to
every body area/patient. Allow a clinician to choose a suitable unit or
use ordinary instructions when FTU is not appropriate.

### Oral medicine card

Show fields supported by the existing GP prescribing model: - Dose/units
(tablet/capsule/liquid as applicable). - Route. - Frequency/schedule; if
the application uses local shorthand such as 1-0-1, show a readable
interpretation. - Relation to food where appropriate and supported. -
Duration, quantity, and instructions. - Medication-specific warnings
sourced from real configured rules.

Do not hard-code drug regimens, strengths, or doses as universal
defaults. Medication choice and final instructions remain the
prescriber's responsibility.

### Custom compounded formulation

If the backend/data model and prescribing policy support compounded
preparations, provide a modal/drawer to enter: - Formulation/base. -
Ingredient names and strengths/percentages. - Final quantity and
instructions. - Required review/validation fields.

The resulting item must be represented correctly in the prescription
record and output. If compounded formulations are not supported by the
current system, document the backend/data-model gap instead of
pretending a custom text string is a fully validated medicine.

## 8.4 Column 3: AM/PM routine and safety

-   Live patient-facing routine preview generated from current draft
    prescription items.
-   Morning (AM) and night (PM) sequences in clear numbered order.
-   Reflect edits/removals immediately.
-   Allow a clinician to adjust the order and wording where supported.
-   Provide a concise safety/interaction area sourced from actual
    medication/allergy/risk services.

### Safety warnings

Support existing safety rules for allergies, contraindications,
interactions, pregnancy/teratogenic risk, and required monitoring where
those rules are implemented and clinically governed. The source material
mentions examples such as isotretinoin-related risk checks and
interactions; treat these as **examples, not universal hard-coded
rules**. The exact requirements must come from the medication safety
service, local clinical policy, and applicable regulation. Acknowledge,
override, or document a warning only through an authorized clinician
workflow. Never show a green "safe" status merely because no rule was
found.

## 8.5 Save, sign, output, and communication

-   Reuse the General Physician draft/save/sign/approval workflow.
-   Clearly distinguish Save Draft from Sign/Finalize/Issue.
-   Prevent duplicate submission and preserve data on recoverable
    errors.
-   Generate the existing official prescription format with
    clinic/doctor information and a readable patient guide where
    supported.
-   Include AM/PM routines and patient instructions in the output when
    appropriate.
-   Save the finalized prescription to the correct encounter.
-   Send through WhatsApp/email/patient app only if the corresponding
    integration exists, recipient details are valid, the patient
    communication preference/consent is respected, and delivery status
    can be reported accurately.
-   QR pharmacy verification, pharmacy delivery, or direct prescription
    push must not be invented if no supported integration exists.

------------------------------------------------------------------------

# 9. Tab 5 --- In-Office Procedures & Biopsy Tracker

## Purpose

Record procedures, settings, consent, specimen tracking, aftercare, and
repeat-session history. The EHR is a **clinical record/logbook**, not a
machine controller unless a genuine device integration exists.

## 9.1 Three-zone layout

-   **Column 1 --- Procedure catalogue, search, categories, and
    presets**
-   **Column 2 --- Active procedure card and parameter builder**
-   **Column 3 --- Consent, biopsy/specimen tracker, lab status, and
    aftercare**

Responsive behavior must follow the same rules as the other tabs.

## 9.2 Catalogue and presets

-   Search for configured procedures such as lasers/energy devices,
    chemical peels, injectables, cryotherapy, electrocautery, minor
    surgery, and biopsy.
-   Use category filters and clinician/clinic favorites.
-   Use configured presets for repeat procedures where the clinic has
    reviewed the values.
-   Presets should populate an editable draft; they must never silently
    imply that the physical machine was configured automatically.
-   Support custom procedures when permitted.

## 9.3 Dynamic procedure cards

Change fields according to the procedure type and clinic configuration.

### Laser/energy device

Where relevant to the configured machine: - Machine/device profile. -
Body area/site. - Energy/fluence and units. - Spot size, pulse duration,
passes, cooling, and other custom parameters supported by that device. -
Notes and post-procedure observations.

### Injectables

Where relevant and supported: - Product/brand and lot/batch number. -
Injection site or face/body map. - Units per site and total units. -
Reconstitution or preparation details where required by clinic
workflow. - Clinician notes.

### Chemical peel / cryotherapy / other procedures

Show only relevant, configured fields such as agent/concentration,
layers, contact time, endpoint observations, site, and notes. Avoid
exposing irrelevant fields for every procedure type.

## 9.4 Clinic machine profiling and custom parameters

-   If supported, allow authorized clinic administrators to register
    actual machines and define the relevant parameter fields once.
-   Include an "Add Custom Parameter" path for a field not represented
    in the preset.
-   Let authorized users save reusable custom parameter templates where
    governance permits.
-   Provide raw notes/dictation as fallback.
-   A machine-screen photo attachment can be offered through the
    existing secure upload service.
-   Make clear that recorded values are manually documented unless an
    actual device integration confirms them. Do not imply live machine
    control or automatic parameter capture without a real integration.

## 9.5 Biopsy/specimen tracker

Where supported: - Link specimen to the relevant body-map pin/lesion. -
Record biopsy type and site. - Generate a unique specimen ID/barcode
through the actual backend. - Support label printing if the
printer/output workflow exists. - Record pathology lab target and
dispatch/status changes. - Allow authorized users to update status when
results arrive. - Preserve the linkage between specimen, lesion,
encounter, and report.

## 9.6 Consent, aftercare, and telehealth

-   Show verified consent status from the actual consent record; do not
    fabricate signed status.
-   Record aftercare instructions and relevant
    complications/observations.
-   Support configured post-care chips but allow custom instructions.
-   During video consultations, support pre-procedure counselling,
    patient education, consent dispatch, in-person procedure booking,
    and post-procedure follow-up only when those services are actually
    available.
-   A video visit cannot be represented as a physically performed
    procedure.
-   Keep procedure history visible for future visits, including previous
    session/date/settings where available.

------------------------------------------------------------------------

# 10. Tab 6 --- Summary, Billing & Follow-up

## Purpose

Review the complete encounter, confirm billing/payment routing, schedule
follow-up, deliver approved patient materials, and close the encounter
safely.

## 10.1 Three-zone layout

-   **Column 1 --- Encounter recap**
-   **Column 2 --- Itemized billing/invoice**
-   **Column 3 --- Follow-up, discharge, and patient communication**

Use real data from earlier tabs and existing billing services. Do not
use example prices or example patient data as defaults.

## 10.2 Encounter recap

Show a concise final review: - Chief complaint and key history. -
Examination summary and attached photos. - Primary and differential
diagnoses. - Prescribed medicines and AM/PM instructions. - Procedures
performed or planned, not conflated. - Biopsy/specimen status where
applicable. - Investigations, documents, and relevant follow-up
instructions.

Provide links back to the relevant tab/section to correct missing or
inconsistent information. Distinguish draft from finalized items.

## 10.3 Billing and payment

-   Aggregate consultation, procedure, biopsy/lab, and other charges
    from the actual pricing/catalogue and completed services.
-   Show itemized descriptions, quantity, unit cost, subtotal,
    configured taxes/fees, discount/adjustment, and total.
-   Support percentage/flat discounts or fee waivers only with the
    appropriate permissions.
-   Use the actual supported payment methods and status: paid, pending,
    online, cash/card, insurance/split payment, or pay-at-reception only
    where implemented.
-   Route reception tasks to the existing staff workflow.
-   Do not hard-code currencies, prices, tax rates, insurance rules, or
    payment providers.
-   Preserve invoice history and audit requirements.
-   Allow print/download only through existing document generation.

## 10.4 Follow-up scheduling

-   Offer quick intervals such as 1 week, 2 weeks, 1 month, 3 months, or
    "as needed" only as configurable shortcuts.
-   Offer a custom date.
-   Calculate the suggested date, then verify real doctor/calendar
    availability before promising or booking a slot.
-   Clearly distinguish "recommended follow-up interval" from a
    confirmed appointment.
-   If the calendar has no suitable slot, allow the clinician to choose
    another time or route the task to scheduling staff.

## 10.5 Patient discharge and communications

-   Select approved materials such as finalized prescription,
    invoice/receipt, patient instructions, pre/post-care information,
    and relevant educational leaflets.
-   Use diagnosis-linked educational content only when the content is
    approved and appropriate; keep clinician review where required.
-   Provide channel choices such as WhatsApp, SMS, email, or patient app
    only if the integration exists.
-   Respect patient communication preferences/consent, valid contact
    details, and clinic policy.
-   Show queued/sent/failed status accurately; do not claim delivery if
    the provider has not confirmed it.
-   Support automated reminders only through the real
    scheduling/notification service.
-   Provide a clear final action such as "Complete Consultation &
    Discharge" with appropriate validation and confirmation.

## 10.6 Telehealth closure

-   If the encounter is a video visit, follow the existing ZEGOCLOUD
    call-end lifecycle.
-   Make it clear whether the clinician is leaving the call or
    finalizing the encounter.
-   Do not end the call unexpectedly before the clinician confirms
    completion.
-   Preserve notes, prescription, and encounter data.
-   Generate the patient's approved output using the existing service.
-   Record/archive a call recording only if the feature genuinely
    exists, required consent is recorded, and retention/access policies
    allow it. Never assume recording is enabled.

------------------------------------------------------------------------

# 11. Encounter persistence and longitudinal patient record

The source specification describes an encounter-based model. Verify the
actual application schema before implementation.

## 11.1 Required conceptual behavior

-   Each visit/consultation must have its own unique encounter record
    linked to patient, clinician, date/time, visit type
    (in-person/video), and relevant appointment.
-   Tab data, diagnoses, prescriptions, procedure records, billing, and
    attachments must be associated with the correct encounter.
-   Uploaded images and documents must use secure storage and
    links/metadata that preserve patient/encounter relationships.
-   Do not store only a transient frontend state or save all clinical
    data only to the patient master profile.
-   Do not overwrite prior encounters when creating a new visit.
-   Preserve draft, finalized, amended, and signed states according to
    the existing application's clinical/legal model.
-   Retain audit history; if corrections are allowed, use the
    established amendment/version process rather than silently rewriting
    finalized records.

## 11.2 Patient Master EMR profile

The patient's main profile should provide a chronological visit timeline
with available: - Visit date/type and clinician. - Primary
diagnosis/summary. - Prescription summary. - Relevant procedure/specimen
information. - Photo/attachment indicators. - Encounter status and
actions such as View Full Visit Summary or Download Prescription where
supported.

Opening a prior encounter should show its saved historical values in a
read-only or appropriately permissioned historical view. Do not display
the current patient data as if it belonged to an older visit.

## 11.3 Follow-up context

For follow-up visits, offer useful links to: - Previous diagnosis and
plan. - Prior medication list with an explicit review/copy action. -
Prior photos paired with current photos where comparison is
appropriate. - Prior procedure parameters and biopsy status. - Prior
notes and relevant outcomes.

Copied values must be visibly identified as carried forward and reviewed
by the clinician before becoming current encounter data.

## 11.4 Data architecture caution

The source document mentions a Supabase `encounters` table, JSONB
snapshots, and Supabase Storage paths. Treat these as a proposed model,
**not proof of the current application schema**. Inspect the real
backend first. Reuse the actual schema and services unless a reviewed
migration is required. Do not introduce a JSON blob as a substitute for
existing normalized clinical records without architectural
justification.

------------------------------------------------------------------------

# 12. ZEGOCLOUD teleconsultation workspace

The existing app already has video calling. Integrate clinical workflow
around the actual installed UI Kit rather than building a second call
interface.

## Desktop

-   Keep the ZEGOCLOUD video area as the primary visual region.
-   Provide a collapsible patient-context panel with relevant history,
    allergies, current medications, selected photos, and encounter
    summary.
-   Provide clearly labelled shortcuts to Examination, Photos/Body Map,
    Diagnosis, Prescription, and Follow-up.
-   Avoid duplicating native camera/microphone/end-call controls
    provided by the UI Kit.

## Tablet/mobile

-   Tablet: context panel can collapse into a drawer or secondary panel.
-   Mobile: prioritize video and native call controls; expose clinical
    context through a labelled switchable panel, drawer, or bottom
    sheet.
-   Never squeeze video into an unusably narrow column.
-   Keep essential controls visible and touch-friendly; handle safe
    areas, viewport resizing, and permission prompts.

## Lifecycle and error states

Handle actual SDK states where available: waiting, connecting,
connected, reconnecting, permission denied, device unavailable, network
issue, ended, and failed. Provide useful recovery guidance and clear
call exit behavior.

## Clinical safety

-   Link the call to the correct patient and encounter.
-   Do not mix one patient's call context with another patient after
    switching.
-   Do not auto-finalize AI transcripts or generated clinical notes.
-   Recording, transcription, image-frame capture, annotations,
    whiteboard, screen-sharing, rear-camera switching, patient-screen
    pushes, QR code outputs, and payment links are optional capabilities
    that require verified SDK support and/or real integrations.
-   If a capability is unsupported, retain a useful alternative workflow
    such as secure photo upload, existing patient portal sharing, or a
    manual note.

------------------------------------------------------------------------

# 13. Documents, photos, and AI copilot

## Documents and attachments

Preserve current document functionality even if it is not a primary tab
in the target six-tab workflow. Provide access to document
name/type/size/date/source and authorized preview/download/delete
actions. Keep dermatology images linked to their clinical context while
retaining the appropriate document metadata. Confirm destructive actions
and follow retention/audit rules.

## AI copilot

Reuse the existing assistant service and make its panel collapsible. On
mobile, use an accessible drawer/bottom sheet. It must not compress the
clinical workspace or obscure video controls.

Clearly distinguish AI-generated suggestions from clinician-entered
data. Suggestions must remain drafts until reviewed and explicitly
accepted. Never claim that an image was analyzed, a diagnosis was
inferred, or a transcript was generated unless the underlying capability
actually ran and returned a result.

------------------------------------------------------------------------

# 14. Responsive UX, accessibility, and interaction behavior

## Desktop

-   Efficient use of available width; compact patient list; persistent
    patient header and tabs.
-   Keep clinical workspace wider than optional assistant/context
    panels.
-   Use aligned forms and intentional sticky regions.
-   Avoid multiple nested scrollbars where possible.
-   Use three-column arrangements only when each column remains usable.

## Tablet

-   Reflow cards and fields.
-   Allow patient list/context/assistant panels to collapse into
    drawers.
-   Keep all tabs discoverable through wrapping, horizontal scrolling,
    or a labelled "More" control.
-   Ensure dialogs and sticky action footers remain reachable.

## Mobile

-   Single-column content, compact patient identity, and accessible
    patient switching.
-   Move secondary actions to a labelled overflow menu, but do not
    remove essential actions.
-   Use full-width form fields and touch targets around 44×44 CSS pixels
    where practical.
-   Use horizontally scrollable tabs or a labelled section selector with
    a clear active state.
-   No clipped labels, overlapping controls, off-screen dialogs, or
    unintended horizontal page overflow.
-   Ensure the keyboard does not obscure focused fields and that the
    page can scroll to validation errors.
-   Convert wide tables to readable cards/rows or intentional horizontal
    scrolling where necessary.
-   Responsive changes may relocate controls but must never make a
    feature unavailable.

## Across all sizes

-   One dominant primary action per section.
-   Consistent secondary actions and clear destructive-action
    confirmation.
-   Accessible names/tooltips for icon-only buttons.
-   Visible keyboard focus, semantic headings/labels, and
    field-associated errors.
-   Correct loading, disabled, success, warning, and failure states.
-   Do not rely on color alone for status.
-   Respect reduced-motion preferences.
-   Handle long patient names, missing data, empty lists, large image
    sets, and failed network requests gracefully.

------------------------------------------------------------------------

# 15. Privacy, clinical safety, and auditability

-   Preserve authorization at both UI and service/API layers.
-   Reset/reload all patient-specific state when switching patients.
-   Ensure asynchronous uploads/saves remain associated with the correct
    patient and encounter.
-   Do not expose sensitive patient data, private image URLs, call
    tokens, or secrets in logs or frontend code.
-   Show only verified consent/identity/recording statuses.
-   Do not represent missing information as a negative clinical finding.
-   Do not allow an AI suggestion, template, copied history, protocol
    bundle, or preset to become a confirmed clinical decision without
    the required clinician review.
-   Use real allergy and medication-safety services; do not invent a
    "safe" result because a rule is missing.
-   Follow clinic policy, applicable privacy/retention requirements, and
    existing audit processes.
-   Clinical scoring and decision support must be transparent, reviewed,
    and appropriate to the clinician's role.

------------------------------------------------------------------------

# 16. Implementation plan

Implement in this sequence:

1.  **Audit:** repository, current Dermatology workspace, General
    Physician workflow, Design System V2, ZEGOCLOUD integration, data
    schema/services, permissions, and tests.
2.  **Requirements map:** map every feature in both source documents to
    existing implementation status and identify dependencies.
3.  **Design-system alignment:** use V2 components/tokens before
    building individual cards.
4.  **Encounter shell:** patient header, six-tab navigation, panel
    behavior, scroll strategy, and responsive layout.
5.  **Tab 1:** clinical overview, history, pre-intake review,
    allergies/medications, prior visit context, telehealth-specific
    status.
6.  **Tab 2:** body map/pins, flexible lesion tags, photos, comparisons,
    and supported scoring tools.
7.  **Tab 3:** diagnosis search, favorites,
    primary/differential/provisional status, assessment, and safe AI
    suggestions if supported.
8.  **Tab 4:** reuse General Physician prescription/investigation
    workflow; add compatible dermatology-specific fields and AM/PM
    preview.
9.  **Tab 5:** procedures, machine profiles/custom parameters, consent,
    biopsy/specimen tracking, and aftercare.
10. **Tab 6:** encounter recap, real billing, follow-up availability,
    patient communications, and encounter completion.
11. **Persistence/history:** ensure every encounter saves separately and
    appears correctly in the patient's timeline.
12. **Teleconsultation:** integrate supported clinical context and
    workflow around the existing ZEGOCLOUD UI Kit.
13. **Responsive/accessibility pass:** test all tabs, forms, modals,
    drawers, uploads, errors, and call states at desktop/tablet/mobile
    widths.
14. **Regression tests:** verify old routes, existing documents, GP
    prescribing, permissions, patient switching, persistence, and output
    generation.
15. **Final report:** list changed files, reused components/services,
    implemented features, tests run, known limitations, and
    backend/integration work still required.

Do not stop after the shell or Overview tab. Implement all six tabs to
the extent supported by the actual architecture. If a feature depends on
missing backend work, document it precisely rather than faking
functionality.

------------------------------------------------------------------------

# 17. Acceptance checklist

## Product workflow

-   [ ] Six-tab consultation architecture is implemented or mapped
    compatibly to existing routes.
-   [ ] No required feature from either source document is silently
    discarded.
-   [ ] Routine cases have efficient quick controls; uncommon cases have
    search/custom/free-text fallbacks.
-   [ ] Prior history can be reviewed and copied without silently
    overwriting current data.
-   [ ] Every tab has a clear purpose, primary action, validation, and
    empty/loading/error states.

## Clinical functionality

-   [ ] Overview captures/reviews supported history, allergies, current
    medication/skincare, and pre-intake status.
-   [ ] Examination supports lesion pins, flexible morphology/details,
    photos, comparison, and supported scoring tools.
-   [ ] Diagnosis supports primary/differential/provisional status and
    valid terminology search.
-   [ ] Prescription/investigation workflow reuses the General Physician
    implementation without duplicate records.
-   [ ] Topical/oral medication cards show appropriate fields from the
    existing prescribing model.
-   [ ] AM/PM preview reflects the current prescription draft.
-   [ ] Safety alerts come from real, governed rules and require
    appropriate clinician review.
-   [ ] Procedures and biopsy/specimen records link to the correct
    encounter and body site where supported.
-   [ ] Summary/billing uses real pricing and payment services;
    follow-up is not marked booked until availability is confirmed.
-   [ ] Documents, PDFs, communication, and discharge actions use real
    supported services.

## Teleconsultation

-   [ ] Existing ZEGOCLOUD integration is reused and version-verified.
-   [ ] Call lifecycle and device/network errors are handled.
-   [ ] Patient context and encounter links are correct.
-   [ ] Unsupported SDK capabilities are not represented as working
    controls.
-   [ ] Recording/transcription/sharing respect actual capability,
    consent, and retention policy.

## Data and quality

-   [ ] Every visit is stored separately and appears in the patient's
    chronological EMR timeline.
-   [ ] Historical encounters remain associated with their original
    data.
-   [ ] Patient switching does not leak previous patient data.
-   [ ] Existing permissions, audit trail, and document references are
    preserved.
-   [ ] Design System V2 is consistently applied.
-   [ ] Desktop/tablet/mobile layouts have no clipped controls or
    unintended horizontal overflow.
-   [ ] Keyboard navigation, labels, focus, and validation accessibility
    work.
-   [ ] Relevant tests, lint, and type checks pass where available.
-   [ ] No mock-only buttons, fake records, unsupported promises, or
    avoidable console errors remain.

------------------------------------------------------------------------

# 18. Final instruction to the coding agent

Act as a senior clinical-workflow architect, product designer, and
frontend engineer. Use the two attached source documents as the full
product-requirements reference and this master prompt as the
implementation contract.

First inspect the actual codebase. Then map current functionality,
preserve working behavior, and implement the six-tab Dermatology
consultation workflow using Design System V2. Reuse the existing General
Physician prescription/investigation system and the actual installed
ZEGOCLOUD integration. Deliver a cohesive, modern, responsive,
accessible, fully connected experience---not merely a visual mockup.

Do not claim a feature is complete unless it works with the actual
data/services and has been tested. If a requirement depends on a missing
backend, clinical terminology source, governed medication rule,
communication provider, or unsupported ZEGOCLOUD capability, report that
dependency and implement a safe, functional alternative where possible.
