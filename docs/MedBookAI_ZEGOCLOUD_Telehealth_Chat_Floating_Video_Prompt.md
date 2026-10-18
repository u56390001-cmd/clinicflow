# MedBook AI --- ZEGOCLOUD Telehealth Upgrade

## One-Pass Implementation Prompt for the AI Coding Agent

### Goal

Upgrade the **existing working ZEGOCLOUD video consultation** in MedBook
AI. Keep the current video-call engine and working doctor/patient join
flow, but add the missing consultation workspace, two-way chat with
image/document sharing, and a movable/resizable mini-video so the doctor
can continue using the Clinic Management System (especially
prescriptions) during a live call.

This is an implementation task, not a mockup. Connect features to real
patient/session data and storage, test them, and report what is actually
working.

## 1. Read the inspection report and audit current WIP first

Use `docs/ZEGOCLOUD uikit inspection report.md` as the verified
baseline. It reports: - Installed package:
`@zegocloud/zego-uikit-prebuilt` **2.18.4**. - Current doctor/patient
views use the Prebuilt UIKit; video, microphone, camera, and doctor-side
screen sharing work. - `showTextChat` is currently disabled on both
sides. - `zego-zim-web` and `zego-superboard-web` are not installed. -
The SDK has no documented frame-capture API and no explicit
reconnect-state callback in the installed typings. - Deep restyling of
UIKit internals is not supported; build our own surrounding UI rather
than manipulating undocumented internal DOM. - WIP additions already
exist in the working tree:
`components/telehealth/telehealth-context.ts`,
`components/telehealth/telehealth-context-panel.tsx`,
`resumeTelehealthSessionAction`, and `captureTelehealthFrameAction` in
`lib/actions/telehealth.ts`. Audit these before changing anything.

Inspect these actual files and their callers: -
`components/telehealth/telehealth-launcher.tsx` -
`components/telehealth/telehealth-join.tsx` -
`app/telehealth/join/page.tsx` -
`components/patients/record/record-banner.tsx` - `lib/zego/server.ts` -
`lib/actions/telehealth.ts` - `telehealth_sessions` schema/types and
existing patient document/upload/chat services.

First check current git diff/status and understand the WIP changes. **Do
not discard or overwrite useful uncommitted work.** Reuse and complete
it if correct; remove only code that is demonstrably incorrect or
unnecessary, and explain any removal.

## 2. Implement these features in the same task

### A. Consultation workspace around the existing UIKit

Build a professional doctor-side workspace inspired by the supplied
ZEGOCLOUD telehealth reference images: - Keep the existing Prebuilt
UIKit as the call engine. - Add a branded MedBook AI/clinic header and
clear call status. - Use a main video area with a collapsible
patient-context panel showing real, authorized data: allergies, current
medicines, recent labs/photos, last visit, and encounter details where
available. - Add quick links to the existing patient record tabs:
Examination, Photos, and Prescription. - Show camera/microphone status
using verified SDK callbacks. - Show meaningful states such as joining,
waiting for patient, patient connected, ended, and failure using
available callbacks. - Prevent the doctor from being automatically
removed from an empty room: set
`autoLeaveRoomWhenOnlySelfInRoom = false` on the created UIKit instance,
not in `joinRoom` config. - Add room timer and leave-confirm behavior
using the installed SDK options where supported. - Do not duplicate call
controls already provided by the UIKit or attempt unsupported deep
restyling of its internal toolbar. - On tablet/mobile, collapse context
panels into accessible drawers/bottom sheets.

### B. Movable and resizable mini-video --- critical

The doctor must be able to keep the patient's live video visible while
using other CMS screens, including prescription, notes, examination, and
photos.

