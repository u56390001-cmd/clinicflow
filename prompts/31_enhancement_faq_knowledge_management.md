# ENHANCEMENT PROMPT — Add Clinic FAQ / Knowledge Management to AI Settings
**Target tool:** OpenCode
**Type:** Gap-fix / enhancement to already-completed Phase 5 (AI Receptionist) and Phase 6 (Public Widget) — not a new phase, not a rebuild.

---

## 0. IMPORTANT CONTEXT — READ FIRST
This project is **already fully built** (Phases 1–9 complete per the PRD). This is a targeted enhancement to existing, working functionality — treat it with the same discipline as any other bug-fix prompt in this project:
- Do **not** rebuild, restructure, or refactor unrelated parts of the app.
- Do **not** create a new project, a new AI settings page, or a parallel FAQ system.
- The PRD already specifies FAQ handling as part of **AI Configuration / AI Settings** (not a separate sidebar module) — this enhancement must fit into the existing `/app/ai-settings` page and existing `clinic_ai_settings` data model from Phase 5, not introduce a new one.
- **Before writing any code**, inspect the existing repository:
  1. Does `clinic_ai_settings` (or wherever Phase 5 stored AI configuration) already have a `faqs` column (jsonb)? Phase 5's original spec included one — confirm whether it actually exists in the deployed schema, or was never migrated.
  2. Does the AI orchestrator (`GeminiProvider` / system prompt construction, from Phase 5) already read and inject `faqs` into the system prompt, or was this step skipped/stubbed?
  3. Does the `/app/ai-settings` page currently render **any** FAQ editing UI, or is that section missing/empty entirely?
  4. Report exact findings for all three before writing any code — this determines whether the fix is "just add the UI" or "add UI + fix the missing backend wiring too."

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect already established across this project (Phases 1–9 conventions: Next.js 15 App Router, Supabase, Zod, RLS-first, MedBook AI design tokens, `AIProvider`/`GeminiProvider` abstraction from Phase 5).

## 2. OBJECTIVE
Give clinic owners/admins a working FAQ/Knowledge management UI inside AI Settings, and ensure the configured FAQs actually reach the AI's system prompt — for **both** the internal test chat (`/app/ai-test`) and the public widget (`/widget/[slug]`) — so the AI answers clinic-specific questions correctly instead of guessing or hallucinating.

## 3. SCOPE

### A. Database (confirm before creating — reuse if it already exists)
If `clinic_ai_settings.faqs` (jsonb) doesn't already exist, add it via migration:
```sql
-- faqs: jsonb array of { id, question, answer, active, is_custom }
```
- Each FAQ entry: `id` (uuid), `question` (string), `answer` (string), `active` (boolean, default true), `is_custom` (boolean — distinguishes doctor-added FAQs from platform-provided starter/template FAQs, so templates can be individually toggled off without being deleted).
- RLS: same established pattern — owner/admin write access via `clinic_members`, scoped to `clinic_id`. Do not create a new table/policy pattern if `clinic_ai_settings` RLS already covers this correctly.

