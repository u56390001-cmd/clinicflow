# ZEGOCLOUD Prebuilt UIKit — Integration Inspection Report

**Scope**: the existing ZEGOCLOUD video-consultation integration in MedBookAI, exactly as it is wired today — SDK version, file map, token/session flow, the full API surface the installed SDK exposes, verified limitations, and a menu of customisations you can pick from.

**Method**: read the shipped SDK typings (`node_modules/@zegocloud/zego-uikit-prebuilt/index.d.ts`, v2.18.4), the repo integration files, and the `telehealth_sessions` schema. Anything I did not verify from code or the SDK typings is marked **[unverified]**.

---

## 1. What is installed

| Item | Value |
| --- | --- |
| Package | `@zegocloud/zego-uikit-prebuilt` |
| Declared in `package.json` | `"^2.18.4"` |
| Resolved install | 2.18.4 (typings = `index.d.ts`, single UMD bundle `zego-uikit-prebuilt.js`) |
| Bundled inside prebuilt | Express (RTC, exposed as `zp.express`) + RoomKit/UI kit |
| NOT installed | `zego-superboard-web` (Super Board / whiteboard plugin), `zego-zim-web` (ZIM IM SDK) |
| Env vars | `NEXT_PUBLIC_ZEGO_APP_ID` ✅ set, `ZEGO_SERVER_SECRET` ✅ set, `ZEGO_APP_ID` ✗ not set (optional fallback) |

`lib/zego/server.ts:40` reads `NEXT_PUBLIC_ZEGO_APP_ID ?? ZEGO_APP_ID` plus `ZEGO_SERVER_SECRET`; a bad/missing value makes `getZegoConfig()` return `null`, and every call path then refuses to start with a clear message.

---

## 2. File map (as built)

| File | Role |
| --- | --- |
| `lib/zego/server.ts` | **Server-only** token minting + room-id builder. Never imported by a Client Component. |
| `lib/actions/telehealth.ts:62` | `startTelehealthSessionAction(patientId)` — mints tokens, inserts the session, sends WhatsApp, returns doctor token + patient link. |
| `lib/actions/telehealth.ts:253` | `endTelehealthSessionAction(sessionId)` — idempotent close (`status = COMPLETED`, `ended_at`). |
| `lib/actions/telehealth.ts:313` | `resumeTelehealthSessionAction(sessionId)` — re-mint a doctor token for an open session (refresh/drop recovery). ⚠️ added in the work-in-progress branch, not yet committed. |
| `lib/actions/telehealth.ts:464` | `captureTelehealthFrameAction(formData)` — save a captured frame as a patient document (+ optional derm photo tag). ⚠️ same WIP status. |
| `components/telehealth/telehealth-launcher.tsx` | Doctor-side floating UIKit panel (251 lines). Mounted from the record header. |
| `components/patients/record/record-banner.tsx:312` | Mount point — `<TelehealthLauncher patientId whatsappNumber canManage />`, shared by GP / psychology / dermatology records. |
| `components/telehealth/telehealth-join.tsx:36` | Patient-side zero-app UIKit view (its own `joinRoom` options). |
| `app/telehealth/join/page.tsx:22` | Public patient entry route (`?room=&token=`), service-role joinability gate, `robots: noindex`. |
| `types/database.ts` → `telehealth_sessions` | `id, clinic_id, doctor_id, patient_id, appointment_id, room_id, status, started_at, ended_at, patient_join_url, created_by, metadata, created_at, updated_at`; `status = SCHEDULED \| ACTIVE \| COMPLETED \| CANCELLED`; clinic-member RLS + immutability/`updated_at` triggers. |

**Room identity**: `buildTelehealthRoomId()` → `clinic_{clinicId}_doc_{doctorId}_pat_{patientId}_{epochMillis}` — tenant-scoped, unique per call start.

**Token flow** (`lib/zego/server.ts`):