Implement a **custom in-app floating video window**: - Provide modes:
expanded consultation workspace, docked/minimized mini-video, and
restored/expanded view. - Allow dragging the mini-video around the
visible viewport using mouse and touch. - Provide resize handles or
clear size controls (small/medium/large) and suitable aspect-ratio
options while preserving the video's aspect ratio by default. - Include
minimize, restore, and close/end-call actions that are visually
distinct. Closing the mini-window must not accidentally end the call;
provide a separate explicit end-call action with confirmation. - Keep
the mini-video above normal CMS content without blocking essential form
controls. Constrain dragging/resizing to the viewport, account for
browser resizing, and prevent it from being dragged permanently
off-screen. - Maintain the active call across internal CMS route/tab
navigation. Mount the call/floating layer at a persistent
application-shell/layout level or use the appropriate existing
architecture so changing the patient record tab does not unmount and
drop the call. - Preserve the current session/room and reacquire a fresh
doctor token through the existing secure server action when resuming.
Store only non-secret identifiers such as session ID/room ID/join URL in
session storage if needed; **never store tokens or secrets in browser
storage**. - Restore the mini-video's last position/size for the active
session if safe and useful, without persisting patient-sensitive data. -
Ensure it behaves correctly on prescription forms, dropdowns, modals,
sidebars, and smaller screens. - On mobile, use a compact movable
mini-player only where it remains usable; otherwise provide a clear
switch between call view and clinical workspace, with a persistent
return-to-call control. - Optionally support browser-native
Picture-in-Picture only if compatible with the actual remote video
element, browser support, and current UIKit lifecycle. Treat native PiP
as an enhancement, **not a replacement** for the in-app floating window.
Verify it works before exposing the button.

Do not reparent React-managed elements into undocumented UIKit
internals. Render our floating window in the app's own React/layout
layer and use documented SDK callbacks/streams.

### C. Two-way chat with images and documents --- main collaboration requirement

Build a clean chat panel that works for **both doctor and patient**
during the same telehealth session. It should resemble the reference
experience: message list, composer, attachment button, image preview,
document cards, and upload/send status.

Required behavior: - Doctor can send text, images, and documents to the
patient. - Patient can send text, images, and documents to the doctor. -
Both sides see new messages/attachments in the same conversation,
associated with the correct `telehealth_session` and
patient/encounter. - Show sender, timestamp, attachment name/type/size,
upload progress, sent/failed state, retry, and image
thumbnails/preview. - Support the file types and size limits actually
allowed by the backend; validate files before upload and display
understandable errors. - Allow opening/downloading authorized PDFs and
other documents; do not execute or render unsafe file types. - Add
empty, loading, offline/failure, and permission-denied states. - Do not
use fake messages or hard-coded example attachments. - Use the existing
CMS patient-document/storage service where appropriate, with secure
upload and access control. If chat attachments need separate metadata,
add a proper session-message/attachment model or reuse an existing
compatible model after inspecting the schema. - Store metadata and
secure file references, not publicly exposed patient files. Verify
authorization on every fetch/download and enforce clinic/tenant
isolation. - Ensure switching patients/sessions cannot leak previous
messages or files. - Patient UI must work in the existing zero-app web
join route; no app installation should be required.

#### Choose the safest working messaging implementation

The inspection report says `showTextChat` exists in UIKit typings but
chat behavior without a separately initialized ZIM dependency is
unverified, and `zego-zim-web` is not installed.

1.  Test the existing UIKit's documented text-chat path against the
    actual installed 2.18.4 setup.
2.  If it works reliably for both participants, it may be used for
    simple in-call text chat.
3.  For **reliable two-way image/document attachments and durable
    message history**, use the existing CMS messaging/realtime backend
    if one exists. If not, implement a minimal secure session-chat
    service with persisted messages and attachment metadata, plus
    realtime delivery using an already available supported realtime
    mechanism.
4.  Add ZIM only if necessary, version-compatible, and justified after
    testing. Do not install it blindly or make video calls depend on
    chat being available.
5.  If chat/file sharing fails, the video call must continue normally.
    Show a useful chat error and allow retry.

Do not confuse the built-in screen-sharing button with file sharing. A
document attachment must be uploaded, stored securely, displayed to the
other participant, and remain accessible under the correct authorization
rules.

### D. Frame capture into patient documents (complete the existing WIP)

