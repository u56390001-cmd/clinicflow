# FINAL CORRECTION PROMPT — Header Must Be Two Rows (Reference-Precise), Supersedes the Earlier "Merge into One Row" Instruction

## Context
This **overrides** the earlier correction prompt (`42_correction_merge_header_single_row.md`) that asked for a single merged header row. After reviewing the attached reference image (`header.JPG`) closely, the correct structure is **two separate horizontal rows**, matching this exact breakdown. If the single-row merge was already implemented, revert it back to two rows per this spec.

**Branding note:** the reference image and its accompanying description are from Doxmate (blue branding, "Doxmate" logo). Use this reference **only for layout structure, spacing, and component arrangement** — every color must come from MedBook AI's own `design_system_profile.json` (primary teal `#0D9488`, not Doxmate's blue), and the logo/brand text must remain "MedBook AI", not "Doxmate". Do not copy Doxmate's blue color, logo mark, or brand name anywhere.

## Task

### Row 1 — Top Header
Full-width, white background (`colorPalette.neutral.cardBackground` / white), bottom border in `colorPalette.neutral.borderLight`, `flex justify-between items-center`, reasonable vertical padding (e.g. `py-3 px-6`).

**Left:** MedBook AI logo/wordmark exactly as already implemented in the project (already correct per earlier work — no change here).

**Right:** flex container, consistent gap between items, in this exact order:
1. **Search bar** — wide, rounded input, light gray background (`colorPalette.neutral.background` or a subtle gray per the design system, not pure white), left-aligned magnifying-glass icon, placeholder text "Search by patient name or phone...". Wire this to the **existing** Phase 4 patient search logic (per the earlier header enhancement prompt) — do not build a new search implementation.
2. **Chat/message icon** — outlined icon (per `iconography`: outlined, 20px, 1.5px stroke), linking to the existing Inbox (`/app/inbox`, Addendum Phase 14) if built, or a clearly pending state if not — per the original header prompt's rule, do not fabricate a link to a non-existent page.
3. **Notification bell icon** — outlined icon, same treatment as before: honest empty/placeholder state if no real notification system exists yet, no fabricated data.
4. **User profile control** — circular avatar (background color from `colorPalette.brand.primary` teal, not Doxmate's green, with the user's real initial(s) — reuse the existing avatar-initial logic if one exists in the project, or implement simple first-letter-of-name), the user's real name next to it, and a small down-chevron indicating the dropdown. Clicking opens the dropdown already specified in the original header prompt (name, email, Settings link to the real existing settings page, Logout calling the real existing sign-out function).

### Row 2 — Subheader
Full-width, white background, `flex justify-between items-center`, `px-6` (aligned with Row 1's horizontal padding), sits directly below Row 1 (no large gap, just the row 1 bottom border separating them).

**Left — Tabs:**
- **Dashboard** and **Analytics** as horizontal text tabs with a small gap between them.
- Active tab (whichever page is currently active): dark/bold text (`colorPalette.neutral.textPrimary`, weight 600) with a bottom underline in **MedBook AI's primary teal** (`colorPalette.brand.primary`, per `components.tabs.variants.underline` in the design system — 2px underline height).
- Inactive tab: gray text (`colorPalette.neutral.textSecondary`), regular weight, no underline.
- These reuse the exact same real Dashboard/Analytics routes already wired in the earlier header work — this is a layout/style correction only, not new routing logic.
- If Analytics (Addendum/Phase 9) isn't built in this codebase yet, show only the Dashboard tab as active, same rule as before.

**Right — Primary action:**
- **"+ New Appointment"** button: solid **MedBook AI primary teal** background (`colorPalette.brand.primary`, #0D9488 — not Doxmate's blue), white text, rounded corners per the design system's button radius (8px), standard padding, hover state per `animation.transitions.hover` (150ms ease, subtle background/shadow change per `colorPalette.brand.primaryLight` for hover if appropriate).
- Same link target as already established: `/app/appointments?new=consultation`. No change to this logic — style/position only.

## Constraints
- Do not merge these into one row — this reference is explicit and precise about two distinct rows.
- Do not use any Doxmate color (blue logo, blue button, green avatar) — every color must map to `design_system_profile.json`'s palette (teal primary, established neutrals/semantics).
- Do not change any underlying logic for search, chat/inbox link, notifications, user dropdown (name/email/Settings/Logout), Dashboard/Analytics tab routing, or the New Appointment button's link target — this is a pure layout/visual correction back to the two-row structure, reusing everything already built and working.
- Do not reintroduce any functionality gaps already resolved in earlier header prompts (e.g. don't regress the honest-empty-state handling for notifications/chat/Analytics if those dependencies aren't built yet).

## Verification
1. Confirm two distinct rows: Row 1 (logo, search, chat icon, notification bell, user profile+dropdown) and Row 2 (Dashboard/Analytics tabs, New Appointment button), separated by a thin border, both full-width.
2. Confirm all colors are MedBook AI's own (teal primary), with zero Doxmate blue/green anywhere.
3. Confirm every interactive element still does exactly what it did before this correction (search returns real results, dropdown shows real name/email and working Settings/Logout, tabs navigate to the real pages, New Appointment button goes to the correct real URL).
4. Confirm responsive behavior on mobile still works sensibly (collapse/stack as needed, matching `responsiveBehavior` guidance in the design system).

Report back confirming the two-row structure is in place and that no Doxmate branding/colors remain anywhere in the header.
