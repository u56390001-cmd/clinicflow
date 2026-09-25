# INIT PROMPT — MedBook AI
## Phase 9 (Final): Analytics + Team Management + Production Polish & Launch Readiness
**Target tool:** OpenCode
**Prerequisite:** Phases 1–8 complete and verified — the full product (auth, clinic ops, appointments, patients, AI receptionist + widget, website builder, billing, email) is functionally working end-to-end.

---

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–8. This is the final hardening phase before the product is considered launch-ready — prioritize correctness, consistency, and polish over new features.

## 2. OBJECTIVE
Close out the MVP: give clinics real analytics visibility, let owners manage their staff/team properly, make every workflow's loading/empty/error states consistent and human, add SEO/performance basics to public websites, and do a final observability + security pass across the whole app.

---

## 3. SCOPE — A: Analytics Dashboard (`/app/dashboard` or `/app/analytics`)
Implement the PRD's required metrics, computed from real data (no mocks):
```
Appointments today
Appointments this week
New patients (this week/month)
Cancellation rate
No-show rate
AI booking rate (bookings via booking_source = 'ai_agent' / total)
Website booking rate (bookings via booking_source = 'widget' or 'website' / total)
```
- Present as clear stat cards (reuse the dashboard card pattern already established — icon top-right, 8px radius, large numeric value, supporting label, optional trend indicator) plus at least one simple trend chart (e.g. appointments over the last 7/30 days).
- All metrics scoped to the current clinic via existing RLS — verify cross-tenant isolation on this new read path too.
- Keep this phase's scope to the metrics listed above (marked "Dashboard metrics" in the PRD) — revenue, conversion funnel, and traffic analytics are explicitly marked "Future" in the PRD; skip them.