The installed SDK has no dedicated frame-capture API. If the WIP
implementation uses standard browser video/canvas APIs, verify it
safely: - Capture only the actual remote patient video stream, never
accidentally capture the doctor's local camera or the whole page. -
Confirm that the remote video element has a valid `MediaStream` and
non-zero video dimensions. - Capture a still using browser canvas APIs,
generate a Blob, and show a preview. - Require the doctor to explicitly
confirm before saving the image to the patient's documents. - Allow
cancel/retry; do not save on button click without
preview/confirmation. - Reuse the existing patient-document upload
service and `captureTelehealthFrameAction` if correct. - Allow optional
dermatology photo tagging (body region, photo type, lesion note) and
associate with the active visit where supported. - Show progress,
success, and recoverable errors. Audit the capture event. - If
browser/security/CORS constraints prevent a valid capture, fail
gracefully and offer normal patient photo upload instead. - Never
fabricate or modify a clinical image.

### E. Session resume, encounter linkage, and safe lifecycle

-   Complete and test the WIP `resumeTelehealthSessionAction`.
-   A page refresh or recoverable interruption should let the doctor
    rejoin the same eligible session rather than create a duplicate
    room.
-   Store no tokens in local/session storage. Obtain fresh tokens
    through the secure server action.
-   Link the session to the current appointment and encounter when
    available. The inspection report says `appointment_id` exists but is
    not currently written, and `visit_id` is absent; inspect the real
    schema and add a migration only if necessary.
-   Ensure captured photos/notes are associated with the correct patient
    and encounter.
-   Keep start/end/resume/frame-capture audit events and surface call
    history in the patient timeline where supported.
-   Avoid duplicate start/end actions and handle concurrent requests
    idempotently.
-   Do not invent a reconnection callback: the SDK has built-in
    reconnect behavior but does not expose an explicit reconnect-state
    callback in the inspected typings. Use only verified events and
    provide a generic recovery/rejoin action when needed.
-   Preserve the current 2-hour token lifetime behavior safely; if token
    renewal is implemented, use the actual server-side token minting
    flow and test it.

### F. Patient-side experience

Improve the existing patient join page and in-call experience so it
matches the doctor-side workflow: - Keep the current no-app/browser join
flow. - Add clear clinic branding and useful "waiting for doctor" /
"call ended" states. - Provide the same two-way chat and attachment UI,
subject to session authorization. - Make camera/microphone permission
errors understandable and actionable, but do not pretend the SDK exposes
custom permission callbacks if it does not. - Ensure the patient cannot
access another patient's records or session attachments. - Do not allow
an unverified person with a public bearer link to view clinical records
or unrelated files. Review the current join-link authorization
limitations and strengthen them using existing appointment/session
identity checks where possible.

## 3. Design and responsive requirements

Use the existing MedBook AI **Design System V2** and the project's
installed frontend UI/UX skills: - Reuse existing semantic color,
typography, spacing, button, input, card, dialog, drawer, and focus
tokens. - Keep the visual style clean, clinical, modern, and consistent
with the rest of the CMS. - Desktop: video workspace + collapsible
patient context/chat panels + floating mini-video when the doctor
navigates elsewhere. - Tablet: panels collapse or become drawers;
floating video remains draggable/resizable without hiding important
actions. - Mobile: touch-friendly call controls, compact mini-video or
explicit call/workspace switching, chat/attachments in a drawer or
bottom sheet, no clipped controls or horizontal overflow. - Maintain
accessible labels, visible keyboard focus, keyboard operation where
applicable, and sensible touch targets. - Use one clear primary action
per panel and distinct call-end versus minimize/close-window controls. -
Handle long filenames, large images, upload progress, network failures,
empty states, and permission errors.

## 4. Scope boundaries

**In scope now:** consultation shell/context, status controls, quick
links, persistent draggable/resizable video, two-way text chat,
image/document attachments both directions, frame capture with
confirmation, session resume, encounter/appointment linkage, basic
patient-side improvements, audit trail, and responsive testing.