### B. FAQ Management UI (`/app/ai-settings` — extend, don't rebuild the page)
Add a "FAQs / Knowledge" section to the existing AI Settings page (alongside welcome message, tone, etc. from Phase 5) with:
- List of current FAQs (question + answer + active/inactive toggle + edit + delete), showing both starter/template FAQs and any custom ones the clinic has added.
- "Add FAQ" — question + answer text fields, saved as `is_custom: true`.
- Edit any existing FAQ (including editing a starter template's text, not just custom ones).
- Toggle active/inactive per FAQ (inactive FAQs are kept but excluded from what's sent to the AI).
- Delete an FAQ.
- Save persists the full FAQ array to `clinic_ai_settings.faqs` via a Zod-validated server action (reuse the existing AI settings save action if one already exists from Phase 5 — extend its schema rather than writing a second, separate save path).
- Match existing MedBook AI design tokens and the established form/accordion patterns already used elsewhere in the dashboard (Services, Availability from Phase 2) — this should feel like a natural extension of the existing settings UI, not a visually distinct new module.

### C. AI System Prompt Integration (the part most likely to actually be missing/broken — verify carefully)
1. Find where the system prompt is assembled for both the internal test chat and the public widget chat (per Phase 5/6's architecture, this should be a **single shared function**, not two separate implementations — if it's currently duplicated, that's itself a bug worth flagging, though fixing full duplication is optional here if it's out of scope; at minimum, ensure both paths correctly include FAQs).
2. Ensure only **active** FAQs (`active: true`) are pulled and injected into the system prompt context, formatted clearly, e.g.:
   ```
   Clinic Knowledge Base (answer FAQs using this information; do not invent clinic-specific facts not listed here):
   Q: What are your opening hours?
   A: Monday–Thursday 9 AM–5 PM, Friday 9 AM–1 PM, Saturday 10 AM–3 PM.
   ...
   ```
3. Confirm the AI actually prioritizes this FAQ context over generic reasoning — the model should answer a matching question using the clinic's exact configured answer, not a generic guess.
4. Confirm this works identically on **both** `/app/ai-test` (internal) and `/widget/[slug]` (public) — per Phase 6's architecture, both should already share the same underlying orchestrator; if FAQs only reach one of the two, that's the bug to fix (likely the public path calling a slightly different/incomplete prompt-assembly function).

## 4. Seed / Demo FAQs
If the project has demo/test clinic data (e.g. the MediFlow test clinic used throughout earlier phases), add a small number of starter FAQs **only if that clinic currently has none** — do not overwrite any FAQs a doctor may have already configured:
```
Q: What are your opening hours?
A: Monday–Thursday 9 AM–5 PM, Friday 9 AM–1 PM, Saturday 10 AM–3 PM.

Q: Do I need an appointment?
A: Yes, appointments are recommended. You can book through our online booking assistant.

Q: How can I book an appointment?
A: You can book an appointment through the clinic's online booking assistant.
```
Mark these `is_custom: false` so they render as editable/toggleable starter templates, not doctor-authored content.

## 5. DEFINITION OF DONE
- [ ] `clinic_ai_settings.faqs` confirmed to exist (or added) with the correct shape.
- [ ] FAQ management UI live inside the existing `/app/ai-settings` page — add, edit, delete, activate/deactivate, save all work.
- [ ] Saving FAQs validates input server-side (Zod) and persists correctly, scoped to the correct clinic via RLS.
- [ ] Active FAQs are injected into the AI's system prompt via the shared orchestrator logic.
- [ ] Verified working identically on both `/app/ai-test` and the public `/widget/[slug]`.
- [ ] The AI answers a question matching a configured FAQ using that FAQ's exact answer.
- [ ] The AI does **not** hallucinate an answer for a clinic-specific question with no matching FAQ (it should say it doesn't have that information / suggest contacting the clinic — reuse the escalation pattern from Phase 5's safety rules).
- [ ] Cross-tenant isolation verified: Clinic A cannot see or affect Clinic B's FAQs.
- [ ] Demo/seed FAQs added only where no existing FAQs are present — no doctor-entered data overwritten.

## 6. CONSTRAINTS
- Do not create a new, separate FAQ table/module outside `clinic_ai_settings` unless the audit in Section 0 finds a strong existing reason to (report and confirm with me first if so).
- Do not build FAQ handling as dashboard-only cosmetic CRUD without also fixing/confirming the AI-context injection — a FAQ list that the AI never actually reads does not solve the underlying problem.
- Do not duplicate the system-prompt-assembly logic between the internal test chat and the public widget — if they're currently separate, consolidate to one shared function as part of this fix (per Phase 5/6's original intended architecture).
- Do not disable RLS.
- Do not overwrite any doctor-entered AI settings/FAQs already in the database.

## 7. PROCESS
1. Complete the Section 0 audit and report findings (schema exists? UI exists? injection exists?) before writing code.
2. Implement in this order: migration (if needed) → shared system-prompt FAQ injection (fix first, since it's foundational and easy to silently skip) → FAQ management UI in AI Settings → seed demo data (if applicable) → verify both AI surfaces.
3. Run the full testing checklist below and report results.

## 8. TESTING (run all of these explicitly)
1. Login as clinic owner.
2. Open AI Settings → FAQs/Knowledge section.
3. Create a new custom FAQ.
4. Edit it.
5. Disable it, confirm it's excluded from the AI's context (ask the AI that question, confirm it no longer uses the FAQ answer).
6. Re-enable it.
7. Delete an FAQ.
8. Open `/app/ai-test`, ask a question matching an active FAQ — confirm the AI uses the configured answer.
9. Ask a clinic-specific question with no matching FAQ — confirm the AI does not hallucinate an answer.
10. Repeat steps 8–9 on the public `/widget/[slug]` — confirm identical behavior to the internal test.
11. Verify Clinic A cannot access or affect Clinic B's FAQs (cross-tenant test with a second test clinic/user).

## 9. FINAL DELIVERABLE
Report: files created, files modified, database migration (if any), RLS policies (confirmed or added), UI location, the exact AI integration point (function/file that injects FAQs into the system prompt), tests performed with results, any environment variables required, and — importantly — whether the system-prompt injection was already working correctly before this fix or was genuinely broken/missing (this tells us whether Phase 5 had a real gap or just an incomplete UI).

Confirm your Section 0 audit findings back to me before writing code.