## 4. SCOPE — B: Team Management (`/app/settings/team` or similar)
Using the existing `clinic_members` table/roles (`owner`, `admin`, `staff`) established since Phase 1:
- **Invite flow**: owner/admin can invite a new team member by email. Since there's no existing invite-token system, implement one: generate a secure invite token, store it (e.g. a `clinic_invites` table: id, clinic_id, email, role, token, status, expires_at, invited_by), and send an invite email via Resend (reuse Phase 8's integration) with a link to accept and create/link their account.
- **Member list**: view all current members with their role; owner/admin can change a member's role or remove them.
- **Permission enforcement**: confirm (and fix if gaps are found) that `staff`-role users have appropriately restricted access across the app — e.g. per earlier phases' assumptions, staff can typically manage appointments/patients but should not access billing, team management, or clinic settings. Audit this explicitly across Phases 2–8's features and correct any place where role restriction was assumed but not actually enforced server-side.
- Only `owner` can remove/demote another `owner` or delete the clinic (don't let `admin` accidentally lock out the real owner).

## 5. SCOPE — C: Observability Pass
Per the PRD's Observability section, ensure these are tracked (build a simple internal events/log table if one doesn't already consistently exist from earlier phases — consolidate scattered logging from Phases 3–8 into one consistent pattern if needed):
- API errors
- AI failures (extends Phase 5/6's `ai_conversation_logs`)
- Booking failures / slot conflicts
- Payment/billing failures (extends Phase 8)
- Email failures (Resend send failures)
- Authentication failures
- AI-specific metrics: conversations, booking attempts, successful/failed bookings, escalations, average conversation length (surface a simple summary of these in the AI settings area if not already visible from Phase 5/6)

This doesn't need a full dashboard — a consistent logging table + a simple admin-visible summary view is sufficient for this phase.

## 6. SCOPE — D: Error Handling & Empty States Consistency Pass
Audit **every** major workflow built in Phases 2–8 (services, availability, appointments, calendar, patients, AI settings, widget settings, website builder, billing) against this standard, and fix any that fall short:
- **Loading**: skeleton/spinner, not a blank screen or layout jump.
- **Empty**: helpful, specific empty-state message + relevant CTA (e.g. "No patients yet — Patients who book through your AI agent or website will appear here" + "Add Patient" button; "Your calendar is clear — Create an appointment or let your AI agent start accepting bookings").
- **Error**: human-readable explanation (e.g. "We couldn't load your appointments. Please try again.") — never a raw stack trace or technical error code shown to the user.
- **Retry**: where appropriate, a clear retry action instead of forcing a full page reload.
This is a consistency audit, not new features — go through each screen and fix what's missing or inconsistent with this standard.

## 7. SCOPE — E: Website SEO & Performance (published clinic websites from Phase 7)
- Dynamic `<title>` and meta description per clinic website (from the website's content).
- Open Graph metadata (title, description, image — use the hero image).
- Favicon (a sensible default if the clinic hasn't set one).
- Canonical URL.
- Semantic HTML structure (proper heading hierarchy, landmark elements) — audit the templates from Phase 7.
- Optimized/lazy-loaded gallery images (use Next.js `<Image>` where practical instead of raw `<img>` for the public site).

## 8. SCOPE — F: Final Security & Correctness Review
- Re-verify RLS coverage across **all** tables introduced since Phase 1 — produce a checklist of every tenant-owned table and confirm each has correct SELECT/INSERT/UPDATE/DELETE policies scoped via `clinic_members`.
- Re-verify no secrets (Supabase service role key, Gemini API key, Resend API key) are exposed client-side anywhere in the codebase (grep for accidental client-component imports of server-only modules).
- Re-verify the public surfaces (AI widget from Phase 6, published websites from Phase 7) cannot leak cross-tenant or admin-only data.
- Re-verify billing security invariants from Phase 8 still hold (server-side price authority, admin-only approval) after any changes made in this phase.
- Confirm rate limiting is still active on public AI endpoints.

## 9. DATABASE WORK REQUIRED
- Migration for `clinic_invites` (team invite flow) if it doesn't already exist.
- Migration for a consolidated observability/events log table if the existing logging is scattered/inconsistent across earlier phases (confirm current state first — don't duplicate `ai_conversation_logs` or `billing_events` if they already serve this purpose; extend rather than replace).
- RLS on any new tables following the established pattern.

## 10. DEFINITION OF DONE
- [ ] Analytics dashboard shows accurate, live, clinic-scoped metrics matching the PRD's required list.
- [ ] Team invite → accept → role management flow works end-to-end, with role permissions actually enforced server-side (not just hidden in UI) across the app.
- [ ] Observability logging is consistent and covers the categories listed in Section 5.
- [ ] Every audited workflow has correct loading/empty/error/retry states.
- [ ] Published websites have working SEO metadata and lazy-loaded images.
- [ ] Full RLS audit checklist completed and reported, with any gaps found and fixed.
- [ ] No secrets exposed client-side (verified by explicit search, not assumption).

## 11. CONSTRAINTS
- Do not add revenue/conversion-funnel/traffic analytics — explicitly out of scope per the PRD ("Future").
- Do not introduce a new logging/observability system that duplicates Phase 5/6/8's existing log tables — consolidate/extend instead.
- Do not weaken any RLS policy while "fixing" something — if a permission gap is found, fix the policy or the enforcement logic correctly.
- This phase is about hardening and closing gaps, not adding new user-facing product features beyond what's explicitly listed above.

## 12. PROCESS
1. First, audit current state across all the areas above (analytics data availability, existing team/role enforcement, existing logging, existing SEO setup, existing empty/error state coverage, existing RLS policies) and report a gap list before writing code.
2. Prioritize and confirm the gap list with me if it's large, otherwise proceed directly through: Analytics → Team Management → Observability consolidation → Error/Empty state audit-and-fix pass → Website SEO/Performance → Final security review.
3. Provide a final verification checklist covering: analytics numbers match manually-verified data, team invite/role flow end-to-end (including a staff-role user correctly blocked from billing/settings), spot-check of at least 5 major screens for correct loading/empty/error states, a published website's SEO tags checked via view-source, and the full RLS/secrets audit results.

## 13. FINAL DELIVERABLE
At the end of this phase, provide a summary report of the entire product's readiness: what's fully complete, any known limitations, and any remaining recommendations before a real production launch (e.g. custom domain/subdomain DNS setup for websites, moving off free-tier AI/email quotas, environment/secrets management for a real deployment).

Confirm your understanding and the Step 1 audit findings back to me before writing code. This is the final planned phase — after this, the product should be a complete, coherent MVP per the original PRD (with Stripe replaced by manual billing per Phase 8).
