# ENHANCEMENT PROMPT — Complete the Website Builder Editor's Interactive UI
**Target tool:** OpenCode
**Type:** Gap-fix / enhancement to already-completed Phase 7 (Website Builder) — not a new phase, not a rebuild.

---

## 0. IMPORTANT CONTEXT — READ FIRST
The Website Builder (Phase 7) is already built: templates, editor route, live preview, publishing, and the config data model all exist. This is a **targeted completion pass** for specific interactive UI mechanics that research/comparison against a reference implementation showed are missing or incomplete — not a rebuild of the editor.
- Do **not** rebuild the editor layout, templates, or publishing flow from scratch.
- Do **not** create a new website-builder module or duplicate the existing `websites`/`website_images` schema from Phase 7.
- Reuse the existing sidebar/live-preview structure, the existing shared config object (`theme`, `content`, `sections`, `images`, `clinic`), and the existing three templates.
- **Before writing any code**, inspect the current editor implementation and report exactly which of the items in Section 3 below already work correctly, which are partially implemented, and which are entirely missing. This determines the actual scope of work — don't assume everything below is missing.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect established across this project (Phase 7 conventions: Next.js 15, Supabase Storage, the shared website-config object, MedBook AI design tokens).

## 2. OBJECTIVE
Complete the specific interactive editor behaviors that make the Website Builder feel like a real, polished no-code tool: working image uploads with proper states (hero image, doctor/about image, gallery), per-section show/hide toggles that immediately affect the live preview, live text-sync to the preview without requiring a save, a proper CTA configuration, and a dynamic certifications/credentials list builder. These are UX-completeness gaps, not new features beyond what Phase 7 already scoped.

## 3. SCOPE — Audit each of these against the current implementation, then fix/complete what's missing

