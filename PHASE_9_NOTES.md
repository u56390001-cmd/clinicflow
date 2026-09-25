# MedBook AI — Phase 9 Notes & Launch-Readiness Report

Phase 9 of 12 (final planned phase): Analytics + Team Management + Production
Polish & Launch Readiness. This closes out the MVP per the original PRD, with
Stripe replaced by manual billing per Phase 8.

---

## What was built in Phase 9

### A. Analytics dashboard (`/app/dashboard`)

- All PRD-required metrics computed from real rows (`lib/analytics.ts`):
  appointments today / this week, new patients this week / month,
  cancellation rate, no-show rate, AI booking rate, website booking rate
  (trailing 30-day windows for rates).
- All windows resolved in the **clinic's own timezone** so "today" is the
  clinic's today; trend chart = non-cancelled appointments per local day
  over the last 30 days.
- Queried through the authenticated client → RLS applies; clinic-scoped by
  `clinic_id` on every query. No revenue/funnel/traffic analytics (out of
  scope per PRD "Future").

### B. Team management (`/app/settings/team`, `/invite/[token]`)

- `clinic_invites` table: SHA-256 **token hashes only** (raw tokens never
  stored), one pending invite per `(clinic, lower(email))`, expiry, status
  enum, `role <> 'owner'` CHECK at the DB level.
- Invite → Resend email → accept flow (`/invite/[token]`): works for both
  signed-out visitors and signed-in users; accepted invites link the auth
  user into `clinic_members`.
- Role management: owner/admin can change roles and remove members;
  **only owners** may touch `owner` members, and the last owner is protected
  from demotion/removal server-side (`lib/actions/team.ts`).
- **Server-side role enforcement audit (fixed this phase):**
  - Staff now redirected away from `/app/billing/*` (new
    `app/app/billing/layout.tsx` gate), `/app/settings/team`, and
    `/app/settings` — previously restricted only in the UI.
  - Mutations were already enforced in actions: billing submit
    (`canWriteClinic`), approve/reject (`isPlatformAdmin`), team mutations
    (owner/admin checks in `lib/actions/team.ts`), settings save
    (`canWriteClinic`).

### C. Observability

- Consolidated `app_event_logs` table (categories: api / booking / email /
  auth) with severity + jsonb metadata; written via `lib/observability.ts`.
- Does **not** duplicate `ai_conversation_logs` (AI) or `billing_events`
  (billing) — extends them per scope constraints.
- AI metrics surfaced in AI settings (`components/app/ai-metrics-section.tsx`):
  sessions, booking attempts, successful/failed bookings, escalations, avg
  conversation length over trailing 30 days (`getAiMetrics`).
- Widget chat route logs provider errors, quota exhaustion, lookup failures.

### D. Loading/empty/error state consistency pass

- New shared `EmptyState` primitive (`components/ui/empty-state.tsx`);
  services / appointments / patients managers and website templates updated.
- Human-readable errors everywhere; no raw stack traces or codes in UI.

### E. Website SEO & performance (published sites)

- Dynamic `<title>`/meta description per clinic, canonical URL, Open Graph +
  Twitter cards, JSON-LD `MedicalClinic` structured data, `noindex` on the
  widget iframe page (`app/site/[slug]/page.tsx`, `app/widget/[slug]/page.tsx`).
- All public-site images converted from raw `<img>` to `next/image` `<Image>`
  (hero `priority` + gallery lazy-loaded with proper `sizes`) across all three
  templates; Supabase Storage host allow-listed in `next.config.ts`
  (`images.remotePatterns`). Editor thumbnails converted as well.

### F. Final security review — checklist results

| Check | Result |
| --- | --- |
| RLS enabled on every tenant-owned table | ✅ 19/19 tables have RLS + policies (clinics, clinic_members, services, availability_rules, blocked_times, patients, appointments, clinic_ai_settings, ai_conversation_logs, websites, website_images, platform_admins, subscription_plans, subscriptions, payment_methods, payment_submissions, billing_events, clinic_invites, app_event_logs) |
| Policies scoped via `clinic_members` | ✅ helpers `is_clinic_member/_admin/_owner` (+ `is_platform_admin`); SECURITY DEFINER with pinned `search_path` |
| Function search_path pinned | ✅ all app functions (migration `security_hardening_phase9`); event trigger `ensure_rls` auto-enables RLS on new `public` tables |
| Secrets not exposed client-side | ✅ `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY` referenced only in server-only modules/API routes; no client component imports them (verified by grep) |
| Public widget can't leak cross-tenant data | ✅ service-role client with manual scoping to the slug's clinic; unified 403 prevents slug enumeration; Zod-validated payloads; `robots: noindex` |
| Published sites can't leak admin data | ✅ `status='published'` filter; queries scoped to that website's clinic only; active services + availability only |
| Rate limiting on public AI endpoints | ✅ per-IP (20/min) + per-slug (60/min), env-tunable, `Retry-After` headers |
| Billing invariants | ✅ prices/plans fetched server-side; submissions reviewed and approved/rejected only by platform admins (`isPlatformAdmin` in every admin action); proof files served through an authorized API route |

---

## Verification performed

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 0 warnings.
- `npm run build` — production build succeeds; all 32 routes compile.
- Live DB inspected: all migrations applied; RLS + policy counts verified
  per table.

## Migrations note

Four migrations were applied to the hosted project out-of-band during the
session and are reconstructed locally for version-control parity:
`0011_team_invites.sql`, `0012_clinic_member_email.sql`,
`0013_app_event_logs.sql`, `0014_security_hardening_phase9.sql`. They are
idempotent (guarded with `IF EXISTS` / `DROP POLICY IF EXISTS`) but must not
be re-run against a database where they are already applied.

## Known limitations

1. **Rate limiting is in-memory** (per server instance). Fine for a single
   Node deployment; use Upstash/Redis or Supabase Edge counters when scaling
   horizontally.
2. **Manual billing has no automatic expiry enforcement** — subscription
   expiry emails exist, but access gating on `has_active_subscription` should
   be verified/enforced per feature if trials lapse (currently informational
   for most flows by design).
3. **Emails depend on free-tier quotas** (Resend + Supabase auth emails).
4. **No custom-domain publishing** — clinic sites live under `/site/<slug>`.
5. **AI usage caps** rely on Gemini free-tier daily quotas; the widget
   degrades gracefully with a friendly "limit reached" message.

## Recommendations before real production launch

- Point DNS: host the app on a domain, set `NEXT_PUBLIC_SITE_URL`, add auth
  redirect URLs, and (optionally) wildcard subdomains per clinic later.
- Move secrets into a managed secret store; rotate any keys ever pasted into
  dashboards/chats.
- Configure Supabase SMTP (custom domain) for reliable verification/recovery
  emails; verify the Resend sending domain (SPF/DKIM).
- Set up log retention/alerting on `app_event_logs` (e.g. a cron digest of
  `severity='error'` events) and monitor Gemini/Resend quota headroom.
- Backups: enable PITR on Supabase; test a restore.
- Consider paid tiers before launch marketing: Gemini API, Resend, Supabase.
- Load-test the widget endpoint; consider moving rate-limit state to Redis if
  deploying multiple instances.
