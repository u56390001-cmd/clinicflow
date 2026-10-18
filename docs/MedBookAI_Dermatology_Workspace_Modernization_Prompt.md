# MedBook AI --- Dermatology Workspace Modernization Prompt

## Mission

Completely modernize the existing Dermatology patient workspace using
**Design System V2**. Preserve the working clinical features and data
workflows, but substantially improve information hierarchy, button
consistency, layout, responsive behavior, and the teleconsultation
experience. This is an implementation task, not a mockup: all actions
must be connected to real application data and services.

## 1. Inspect the actual architecture before coding

First inspect the repository and identify the framework, routing,
component structure, styling system, Design System V2
documentation/tokens, state management, API/data layer, permissions,
tests, and installed agent skills. Inspect every Dermatology tab, form,
popup, drawer, upload flow, and save action shown in the current
workspace.

Study the already-built **General Physician workspace** and map its
chief complaint, examination, diagnosis/ICD, medication, prescription,
laboratory/investigation, doctor notes, draft/save/approval, validation,
and persistence workflows. Reuse its existing components and services
wherever appropriate.

Inspect the current **ZEGOCLOUD integration** and the exact installed
SDK/UI Kit version, including room creation/joining, tokens,
permissions, event callbacks, call lifecycle, and error handling. Follow
the installed version's documentation and existing project conventions;
do not guess APIs or replace a working integration blindly.

Write a brief implementation plan after this audit, then continue to
implement. Do not stop at recommendations. Do not replace working
business logic with mock data, duplicate APIs, duplicate prescription
systems, or a second video-call implementation.

## 2. Skills and Design System V2

Use the project's actual available skills and instructions: - **Design
System V2 / UI implementation:** source of truth for tokens, typography,
spacing, colors, buttons, fields, cards, tabs, dialogs, focus rings,
responsive breakpoints, and interaction states. - **Frontend UI/UX
design:** clinical workflow, information hierarchy, density,
empty/loading/error states, adaptive layouts, and usability. -
**Frontend architecture/code quality:** reusable components, typed
contracts, existing state/data flow, and minimal duplication. -
**ZEGOCLOUD integration documentation/skill:** use the installed package
and version correctly. - **Responsive/accessibility skill:** keyboard
navigation, touch targets, focus, contrast, and mobile layouts. -
**Testing/debugging skill:** functional, responsive, and regression
testing.

Do not assume a named skill exists if it is not installed. If
unavailable, follow repository documentation. Avoid unnecessary
dependencies. Use shared Design System V2 tokens and components; do not
create an unrelated design system or arbitrary one-off colors. Maintain
MedBook AI's brand, consistent button dimensions, icon sizes, form
spacing, typography, states, and semantic colors.

## 3. Workspace shell and patient header

The current workspace has a patient list on the left, a clinical
workspace in the center, and a collapsible AI assistant panel on the
right. Improve this structure without unnecessarily changing the global
application shell.

Keep the patient header compact and persistent. Include patient name/ID,
relevant available demographic details, visit context/status where
supported, the primary **Start/Join Video Consultation** action when
applicable, and secondary actions such as Edit Profile and Merge
Duplicate. At small widths, move secondary actions into an accessible
overflow menu rather than removing functionality. Do not add
global-header clutter or duplicate alerts that already belong in
Overview/Safety.

Use clear, consistent tab navigation. Preserve existing routes/deep
links where practical. Recommended structure: 1. Overview 2. Examination
3. Photos & Body Map 4. Procedures 5. Prescription & Investigations
(retain "Dermatology Rx" if renaming risks breaking existing navigation)
6. Documents

Every tab needs a clear purpose, logical field order, useful primary
action, and consistent layout. Avoid one long, undifferentiated form.

## 4. Overview

Create a useful clinical starting point with compact, responsive
sections for available skin profile details, allergies, active/previous
skin conditions, prior treatments, relevant safety information, recent
examinations/procedures, latest tagged photos, recent
prescriptions/investigations, and follow-up status.