### A. Per-Section Show/Hide Toggles
- Each editor accordion section (Hero, About, Services, Gallery, Contact) should have a clear **Switch/toggle control** in its accordion header (not buried inside the section's content) bound to a boolean in the config (`show_hero`, `show_about`, etc. — reuse Phase 7's `sections` config field, or add these specific booleans to it if it's currently a simpler show/hide list).
- Toggling off must **immediately unmount that section from the live preview** (no page reload, no "Save" required to see the preview effect) — the DB write only happens on explicit Save.
- Verify each section respects its toggle correctly on the **published** public site too, not just the editor preview (an off section must not render publicly if it's off).

### B. Live Text/Value Sync to Preview (no save required)
- Every text input, number input, and select in the sidebar (headline, subheadline, about description, years of experience, CTA labels, etc.) must update the live preview **as the doctor types/changes it**, using client-side state (not a DB round-trip per keystroke).
- Confirm this is debounced sensibly for performance if the preview is a real iframe communicating via `postMessage` — avoid flooding the message channel on every keystroke if it causes jank; a light debounce (~100–150ms) is acceptable and won't feel laggy.
- Explicit "Save" (or existing autosave from Phase 7) persists this state to the database — confirm unsaved changes are clearly indicated if the doctor navigates away without saving (don't silently lose edits).

### C. Hero Image Upload (and Doctor/About Image, and Gallery — same pattern for all three)
For each image upload point (Hero background, About/doctor profile thumbnail, Gallery multi-upload), implement the full interaction cycle:
1. **Empty state**: a clear, clickable upload placeholder (click-to-browse and drag-and-drop both supported) showing an appropriate icon/hint (e.g. "Click or drag to upload hero image").
2. **Uploading state**: once a file is selected, show a loading spinner/skeleton over the preview area while the file uploads to Supabase Storage — the doctor should get clear feedback that something is happening, not a frozen UI.
3. **Uploaded state**: once complete, show the actual image preview, with two clearly visible action controls on hover/tap — **Remove** (trash icon, clears the image) and **Replace** (re-opens the file picker to swap it) — matching the reference pattern of top-corner action icons on the image preview.
4. **Gallery specifically**: support multiple files in one interaction, show each as a thumbnail in a grid, allow individual removal and reordering (drag-to-reorder if reasonably quick to implement; otherwise up/down move buttons are an acceptable simpler alternative — use judgment, don't over-engineer).
5. Validate file type (images only, reasonable extensions) and a sensible max file size client-side before upload, with a clear error message if rejected.
6. Confirm uploaded files land in the correct Supabase Storage bucket/path convention from Phase 7 (e.g. `/website-assets/[clinic_id]/...` or whatever Phase 7 actually established — audit and reuse, don't invent a new path convention), and that public image URLs are correctly stored back into the config (`content_json`/`images` per the existing schema) on save.

### D. CTA (Call-to-Action) Configuration
- Confirm the Hero section has two editable CTA label fields: **Primary CTA label** (default "Book Appointment") and **Secondary CTA label** (default "Call Now") — add if missing.
- Primary CTA on the published site must trigger the AI booking widget (open/focus the Phase 6 widget) — confirm this wiring works; fix if the button currently does nothing or links incorrectly.
- Secondary CTA should perform a sensible default action (e.g. `tel:` link using the clinic's contact phone) unless Phase 7 already defined different intended behavior — confirm existing intent before changing it.

### E. Dynamic Certifications/Credentials List (About section)
- If missing: implement a simple dynamic list builder — a text input + "Add" button that appends a tag/chip to a list, with each tag individually removable (small "x" on each chip). Bind this to the About section's certifications array in the config.
- Keep this simple — plain string tags, no need for rich metadata per credential unless Phase 7's schema already defined something more structured (audit first).

### F. Contact Section Completeness
- Confirm working hours display correctly (should pull from Phase 2's `availability_rules` per Phase 7's original spec — verify this live-data connection wasn't accidentally replaced with static/manual re-entry).
- Confirm phone, email, address fields are editable.
- Confirm a Google Maps embed URL field exists and actually renders an embedded map on the public site when set (graceful fallback/hidden if not set — don't show a broken iframe when empty).

## 4. DATABASE / STORAGE WORK
- No new tables expected — reuse `websites.content_json`/`theme_json` and `website_images` from Phase 7. Only add fields to the existing JSON config shape if genuinely missing (e.g. `show_hero`/`show_about` booleans, `cta_primary_label`/`cta_secondary_label`, `certifications` array) — audit the current shape first and extend rather than restructure.
- Confirm the Supabase Storage bucket and access policies from Phase 7 correctly support: doctor-only upload/delete (owner/admin), public read access to published images (needed for the live public site) — do not weaken this to full public write access.

## 5. DEFINITION OF DONE
- [ ] Every section (Hero/About/Services/Gallery/Contact) has a working show/hide toggle that immediately affects the live preview and correctly affects the published public site.
- [ ] All sidebar inputs sync to the live preview instantly (debounced), without requiring Save to see the visual effect.
- [ ] Hero image, About/doctor image, and Gallery images all support the full empty → uploading → uploaded (with remove/replace) cycle.
- [ ] Gallery supports multiple images with individual removal.
- [ ] CTA primary/secondary labels are editable and the primary CTA correctly opens the AI widget on the published site.
- [ ] Certifications list is a working dynamic add/remove list.
- [ ] Contact section correctly reflects live availability data (not stale/manual re-entry) and Google Maps embed works when configured.
- [ ] Switching templates (already required in Phase 7) still preserves all of the above content correctly — re-verify this wasn't broken by these additions.
- [ ] Cross-tenant isolation and existing RLS/storage security from Phase 7 remain intact.

## 6. CONSTRAINTS
- Do not rebuild the templates, editor route structure, or publishing flow — this is additive completion of existing pieces.
- Do not introduce a new state-management library if the existing Phase 7 implementation already has a working pattern (React state/Context) — only introduce something like Zustand if the current approach is genuinely inadequate for this scope, and justify it if so.
- Do not let the Services or Contact-hours sections drift into manually re-entered/duplicated content — they must continue pulling live data from Phase 2/3 as Phase 7 originally specified.
- Do not weaken Supabase Storage access policies.
- Keep all styling consistent with existing MedBook AI design tokens and the editor's established sidebar/accordion visual pattern.

## 7. PROCESS
1. Audit the current editor against every item in Section 3 and report status (working / partial / missing) for each before writing code.
2. Propose the specific config-shape additions needed (if any) before implementing.
3. Implement in a sensible order: section toggles → live sync verification/fix → image upload cycle (hero → about → gallery, since they share the same pattern, build it once as a reusable component) → CTA config → certifications list → contact/hours/maps verification.
4. Provide a verification checklist: toggle each section off/on and confirm live preview + published site both respect it; edit each text field and confirm instant preview sync; upload, replace, and remove an image at each of the three upload points; add and remove certifications; set a CTA label and confirm the primary button opens the widget on the published site; switch templates and confirm nothing entered was lost; confirm hours/maps render correctly.

## 8. FINAL DELIVERABLE
Report: which Section 3 items were already working (no changes needed), which were partial and fixed, which were entirely missing and built, files created/modified, any config schema additions, and confirmation that template-switching and cross-tenant isolation remain intact after these changes.

Confirm your Section 0/Step 1 audit findings back to me before writing code.