- `generateKitToken()` hand-builds the ZEGO `04` token: `04` + base64(28-byte header + AES-CBC ciphertext) + `#` + base64({userID, roomID, userName, appID}). Key size auto-selects aes-128/192/256-CBC from the secret length. Lifetime **2 hours** (`TOKEN_TTL_SECONDS = 2*60*60`).
- Doctor token: `userId = auth user id`. Patient token: `userId = patient_{patientId}` — different identities in the same room, so presence and the user list are correct.
- Tokens are **never persisted**: the doctor's lives in React state; the patient's rides in the URL. That is why resume needs a fresh server mint.

---

## 3. What is enabled today

Doctor panel (`telehealth-launcher.tsx`):

```
container, scenario: OneONoneCall,
showPreJoinView: false, turnOnMicrophoneWhenJoining: true, turnOnCameraWhenJoining: true,
showUserList: false, showTextChat: false, showLeavingView: false, showScreenSharingButton: true
```

Patient view (`telehealth-join.tsx`):

```
container, scenario: OneONoneCall,
showPreJoinView: true, turnOnMicrophoneWhenJoining: true, turnOnCameraWhenJoining: true,
showUserList: false, showTextChat: false, showLeavingView: true
```

So today: video + mic + screen share, native kit controls, NO chat, NO user list, no timer, no whiteboard, and no clinical context next to the video.

---

## 4. Full `joinRoom` option surface in 2.18.4

Every option below exists in the installed typings (`ZegoCloudRoomConfig`). **Bold** = our current value.

### 1.1 Global / shell
`container`, `maxUsers` (2–20; unlimited by default), `scenario: { mode, config }`, `console` (log level), `screenSharingConfig { resolution, width, height, frameRate, maxBitRate, onError(errorCode) => string|undefined }`.

### 1.2 Pre-join & devices
`showPreJoinView` (**false doctor / true patient**), `preJoinViewConfig { title }`, `turnOnMicrophoneWhenJoining` (**true**), `turnOnCameraWhenJoining` (**true**), `useFrontFacingCamera`, `videoResolutionDefault`, `enableStereo`.

### 1.3 Room view
`showRoomDetailsButton`, `showRoomTimer`, `showMyCameraToggleButton`, `showMyMicrophoneToggleButton`, `showAudioVideoSettingsButton`, `showTurnOffRemoteCameraButton`, `showTurnOffRemoteMicrophoneButton`, `showTextChat` (default **true** in SDK; **false** here), `showUserList` (**false**), `showRemoveUserButton`, `lowerLeftNotification { showUserJoinAndLeave, showTextChat }`, `branding { logoURL }`, `layout: "Sidebar" | "Grid" | "Auto"`, `showLayoutButton`, `showNonVideoUser`, `showOnlyAudioUser`, `sharedLinks[]`, `showScreenSharingButton` (**true**), `showPinButton`, `whiteboardConfig { showCreateAndCloseButton, showAddImageButton }`, `showInviteToCohostButton`, `showRemoveCohostButton`, `showRequestToCohostButton`, `rightPanelExpandedType`, `autoHideFooter`, `enableUserSearch`, `videoCodec: "H264" | "VP8"`.

### 1.4 Leaving view
`showLeavingView` (**false doctor / true patient**), `showLeaveRoomConfirmDialog`, `leaveRoomDialogConfig { titleText, descriptionText, confirmCallback }`.

### 2. Callbacks
`onJoinRoom()`, `onLeaveRoom()`, `onUserJoin(users)`, `onUserLeave(users)`, `onUserAvatarSetter(users)`, `onLiveStart`, `onLiveEnd`, `onYouRemovedFromRoom()`, `onInRoomMessageReceived(info)`, `onInRoomCommandReceived(fromUser, command)`, `onInRoomTextMessageReceived(messages)`, `onInRoomCustomCommandReceived(commands)`, `onReturnToHomeScreenClicked()`, `customMessageUI(msg) => Element`, `addInRoomMessageMessageAttributes()`, `language`, `showMoreButton`, `showUserName`, `hideUsersById[]`, `videoViewConfig[]`, `videoScreenConfig { objectFit, localMirror, pullStreamMirror }`, `onSendMessageResult(response)`, `onScreenRotation(currentScreen)`, `onUserStateUpdated(status)` (`"Normal" | "Banned"`), `memberViewConfig { operationListCustomButton }`, `sendMessageChannel: "RTC" | "ZIM"`, `showBackgroundProcessButton`, `onStreamUpdate(streamId)`, `onLocalStreamUpdated(state, streamId, stream?)`, `onScreenSharingStreamUpdated(state, streamId, stream?)`, `onWhiteboardUpdated(state, whiteboardId)`, `onCameraStateUpdated(state: "ON"|"OFF")`, `onMicrophoneStateUpdated(state: "ON"|"OFF")`, `requireRoomForegroundView() => HTMLElement`.

