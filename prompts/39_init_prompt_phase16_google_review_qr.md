# INIT PROMPT — MedBook AI
## Phase 16: Google Review + QR Engagement Tool
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.7
**Target tool:** OpenCode
**Prerequisite:** None from this addendum — this is a small, independent feature with no dependency on Doctor Management, WhatsApp, or Manual Booking. It can be built at any point; this is simply the last phase in the addendum's recommended sequence.

---

## 0. IMPORTANT — READ BEFORE STARTING
This is the smallest, lowest-risk phase in the entire addendum — a static settings field plus a QR code generator, nothing more.
- Do **not** add any dynamic/patient-facing behavior beyond a static QR code and link.
- Do **not** introduce a heavy dependency for QR generation — a small, well-established client-side or lightweight server-side QR library is sufficient.
- Before writing any code: check whether a general "Engagement" or similarly-scoped settings area already exists in the dashboard, or whether this should live under existing Clinic Settings (Phase 2) — reuse an existing settings page/section if a natural fit exists rather than creating a new top-level nav item for one field.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–15 (or whichever prior phases are already built at the time this runs).

## 2. OBJECTIVE
Let a clinic paste their Google Business review link once, then generate, preview, and download a printable QR code that patients can scan (e.g. at the front desk or on a receipt) to leave a Google review.

## 3. SCOPE

### A. Settings field
- Add `google_review_url` to an appropriate existing settings table — check first: if `clinic_ai_settings` or a general clinic settings table already has room for this kind of simple marketing/ops field, add it there rather than creating a new table for a single column. Only create a new `clinic_engagement_settings` table if no reasonable existing table fits.
- Simple form: URL input with basic validation (must be a valid URL; optionally warn if it doesn't look like a Google-related domain, but don't hard-block on that — clinics may use shortened/redirect links).

### B. QR code generation
- Once a valid URL is saved, generate a QR code encoding that URL.
- Live preview shown immediately in the settings UI (client-side generation is fine and simplest — no need to store the QR image itself, just regenerate from the URL on demand).
- "Download" action producing a printable image file (PNG or SVG) at a reasonable print resolution.
- Match existing MedBook AI design tokens for the surrounding UI (card style, spacing) — the QR code itself is naturally black/white or brand-colored per whatever the chosen library supports, keep it simple and legible (a QR code that's hard to scan because of excessive styling is worse than a plain one).

### C. Where it appears (optional, don't over-build)
- Consider whether the QR code / review link should also appear on the public clinic website (Phase 7) — e.g. a small "Leave us a review" section or footer link. This is a reasonable, low-effort extension if Phase 7's website builder already exists, but is not required for this phase's core deliverable — implement only if it's cheap to add now; otherwise flag it as a quick follow-up rather than expanding this phase's scope significantly.

## 4. DATABASE WORK REQUIRED
- Single-column addition (`google_review_url`) to an existing appropriate table, OR a minimal new table if genuinely warranted (see Section 3A) — RLS scoped via `clinic_members` following the established pattern if a new table is created; if added to an existing RLS-covered table, no new policy work needed.

## 5. DEFINITION OF DONE
- [ ] Clinic can save/update their Google review URL.
- [ ] QR code generates correctly and scans to the correct URL (verify with an actual phone scan, not just visual inspection).
- [ ] Download produces a usable, print-quality image file.
- [ ] No heavy new dependency introduced without justification.
- [ ] Cross-tenant isolation intact (no new table, or correctly RLS-scoped if one was added).

## 6. CONSTRAINTS
- Do not build review collection, review display, or any review-aggregation/analytics feature — this phase is exactly: save a link, generate a QR code, download it. Nothing more.
- Do not create a new table for a single field if an existing, appropriate settings table already exists.
- Keep the implementation small — this should be one of the fastest phases in the entire project to build and verify.

## 7. PROCESS
1. Confirm where this field best fits in the existing settings structure; report before implementing.
2. Implement: migration (if needed) → settings field + form → QR generation + preview → download action → (optional, only if cheap) public website display.
3. Verify: save a URL, confirm the QR code visually and by actual phone-scan test resolves to the correct link, download the image and confirm it opens correctly and is print-legible, confirm a second test clinic has its own independent review URL/QR (no cross-tenant leakage).

Confirm your understanding and where this fits in the existing settings structure before writing code. This is the final phase of PRD Feature Expansion Addendum v1.1 — after this, the addendum's full "Add Now" feature set (Phases 10–16) is complete.