Provide useful shortcuts such as Start Examination, Upload Photos, Add
Procedure, Open Prescription, and Start Video Consultation. Prioritize
active and clinically relevant information. Use meaningful empty states
and relevant next actions instead of large blank panels. Clearly
distinguish missing/not assessed data from an explicitly negative
finding. Never invent data or duplicate alerts.

## 5. Examination --- follow the General Physician workspace

Reuse the General Physician workspace's data model, components,
validation, save/draft behavior, diagnosis handling, and persistence
patterns. Extend it with dermatology-specific findings rather than
creating an incompatible parallel workflow.

Where supported, include: - Chief complaint and reason for visit -
Duration, progression, severity, itch, pain, triggers -
Distribution/body site/laterality - Morphology such as macule, papule,
plaque, nodule, vesicle, pustule, scale, or ulcer - Examination notes
and explicitly assessed relevant negatives - Diagnosis and ICD code -
Doctor notes and follow-up recommendation

Use structured chips where they improve speed, plus free-text detail
where needed. Keep labels persistent (not placeholder-only), clearly
distinguish selected options, group related fields, and use two columns
on desktop and one column on mobile. Use the existing save/draft
semantics, inline validation, and clear success/error states. Preserve
form values after recoverable errors. Do not present an AI suggestion as
a confirmed diagnosis.

## 6. Photos & Body Map

Improve the current image upload/tagging flow using the existing storage
and document services. Support only file types and size limits accepted
by the backend, and display them clearly. Provide upload progress,
retry/error states, thumbnails, accessible image preview/lightbox, and a
useful empty state.

Support the existing fields and compatible additions: image selection,
body region/site, laterality where relevant, photo type
(baseline/follow-up/other supported values), before/after pairing,
lesion notes, date, and author/source when available. Make the workflow
clear: upload/select → tag → save.

Provide side-by-side before/after comparison only for explicitly paired
images. Show body region and dates, preserve original images unchanged,
and do not fabricate a match or silently alter/crop clinical images. On
mobile, stack images or provide a touch-friendly comparison. Reuse an
existing body-map component if present; inspect the data model before
creating a new one. Any body mapping must persist and be clinically
useful, not merely decorative.

## 7. Procedures

Use the existing procedure data model and workflow. Display history with
date, procedure, clinician, status, and linked notes/images where
available. Provide a clear Add/Record Procedure action if permissions
allow. Keep procedure entry in a well-structured form or dialog matching
existing architecture. Preserve supported consent/documentation,
aftercare, complication, and follow-up fields. Link images/documents
only when supported. Confirm destructive actions and preserve
audit/history requirements.

## 8. Prescription & investigations --- critical reuse requirement

**The General Physician workspace already has prescription/consultation
functionality for complaint, examination, medication,
investigations/labs, doctor notes, and save/approval. Reuse it. Do not
rebuild it from scratch.**

Trace its components, medication and investigation catalogues, APIs,
validation, allergies, permissions, notes, output templates, and
draft/save/approval lifecycle. Extend only where necessary with
dermatology-specific fields compatible with the existing model, such as
topical formulation, application site/frequency/duration, AM/PM skincare
routine, patient education, and procedure aftercare.

Preserve existing medication safety checks, audit trail, prescribing
permissions, and clinician approval. Never hard-code drugs, strengths,
doses, or recommendations. Do not create duplicate prescription records
or bypass the established workflow. AI-generated text must remain a
draft until reviewed and approved as required. Preserve existing
Dermatology Rx data; do not silently discard or destructively migrate
it.

## 9. Documents

Improve the current document list and upload flow. Show file name, type,
size, document date, upload date, source/author, and permitted actions.
Support preview, download, and delete according to permissions. Confirm
destructive deletion and respect retention/audit rules. Use a desktop
table and mobile-friendly cards/rows. Include loading, empty, error,
unsupported-file, and permission-denied states. Preserve existing
storage references and avoid duplicate uploads.

## 10. Teleconsultation using the existing ZEGOCLOUD UI Kit

