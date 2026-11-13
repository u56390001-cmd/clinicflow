# ClinicFlow / MedBook AI — Subscription & Tab Access Audit

Inspected: migrations `0001–0124`, `middleware.ts`, `lib/entitlements.ts`, `lib/plan-features.ts`, `app/app/layout.tsx`, `components/app/app-sidebar.tsx`, `lib/constants.ts`, and all server actions.

Implementation is **further along than `CLINIC_ENTITLEMENTS_PLAN.md` claims** — migrations 0113/0114, the resolver, route guard, sidebar locks, upgrade panel, seat checks and BYOK are already live.

---

## 1. Current Subscription Setup

### Tables / fields

| Table | Actual role |
|---|---|
| `subscription_plans` | Plan catalogue. `code` (`starter`/`professional`/`enterprise`), `name` (Solo/Clinic/Practice), `price`, `currency`, `billing_interval`, `features jsonb` (`[{key,label,included}]`), `limits jsonb` (`{"doctor_seats":n,"team_seats":n}` — added in `0113_plan_entitlements.sql`), `active`. |
| `subscriptions` | One row per clinic (`clinic_id UNIQUE`), `plan_id → subscription_plans`, `status` enum (`pending_payment…active…expired`), `current_period_start/end`. **The tier is the plan’s `code`.** |
| `clinic_members` | `clinic_id`, `user_id`, `role` (`owner/admin/clinic_admin/doctor/receptionist/nurse/staff`). No plan data. |
| `addons` + `clinic_addons` | Add-on catalogue and per-clinic purchases/quantity. Used for extra seats/displays. |
| `users` | **Does not exist.** Identity is Supabase `auth.users`; tenancy is `clinic_members`. |
| `clinic_websites` | **Does not exist.** The table is `websites` (+ `website_images`), with `domain`, `domain_status`, `domain_verification_token`, `domain_verified_at` added in `0059_website_builder_domains_seo.sql`. |
| `clinics` | No `subscription_tier` and no `max_doctors`. Doctor limits are derived from `subscription_plans.limits.doctor_seats` + the `extra-doctor-seat` add-on quantity. |

### Zod schemas

- `paymentSubmissionSchema` and `registrationRequestSchema` validate `planId` and `paymentMethodId` only (`lib/validation/schemas.ts:1654`, `:1746`).
- No Zod tier/seat/feature schema — plans are read from the DB and interpreted by `lib/entitlements.ts`.

### Current plan data (0113)

| Plan | Price | `doctor_seats` | `team_seats` |
|---|---|---|---|
| Solo (`starter`) | PKR 2,499 | 1 | 5 |
| Clinic (`professional`) | PKR 6,999 | 5 | 15 |
| Practice (`enterprise`) | PKR 16,999 | unlimited (`null`) | 50 |

---

## 2. Current Active Tabs & Routes

### Sidebar (`APP_NAV_SECTIONS`, `lib/constants.ts:98`)

| Section | Tabs |
|---|---|
| Overview | Dashboard |
| Clinical | Appointment, Patient Billing, Calendar, Inbox, Patients |
| Configuration | Doctors, AI Agent |
| Workspace | Website, Booking Page, Growth Agent, Engagement, Integrations, Add-ons, WhatsApp Setup, Billing, Settings |
| Support | Help & Support |
| Administration (platform admin only) | Registrations, Payment submissions, Payment methods |

### Existing pages not in the sidebar

- Clinical: `/app/consultation`, `/app/services`, `/app/availability`
- AI: `/app/ai-test` (tab inside AI settings)
- Settings rail (`SETTINGS_NAV_ITEMS`): Organization, Manage Team, Patient ID, Billing, Prescription, Video Calling, TV Display, Assessment Library; Intake Forms / MSE Templates / Note Templates are “Coming Soon”
- Setup/admin: `/app/clinic/new`, `/app/clinic/setup`, `/app/admin/*`
- Public surfaces: `/book/[slug]`, `/site/[slug]`, `/telehealth/join`, `/widget/[slug]`, `/intake/[token]`

### Who can access what

- Role gate: `owner/admin/clinic_admin/staff` see the full sidebar; other roles are filtered by `NAV_ITEM_PERMISSIONS` (`components/app/app-sidebar.tsx:29`).
- Plan gate: route entitlements in `lib/entitlements.ts:73` plus sidebar lock badges. Locked links redirect to `/app/billing?upgrade=…`.
- First-run gate: clinics with `onboarding_completed_at IS NULL` are forced to `/app/clinic/setup` (`middleware.ts:189`).

---

## 3. Current Lock Status

### Implemented and enforced