**Out of scope for this task unless already implemented and proven:**
SuperBoard/whiteboard annotation, cloud recording, AI transcription, AI
diagnosis, vitals widget, machine/device integration, and complex
multi-party calling. Do not spend time on these now. Do not add a
decorative vitals widget without a real vitals data source.

## 5. Implementation rules

-   Preserve the working video/microphone/camera/screen-share
    integration.
-   Inspect current git changes before editing and reuse the existing
    WIP files if correct.
-   Do not deep-restyle the Prebuilt UIKit internals or manipulate
    undocumented DOM.
-   Do not use `requireRoomForegroundView()` to reparent React-managed
    components.
-   Do not expose `ZEGO_SERVER_SECRET`, tokens, or privileged
    credentials to the browser.
-   Do not store tokens in browser storage.
-   Keep the video call independent from optional chat/file-sharing
    failures.
-   Use real services and persistence, not mock state.
-   Use server-side authorization for patient/session/file access and
    tenant isolation.
-   Avoid unnecessary dependencies; add ZIM or other packages only after
    verifying compatibility and necessity.
-   Do not silently discard existing code or data.
-   If a feature cannot be completed because a backend/SDK capability is
    missing, report the exact gap and implement the safest available
    fallback.

## 6. Test plan and acceptance criteria

Before declaring completion, test:

### Video and workspace

-   [ ] Existing doctor and patient can still join the same call.
-   [ ] Doctor is not auto-removed simply because the patient has not
    joined yet.
-   [ ] Camera/microphone controls and screen sharing still work.
-   [ ] Patient join, leave, end-call confirmation, and call-ended
    states work.
-   [ ] Floating video can be dragged and resized by mouse and touch.
-   [ ] Mini-video stays visible while navigating between patient tabs,
    especially prescription.
-   [ ] Resize/browser viewport changes keep the mini-video within
    bounds.
-   [ ] Minimize/restore does not end the call; ending the call is a
    separate explicit action.
-   [ ] Refresh/recovery resumes the same valid session without storing
    tokens in browser storage.

### Chat and files

-   [ ] Doctor sends text to patient; patient receives it.
-   [ ] Patient sends text to doctor; doctor receives it.
-   [ ] Doctor sends an image/PDF/document; patient can
    preview/open/download it.
-   [ ] Patient sends an image/PDF/document; doctor can
    preview/open/download it.
-   [ ] Upload progress, invalid file, failed upload, retry, and
    offline/error states work.
-   [ ] Attachments and messages are associated with the correct
    session/patient/encounter.
-   [ ] Unauthorized users cannot access another session's messages or
    files.
-   [ ] A chat service failure never terminates or breaks the video
    call.

### Frame capture and data integrity

-   [ ] Captured frame is from the remote patient stream and has a
    preview.
-   [ ] Cancel does not save; explicit confirm saves once only.
-   [ ] Saved image appears in the correct patient documents and
    optional dermatology tag.
-   [ ] Session links to the correct appointment/encounter where
    available.
-   [ ] Audit events and call history work according to the existing
    audit model.
-   [ ] Switching patients cannot leak context, chat, files, or captured
    images.

### Responsive and code quality

-   [ ] Desktop, tablet, and mobile layouts are usable without clipped
    controls or unintended horizontal overflow.
-   [ ] Chat drawer and file preview work at narrow widths.
-   [ ] Prescription forms remain usable while the mini-video is
    visible.
-   [ ] Build, lint, type checks, and relevant tests pass where
    available.
-   [ ] No avoidable console errors, mock-only actions, or regressions.

## 7. Final report required

After implementation, provide a concise report with: 1. Features
completed and how to test each one. 2. Files changed and existing WIP
files reused/modified. 3. Any database migrations or environment/console
setup required. 4. Tests actually run and their results. 5. Any
remaining limitations, clearly separated from completed work.

**Final instruction:** Implement this whole scoped upgrade in one
coordinated pass while preserving the current working ZEGOCLOUD call.
Prioritize two-way chat with images/documents and the
draggable/resizable floating mini-video so the doctor can continue
working in the CMS during the consultation. Do not stop after writing a
plan or producing a visual mockup.