Use the **already-built video calling/telemedicine functionality** and
the installed ZEGOCLOUD UI Kit/prebuilt components. Do not build a
competing video system or duplicate controls already supplied by the
Kit.

First verify the installed package/version and existing secure flow for
tokens, rooms, authentication, device permissions, call events,
reconnecting, and call end. Reuse server-side token/session handling;
never expose secrets or privileged credentials in frontend code. Follow
the actual installed SDK's documented APIs. If the existing
implementation differs from the expected UI Kit, document the
discrepancy and reuse the working implementation instead of replacing it
blindly.

### Desktop consultation layout

-   Main area: existing ZEGOCLOUD video UI and its native call controls.
-   Context panel: patient identity, relevant allergies/medications,
    dermatology summary, and selected clinical photos.
-   Clinical actions: open examination, upload/review photos, write
    notes, open the existing prescription workflow, and plan follow-up.
-   Allow the context panel to collapse when supported. Keep video as
    the main focus and do not squeeze it into an unusably narrow column.

### Tablet/mobile

-   Tablet: collapse the context panel into a drawer/panel when space is
    limited.
-   Mobile: prioritize video and essential call controls. Show patient
    context and clinical actions through a labelled panel, drawer,
    bottom sheet, or switchable view. Do not force a narrow two-column
    layout.
-   Respect safe areas, viewport resizing, portrait/landscape where
    relevant, and browser permission prompts. Do not clip call controls.

### Call lifecycle and clinical continuity

Handle supported states such as waiting, connecting, connected,
reconnecting, permission denied, device unavailable, network error,
ended, and failed. Give actionable permission/device guidance. Clearly
distinguish leaving a call from ending the consultation if the workflow
supports both. On call end, return to a useful patient workspace state
and preserve saved data. Link the call to the correct
patient/appointment/encounter where supported.

If recording or transcription exists, follow existing consent, privacy,
retention, and access-control rules. Never auto-save unreviewed AI
transcript as a finalized note. If in-person examination, dermoscopy,
biopsy, or urgent assessment is needed, use the existing
referral/follow-up pathway; do not imply all skin conditions can be
diagnosed remotely.

## 11. AI assistant/copilot

Reuse existing assistant services. Make the panel collapsible and
responsive; on mobile use a drawer or bottom sheet. It must not dominate
or compress the clinical workspace. Clearly label AI-generated content
and keep it as a draft until the clinician explicitly accepts it. Never
fabricate findings or claim image analysis unless that capability
actually exists and has returned a result. Preserve privacy,
authorization, and audit behavior.

## 12. Responsive UI/UX requirements

Treat mobile as an adaptive web app, not a shrunken desktop screen.

**Desktop** - Efficient use of available width; compact patient list;
persistent patient header and tabs. - Clinical content gets priority
over the assistant panel. - Consistent content widths, aligned forms,
intentional sticky areas, and minimal nested scrollbars.

**Tablet** - Reflow cards and fields. - Allow patient list and assistant
to collapse into panels/drawers. - Keep all tabs accessible through
wrapping, horizontal scrolling, or a labelled "More" menu. - Ensure
modal footers/actions remain reachable.

**Mobile** - Single-column layout; compact patient identity and
accessible patient switcher. - Essential actions remain visible;
secondary actions move to an accessible overflow menu. - Use full-width
fields, readable text, consistent spacing, and touch targets around
44×44 CSS pixels where practical. - Tabs may scroll horizontally or use
a labelled section selector, but all sections must remain
discoverable. - No clipped labels, overlapping controls, off-screen
dialogs, or unintended horizontal page overflow. - Ensure keyboard
visibility and scroll-to-field behavior. - Convert wide tables to
cards/rows or intentional horizontal scrolling only where necessary. -
Responsive adaptation may relocate controls but must never remove
functionality.

Across all sizes: one dominant primary action per section; consistent
secondary buttons; distinct destructive actions with confirmation;
accessible names for icon-only buttons; visible keyboard focus; proper
loading/disabled/success/error states; do not rely on color alone;
respect reduced-motion settings.