| Feature | Gate |
|---|---|
| First-run setup wizard | Middleware redirect + allowlist (`middleware.ts:184`) |
| AI Receptionist routes | `/app/ai-settings`, `/app/ai-test` → `ai_receptionist` |
| Website builder + custom domain | `/app/website` → `website`; all website actions call `requireFeature("website")` |
| Public booking page | `/app/booking-page` → `online_booking` (included in all tiers) |
| WhatsApp + Engagement | `/app/whatsapp`, `/app/engagement` → `whatsapp`; actions gated |
| Growth Agent | `/app/growth-agent` → add-on `growth-agent` |
| Video consultations | `/app/settings/video-calling`, `/app/telehealth` → `telehealth`; ZEGO actions gated |
| Smart TV queue | `/app/settings/tv-display` → `queue` |
| Assessment library | `/app/settings/assessment-library` → `assessments`; action gated |
| Doctor seats | `createDoctorAction` checks `doctorSeatAllowance()` (`lib/actions/doctors.ts:307`) |
| Team seats | `inviteTeamMemberAction` checks `teamSeatAllowance()` (`lib/actions/team.ts:180`) |
| BYOK | `lib/ai/provider.ts` — no platform-key fallback for clinic AI |
| Upgrade screen | `/app/billing?upgrade=…` via `UpgradePanel` |
| Add-ons “included in plan” | `addonIncludedInPlan()` + Add-ons UI |

### Still open / partially gated

- **AI settings writes**: `saveAiSettingsAction` / `verifyLlmApiKeyAction` have **no `requireFeature`** (`lib/actions/ai-settings.ts:16`, `:159`).
- **AI/Widget API routes**: `/api/ai/chat`, `/api/widget/chat`, WhatsApp adapter have no plan check — a clinic that downgrades keeps AI behavior if a key exists.
- **Public website / booking pages**: `/site/[slug]` and `/book/[slug]` do not check the clinic’s subscription or `online_booking`/`website` feature; they only check `status` / `is_public_booking_enabled`.
- **Custom domain serving**: domain is stored and verified, but `middleware.ts` only rewrites `*.NEXT_PUBLIC_BASE_DOMAIN` subdomains; it never calls `resolve_website_domain` for a custom hostname. Custom domains are therefore collected but not actually routed.
- **Integrations**: Google Calendar/Meet are gated per-card via `lib/plan-features.ts`; Sheets/Zoom/Teams/Queue/WhatsApp cards are `featureKey: null` (open).
- **Multi-branch**: `clinics.parent_organization_id` exists (0074) and `multi_branch` is a Practice-only feature key, but there is **no route/action/UI gate** using it.
- **Pro Templates**: all three website templates (`classic`, `modern`, `minimal`) are selectable by anyone with `website`; no per-template gating.
- **Seat usage UI**: `/app/doctors` and `/app/settings/team` do not display “X of Y seats used”.
- **`extra-team-seat` add-on**: `teamSeatAllowance()` reads `addonQuantity["extra-team-seat"]`, but no such row exists in the `addons` seed.
- **Dashboard**: only the AI booking metric is gated (`dashboard-overview.tsx:53`); other module cards are not locked.

---

## 4. Actionable Gaps for the 3-Tier Model (Single Doctor / 4-Doctor / Multi-Doctor)

### A. Data (new migration `0125_…`)

1. Update `subscription_plans`:
   - `starter` → Single Doctor: `doctor_seats = 1`, `team_seats = 5`, chosen price.
   - `professional` → 4-Doctor Clinic: `doctor_seats = 4`, `team_seats = 15`, chosen price.
   - `enterprise` → Multi-Doctor: `doctor_seats = null` (unlimited), `team_seats = 50`, chosen price.
2. Rewrite each plan’s `features` JSON so the 1/4/multi boundary is explicit (e.g. website/AI/WhatsApp only on 4-Doctor+).
3. Add the missing `extra-team-seat` add-on row (or remove the code reference).
4. Optionally add a migration guard for `multi_branch` (`parent_organization_id`).

### B. Code

1. Add `requireFeature("ai_receptionist")` to `saveAiSettingsAction`, `verifyLlmApiKeyAction`, and the clinic-facing AI/widget routes (`app/api/ai/chat`, `app/api/widget/chat`, WhatsApp/OCR/summary call sites).
2. Add `requireFeature("website")` / `online_booking` checks to the public `/site/[slug]` and `/book/[slug]` data loaders if a lapsed plan should stop serving them.
3. Wire custom-domain resolution in `middleware.ts` via `resolve_website_domain(host)` instead of only subdomain rewriting.
4. Add seat-usage UI to `/app/doctors` and `/app/settings/team` using `doctorSeatAllowance` / `teamSeatAllowance` + `countDoctors` / `countTeamSeats`.
5. Gate multi-branch actions/UI with `multi_branch` (currently only a data column).
6. Decide whether “Pro Templates” need gating; if so, add a template entitlement map and enforce it in `saveWebsite`.
7. Update marketing/config copy: `components/landing/data.ts:226`, `FALLBACK_PLAN_PRICES`, and `CLINIC_ENTITLEMENTS_PLAN.md` to the 1/4/multi packaging and new prices.
8. Ensure `/app/integrations` remains open at page level but keeps per-card gating for `google_calendar` / `google_meet`.

> **No new `clinics.subscription_tier` or `clinics.max_doctors` column is needed** — the existing derived model (`subscriptions → subscription_plans.code/limits/features` + `clinic_addons`) is the correct source of truth and is already used by the middleware, sidebar, upgrade panel and actions.