### 3. Instance API (on the object returned by `create()`)
`express` (raw `ZegoExpressEngine`), `localStream: MediaStream | undefined`, `joinRoom(config)`, `destroy()`, `addPlugins({ ZegoSuperBoardManager?, ZIM? })`, `setCallInvitationConfig`, `sendCallInvitation`, `sendInRoomCommand`, `sendInRoomCustomCommand`, `hangUp()`, `setLanguage`, `autoLeaveRoomWhenOnlySelfInRoom: boolean`, `getRoomID()`, `updateCallingInvitationListConfig`, `rotateToLandscape()`, `rotateToPortrait()`, `renewToken()`.

Statics: `create(kitToken, { cloudProxyConfig?, AiDenoiseConfig? })`, `generateKitTokenForTest`, `generateKitTokenForProduction`, `getVersion()`, scenario constants (`OneONoneCall`, `GroupCall`, `LiveStreaming`, `VideoConference`), resolution constants (180P–720P), `Host/Cohost/Audience`, log-level constants.

---

## 5. Verified limitations & gotchas

These matter because several "obvious" customisations are not possible in the prebuilt kit:

1. **No snapshot/frame-grab API.** There is no `captureFrame`/`screenshot` in the SDK. Grabbing a still from the call must be done with web standards: find the remote `<video>` inside the container (`v.srcObject` is a `MediaStream` that differs from `zp.localStream`, `v.videoWidth > 0`), draw it to a `<canvas>`, `canvas.toBlob("image/png")`. Frame-grab is therefore client-only and requires preview + explicit confirm (clinical-safety rule).
2. **No reconnection-state callback.** The kit has built-in auto-reconnect and shows its own network banner, but it does not expose "reconnecting / reconnected" to us. Our own connection status can only be inferred from `onJoinRoom` / `onLeaveRoom` / `onUserLeave` / `onStreamUpdate`.
3. **`autoLeaveRoomWhenOnlySelfInRoom` is an *instance property*, not a `joinRoom` option.** Set `zp.autoLeaveRoomWhenOnlySelfInRoom = false` (default behaviour can make a doctor who joins first get kicked out of an empty room).
4. **`screenSharingConfig.onError(errorCode)` returns the message string** (or `""` to suppress the kit's own prompt). It is not a "notification hook"; to show a toast, return `""` and toast yourself.
5. **Chat needs care.** `showTextChat` defaults to true in the SDK; we disable it. In-room messages are delivered over `sendMessageChannel: "RTC" | "ZIM"`. Whether the bundled prebuilt can run chat without a separately initialised ZIM instance is **[unverified]** — must be tested before promising chat.
6. **Whiteboard / Super Board is a separate package** (`zego-superboard-web`, docs pin 2.15.3) attached via `zp.addPlugins({ ZegoSuperBoardManager })`. `whiteboardConfig.showAddImageButton` additionally needs the **File Sharing** feature enabled in the ZEGO console, otherwise the kit shows *"Failed to add image, this feature is not supported."* Console state is not checkable from code — therefore any whiteboard work must fail soft.
7. **No recording / transcription / AI-audio API** in the prebuilt kit. ZEGO offers cloud recording as a separate product; on-device recording would have to go through the raw `zp.express` engine and is a large, separate piece of work.
8. **Prebuilt UI cannot be restyled deeply.** Colour/branding is limited to `branding.logoURL` and the surrounding chrome *we* build (header, status chips, context panel). Anything inside the kit's toolbar is the vendor's layout.
9. **`requireRoomForegroundView()` reparents the returned DOM node** into the kit's own tree. Because React owns that node, handing React-managed markup over is risky (double-mount/removal errors). Safer to render our own toolbar next to the kit, not above it.
10. **Token lifetime is 2 hours, fixed** (`TOKEN_TTL_SECONDS`). `renewToken()` exists, but our server mint has a fixed TTL; extending a long call needs a refresh path.
11. **The patient link is a bearer capability.** It is sent over WhatsApp and copied to the clipboard; anyone with the link can join while the row is `SCHEDULED/ACTIVE`. Join-time gating already exists (`isRoomJoinable`, service-role), but there is no per-patient identity check.
12. **`appointment_id` exists on the table but is never written** — consultations are not linked to an appointment, and `telehealth_sessions` has **no `visit_id`** either. Linking a call to the encounter is a real gap if the call should stamp notes/photos.
13. **Mobile**: the kit is usable on phones, but the two-screen doctor layout (video + notes) needs our own responsive shell; the kit itself does not provide one.

---

## 6. Customisation menu

Pick by ID; I will implement exactly what you select. Effort/risk is relative to this codebase.

### A — Shell & layout (doctor side)
- **A1** [S] Turn the floating panel into a real workspace: `floating` (today), `expanded` (full-screen overlay), `docked` (thin bar). *(low risk)*
- **A2** [S] Keep video as the primary region with a collapsible right-hand clinical context panel; on mobile turn the panel into a bottom sheet. *(low risk)*
- **A3** [XS] Native room timer (`showRoomTimer: true`) + native leave-confirm dialog (`showLeaveRoomConfirmDialog: true`). *(trivial)*
- **A4** [S] Branding: `branding.logoURL` + our own header showing clinic + doctor name. *(trivial)*
- **A5** [M] `layout: "Sidebar" | "Grid"` + `showLayoutButton` for screen-share/grid switching. *(low risk)*

### B — Call & device controls
- **B1** [S] Device-state chips in our header via `onCameraStateUpdated` / `onMicrophoneStateUpdated`. *(low risk)*
- **B2** [S] Fix the "doctor alone gets auto-left" behaviour: `autoLeaveRoomWhenOnlySelfInRoom = false`. *(should be default; low risk)*
- **B3** [S] Presence states (J*oining → Waiting for patient → Patient connected → Ended*) via `onJoinRoom` / `onUserJoin` / `onStreamUpdate` / `onUserLeave` / `onLeaveRoom` / `onYouRemovedFromRoom`.
- **B4** [S] Mute-remote / follow-remote-camera buttons (`showTurnOffRemoteCameraButton`, `showTurnOffRemoteMicrophoneButton`). *(may feel intrusive for patients; your call)*
- **B5** [M] AI noise suppression for telehealth audio (`create(token, { AiDenoiseConfig: { mode: AI | AIBalanced } })`). *(worth testing on real devices)*
- **B6** [M] Lower resolution / bandwidth caps for weak patient networks (`videoResolutionDefault`, `screenSharingConfig.{resolution,frameRate,maxBitRate}`, `videoCodec`).

### C — Clinical workflow (the differentiators)
- **C1** [M] **Frame capture → patient document**: button in our toolbar, canvas grab of the remote video, preview modal, explicit confirm, saved to the patient's documents (bucket + `patient_documents`), audit-logged. *(partially built in WIP)*
- **C2** [S] **Frame capture → derm photo tag**: same frame optionally tagged with body region / photo type / lesion note and, when a visit is live, stamped with `visit_id`. *(reuses the existing derm photo action)*
- **C3** [M] **Session resume**: remember `{sessionId, roomId, joinUrl}` in `sessionStorage` (never the token) and re-mint on demand, so a refresh or a dropped connection can rejoin the same room instead of starting a new call.
- **C4** [S] **Live visit link**: link the session to the current encounter/visit (needs a `visit_id` column on `telehealth_sessions`) so notes/photos captured during the call carry the encounter.
- **C5** [M] **Auto-drafted consultation summary** from the ambient-copilot pipeline after the call (we already have the AI path) — draft note attached to the visit for the doctor to edit.
- **C6** [L] **Recording** (cloud recording product or raw `zp.express`) with consent capture + storage. *(large, separate effort; consent UI is mandatory)*
- **C7** [M] Show the context panel content: allergies, current meds, recent labs/photos, last visit — read-only, from the record we already load.
- **C8** [S] Quick links back into the record tabs from the call panel (Examination / Photos / Prescription).

### D — Collaboration
- **D1** [S–M] **In-call text chat** (`showTextChat: true` + `lowerLeftNotification`) — must be tested for the ZIM dependency first (see limitation 5).
- **D2** [M] **Whiteboard / Super Board** (`zego-superboard-web@2.15.3` + `addPlugins`) for doctor↔patient drawing; image upload only if the console File Sharing feature is on. *(fail soft)*
- **D3** [S] Branded in-room notifications ("Patient joined") via `lowerLeftNotification`.
- **D4** [M] Multi-party consults (`maxUsers`, `GroupCall` scenario) — e.g. specialist + GP + patient.
- **D5** [S] Invite another clinician by link (`sharedLinks`) or the built-in invitation flow.

### E — Patient side
- **E1** [XS] Patient pre-join title (`preJoinViewConfig.title`) + device check as today.
- **E2** [S] Patient-side "waiting for doctor" copy + clinic branding.
- **E3** [M] Patient-side in-call chat (pairs with D1).
- **E4** [S] "Call ended" thank-you screen with next-steps copy instead of the raw leaving view.
- **E5** [M] On-screen Arabic/Urdu/other language via `language` (SDK ships zh-CN + en-US only; other languages need our own strings).
- **E6** [M] Patient identity confirmation before joining (name/DOB prompt matched against the appointment) — closes limitation 11.

### F — Ops, safety & compliance
- **F1** [S] Audit every call lifecycle event we already log (`TELEHEALTH_START` / `END` / `RESUME` / `FRAME_CAPTURE`) and surface a call history in the patient timeline.
- **F2** [M] Token refresh for calls longer than 2 hours (`renewToken()` + a refresh server action).
- **F3** [S] Doctor-joinable-only guard: block starts when `ZEGO_SERVER_SECRET`/app id are missing, with a clear setup message (mostly exists).
- **F4** [M] Turn off stale rooms: scheduled job marking `ACTIVE` sessions with no activity as `COMPLETED`.
- **F5** [M] Consent checkbox on the doctor side before recording/screenshare-into-call, stored on the session `metadata`.

---

## 7. What I would do by default (if you just say "go")

1. **A1 + A2 + A3 + B1 + B2 + B3 + C7 + C8** — a proper consultation workspace with live context, correct presence, and no accidental auto-leave. Low risk, immediate clinical value.
2. **C1 + C2 + C3** — frame capture into the record, derm photo tagging, and refresh/drop recovery. This is the part no competitor product gives you for free.
3. **D1 + D2** — chat and whiteboard, both behind soft-fail so a missing ZIM/console feature can never break a live consultation.

## 8. Decisions I need from you

- Which menu IDs do you want (e.g. "A1, A2, B2, C1, C2, C3, D1")?
- Is the doctor-side panel allowed to become a **full-screen workspace** (A1), or must it stay as a floating panel over the notes at all times?
- **Chat**: do you want in-room text chat at all (D1)? It needs a live test for the ZIM dependency.
- **Whiteboard** (D2): needed for patient drawing, or out of scope?
- **Frame capture** (C1/C2): should captures save only on explicit confirm (recommended), and should dermatology captures default to tagging a photo (C2)?
- **Recording** (C6): in or out of scope for this round?
- Should a telehealth session be **linked to the visit/encounter** (C4)? It needs a `visit_id` column on `telehealth_sessions`.