## 13. Accessibility, privacy, and clinical safety

Use semantic headings and labels, accessible names, field-associated
errors, keyboard navigation, sufficient contrast, and visible focus.
Preserve authorization at UI and API/service layers. When switching
patients, reload/reset all patient-specific records, images, call
context, and form state safely so data never leaks across patients.
Associate uploads and async saves with the correct patient/encounter. Do
not log sensitive clinical text, private image URLs, or call
credentials. Missing data must not be represented as a normal/negative
finding. Clinical decision support is assistance, not a substitute for
clinician judgment.

## 14. Engineering constraints

Keep existing routes, permissions, APIs, database semantics, and
workflows compatible. Prefer reusable components and existing
form/validation libraries. Avoid monolithic components, arbitrary inline
styling, duplicate CSS systems, unnecessary dependencies, and mock APIs.
Prevent duplicate submissions/race conditions. Preserve draft state
after recoverable errors. Add progress indicators and clear error
recovery. Do not remove features merely because they are not visible in
the screenshots. Do not claim functionality is complete unless it is
connected end-to-end and tested.

## 15. Implementation order

1.  Audit architecture, skills, Design System V2, Dermatology and
    General Physician workspaces, ZEGOCLOUD integration, APIs, and data
    models.
2.  Map existing workflows and identify reusable components/services.
3.  Align shared UI with Design System V2.
4.  Improve workspace shell, patient header, tabs, side panels,
    scrolling, and responsive behavior.
5.  Improve Overview.
6.  Improve Examination using General Physician patterns.
7.  Improve Photos & Body Map, including upload, tags, preview, and
    comparisons.
8.  Improve Procedures.
9.  Reuse and extend the existing General Physician
    prescription/investigation workflow.
10. Improve Documents.
11. Integrate the existing ZEGOCLOUD UI Kit into the dermatology
    consultation workflow.
12. Run responsive, accessibility, and regression testing across all
    tabs, popups, drawers, forms, uploads, and call states.
13. Report actual changes, reused components/services, checks/tests run,
    known limitations, and any backend work still required.

Do not stop after the shell or Overview. The scope includes every
Dermatology tab and its forms/popups plus teleconsultation.

## 16. Acceptance checklist

-   [ ] Design System V2 is used consistently for typography, spacing,
    color, fields, buttons, icons, cards, tabs, dialogs, and states.
-   [ ] Existing Dermatology data loads and persists through real
    services.
-   [ ] All existing features and actions remain available.
-   [ ] Examination supports dermatology-specific findings while
    following General Physician patterns.
-   [ ] Photo uploads, tags, previews, and explicit before/after pairs
    work and persist.
-   [ ] Procedures and documents retain existing permissions and data.
-   [ ] Prescription, medication, investigation/lab, and notes reuse the
    General Physician workflow without duplicate records.
-   [ ] Draft/save/approval, validation, loading, and error recovery
    work correctly.
-   [ ] Switching patients cannot leak previous patient data.
-   [ ] Existing ZEGOCLOUD integration works with appropriate
    join/leave, permissions, reconnect, and error states.
-   [ ] Consultation context is linked to the correct patient/encounter
    where supported.
-   [ ] No dead buttons, mock-only features, or fake clinical data.
-   [ ] Desktop, tablet, and mobile layouts work without clipped
    controls or unintended horizontal overflow.
-   [ ] Keyboard navigation, visible focus, labels, and accessible error
    messages work.
-   [ ] Relevant tests, lint, and type checks pass where available; no
    avoidable console errors or regressions.

## Final instruction

Act as a senior clinical-workflow architect, product designer, and
frontend engineer. Inspect the actual code before making decisions,
preserve working functionality, modernize the entire Dermatology
experience, reuse Design System V2, reuse the General Physician
clinical/prescription workflow, and integrate the existing ZEGOCLOUD UI
Kit safely. Implement the work, run the available checks, and report
only what was actually completed. If a capability requires a backend/API
that does not exist, do not fake it; state the gap and separate required
backend work from completed UI work.
