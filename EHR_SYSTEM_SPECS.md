# MedBook AI — EHR Technical Specification

**Purpose of this document:** ground an AI Systems Architect in the actual codebase of this text-based EHR so an **Ambient Voice Clinical Copilot** (Dragon Copilot-class) can be designed and embedded into the existing encounter workflow.

**Repository root:** `C:\Users\HP.DESKTOP-GGO0AQ9\Downloads\My Projects\MedBookAi`
**App name:** `medbook-ai` (`package.json`)
**Verification:** all file paths, line numbers, table DDL and enum values below were read directly from source (Next.js 15 App Router, 40 SQL migrations in `supabase/migrations/`, 2,824-line hand-written DB type map).

---

## 1. System Tech Stack & Architecture

### 1.1 Frontend

| Concern | Implementation | Evidence |
| --- | --- | --- |
| Framework | **Next.js 15.5.23 (App Router), React 19.1.0, React-DOM 19.1.0** | `package.json:24-27` |
| Language | TypeScript 5, `"strict": true`, `moduleResolution: "bundler"`, path alias `@/* -> ./*` | `tsconfig.json` |
| Dev server | `next dev --turbopack --experimental-https --experimental-https-key localhost-key.pem --experimental-https-cert localhost.pem` | `package.json:6` |
| Alt dev | `npm run dev:http` (plain HTTP) | `package.json:7` |
| Build/lint | `next build`, `next start`, `eslint` (flat config `eslint.config.mjs`), Prettier + `prettier-plugin-tailwindcss` | `package.json:8-11`, `.prettierrc` |

> **Note for voice capture:** the default dev command serves over **HTTPS with a self-signed localhost cert** (`localhost.pem` / `localhost-key.pem`). Browsers only expose `getUserMedia` / microphone capture on secure contexts, so the project is already configured for it. Production must also be HTTPS.

**UI component library (shadcn-style, hand-rolled — no shadcn CLI dependency):**

- Radix primitives: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-slot` (`package.json:14-16`).
- Local kit at `components/ui/` (20 files): `alert.tsx, badge.tsx, button.tsx, card.tsx, collapsible.tsx, confirm-dialog.tsx, detail-modal-hero.tsx, detail-modal-layout.tsx, dropdown-menu.tsx, empty-state.tsx, form-tabs.tsx, input.tsx, label.tsx, metric-card.tsx, section-card.tsx, select.tsx, skeleton.tsx, spinner.tsx, switch.tsx, textarea.tsx`.
- Styling: **Tailwind CSS 3.4.19** + semantic design tokens (`bg-app`, `bg-surface`, `text-text-primary`, `text-text-muted`, `bg-primary`, `bg-status-success/warning/destructive`, `rounded-card`, `rounded-pill`) declared in `tailwind.config.ts` (e.g. `status.success: "#22C55E"`, `status.warning: "#F59E0B"`) and consumed via `@apply` in `app/globals.css`.
- Icons: `lucide-react`. Utilities: `clsx` + `tailwind-merge` (`lib/utils.ts` -> `cn()`), `class-variance-authority`.
- Toasts: **`sonner`**. Misc: `date-fns` / `date-fns-tz`, `qrcode`.

**State management — there is no global store:**

- No Redux / Zustand / Jotai / React Query anywhere (grep across `components/**`, `app/**`, `hooks/**` returns zero hits).
- Exactly one React context: `components/app/mobile-nav-context.tsx` (`MobileNavProvider`, wrapping the shell in `app/app/layout.tsx`).
- State lives in:
  1. **Server Components** (page-level fetch; re-rendered by `router.refresh()`).
  2. **URL search params** — the patient directory state machine is `lib/patient-directory.ts` (`parsePatientDirectoryParams`, `patientDirectoryHref:185`).
  3. **Local `useState`** inside client components (e.g. `components/consultation/prescription-form.tsx:35-49` holds the entire note draft in seven fields).
  4. **React 19 `useActionState`** bound to Server Actions (prescription save, queue actions, consultation advance).
  5. **`sonner` toasts** for transient feedback.
- Single custom hook: `hooks/use-doctor-vitals-config.ts`.

### 1.2 Backend

There is **no separate API server**. The backend is Next.js itself:

| Mechanism | Location | Notes |
| --- | --- | --- |
| **Server Actions** (primary mutation path) | `lib/actions/*.ts` — 20 files, ~5,300 lines total | e.g. `consultation.ts` (285 lines), `queue.ts`, `patients.ts`, `patient-billing.ts`, `appointments.ts`, `billing.ts`, `doctors.ts`, `team.ts`, `website.ts`, `auth.ts`, `ai-settings.ts`, `patient-documents.ts`, `inbox.ts`, `whatsapp.ts`, `services.ts`, `availability.ts`, `settings.ts`, `pre-consultation.ts`, `clinic.ts`, `patient-search.ts` |
| **Route Handlers** | `app/api/**/route.ts` (9 files) | see §4.1 |
| **Server Component fetches** | `app/app/**/page.tsx` calling `lib/*-queries.ts` | `lib/consultation-queries.ts`, `lib/patient-record.ts`, `lib/visits-queries.ts` |
| **Validation** | Zod 4 (`zod@^4.4.3`); every action parses `FormData` through `lib/validation/schemas.ts` (1,712 lines, **44 exported schemas**) | `savePrescriptionSchema:1505`, `vitalsSchema:1403`, `checkInSchema:1395`, `startConsultationSchema:1480`, `completeAndAdvanceSchema:1485` |
| **Response shape** | `ActionResult<T>` at `types/index.ts:5` — `{ ok: true; data?: T } \| { ok: false; message: string }` | uniform across all actions |

### 1.3 Database & query layer

- **Engine:** Supabase — **Postgres with Row-Level Security**, Supabase Auth, Storage, RPCs (Postgres functions).
- **Migrations:** 40 sequential SQL files, `supabase/migrations/0001_*.sql` → `0040_doctor_scoped_consultation_locks.sql`. Idempotent (guarded `create table/policy` blocks, `do $$ … exception when duplicate_object`).
- **Query layer:** `@supabase/supabase-js@^2.112.3` + `@supabase/ssr@^0.12.4`. **No ORM** (no Prisma/Drizzle).
- **Typing:** `types/database.ts` (2,824 lines) is **hand-maintained, not generated** — "the migration files remain the single source of truth" (header, `types/database.ts:1-14`). Row types are `type` aliases so they satisfy supabase-js's `GenericRow`.
- **Clients:** `lib/supabase/server.ts` (cookie client for RSC/actions/handlers), `lib/supabase/client.ts` (browser), `lib/supabase/middleware.ts` (`updateSession`), `lib/supabase/widget.ts` (**service-role**, public widget + secret reads only).
- **Domain query modules:** `lib/consultation-queries.ts`, `lib/patient-record.ts`, `lib/visits-queries.ts`, `lib/patient-directory.ts`, `lib/patient-documents-queries.ts`, `lib/patient-billing-queries.ts`, `lib/appointments-view.ts`, `lib/pre-consultation.ts`, `lib/inbox-query.ts`, `lib/vitals-config.ts`.
- **Derived view:** `public.patient_directory` — `security_invoker = true` read-only view, rebuilt in `0006_patients_crm.sql:68`, `0029_patients_billing_ai_enhancements.sql:545`, `0039_patient_form_health_fields.sql:51`. Read by `runDirectoryQuery` (`app/app/patients/page.tsx:220`) with explicit `clinic_id` filters as defense-in-depth.

### 1.4 Authentication

- **Supabase Auth (email/password + email verification)**, session in cookies via `@supabase/ssr`.
- **Route guard:** `middleware.ts` — `/app/*` requires a session else redirect `/login?next=…`; authenticated users are bounced off auth pages to `/app/dashboard`; production subdomain rewrite `clinic-slug.BASE_DOMAIN -> /site/[slug]` (`middleware.ts:33-44`).
- **Session refresh:** `lib/supabase/middleware.ts -> updateSession(request)` runs first in middleware.
- **Flows:** `app/(auth)/login|signup|forgot-password|reset-password|verify`, `app/auth/callback/route.ts`; actions in `lib/actions/auth.ts` (`signupAction:66`, `loginAction:107`, `forgotPasswordAction:139`, `resetPasswordAction:171`, `logoutAction:198`).
- **In-request identity:** `supabase.auth.getUser()` inside every server action / route handler.

### 1.5 Multi-tenancy & RLS model

- **Tenant = clinic.** `clinics` and `clinic_members(role)` (`0001_clinics_clinic_members.sql`); enum `clinic_role = 'owner' | 'admin' | 'staff'`.
- **Membership resolution:** `lib/clinic-access.ts:27 getCurrentClinic(supabase)` — "the clinic the signed-in user most recently joined" (latest `clinic_members` row), returning `{ role, clinic }`. **Every page/action derives `clinicId` from this**; no tenant id appears in URLs.
- **Role gates (app layer):**
  - `canManageClinical(role)` — `lib/clinic-access.ts:66`, roles from `CLINICAL_ROLES` in `lib/constants.ts`. All three roles qualify (owner/admin/staff) for the clinical floor.
  - `canWriteClinic(role)` — `lib/clinic-access.ts:57` (owner/admin only; staff read-only).
- **Role gates (DB layer — RLS):** helpers `is_clinic_member`, `is_clinic_owner`, `is_clinic_admin`, `is_clinic_creator` (`0002_rls_policies.sql`), plus `is_platform_admin`, `rls_auto_enable` (`0014_security_hardening_phase9.sql`). Policies read `using (public.is_clinic_member(clinic_id))` + `with check (…)`, so **tenant isolation is enforced by Postgres, not app code**.
- **Policy counts per migration:** `0002` 8, `0003` 8, `0004` 12, `0005` 8, `0007` 6, `0017` 4, `0019` 4, `0020` 4, `0023` 8 (visits + vitals), `0024` 8 (prescriptions + templates), `0025` 11 (patient billing), `0029` 3, `0033` 8, `0034` 4, `0035` 7.
- **Composite same-clinic FKs** throughout: `references public.patients (clinic_id, id)` — cross-tenant joins are impossible even with a guessed UUID (`0005`, `0023`, `0024`, `0030`).
- **Service role** is confined to public widget routes, `clinic_ai_secrets` reads (that table has **zero** RLS policies — `lib/ai/provider.ts:15-31`) and webhooks; the key is server-only (`SUPABASE_SERVICE_ROLE_KEY`).
- **Audit:** `app_event_logs` (`0013`) with `category in ('api','booking','email','auth','billing')` (`0030:117-120`). Writers: `lib/actions/auth.ts:44`, `lib/actions/patient-billing.ts:269`, `lib/email/send.ts:32`. **There is no clinical/audit log for notes or prescriptions.**

### 1.6 External integrations & runtime config

| Integration | Where | Env |
| --- | --- | --- |
| **Google Gemini** (text LLM) | `lib/ai/gemini-provider.ts` (`GeminiProvider:29`, `getGeminiProvider:160`), dep `@google/genai@^2.17.1` | `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `GEMINI_FALLBACK_MODEL` |
| Per-clinic LLM credentials | `clinic_ai_settings` + `clinic_ai_secrets` (service-role only) via `resolveProviderForClinic()` (`lib/ai/provider.ts:35`) | — |
| **Resend** email | `lib/email/{client,send,templates}.ts` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **Meta WhatsApp Cloud API** | `lib/whatsapp/*`, `app/api/whatsapp/webhook/route.ts` | `META_APP_SECRET`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| Supabase | all clients | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| App URL / routing | `middleware.ts`, emails | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_DOMAIN` |
| AI feature flags | `lib/ai/patient-summary.ts` | `PATIENT_AI_SUMMARY_ENABLED` (default off), `PATIENT_AI_SUMMARY_RATE_LIMIT` |
| Rate limits | `lib/ai/rate-limit.ts` (`checkRateLimit`, `envInt`) | `AI_CHAT_RATE_LIMIT` (30), `AI_CHAT_IP_RATE_LIMIT` (60), `WIDGET_CHAT_*`, `WHATSAPP_RATE_LIMIT_PER_MINUTE` |
| Cron | `app/api/cron/appointment-reminders/route.ts` | `CRON_SECRET` (Bearer) |

Documented inventory: `.env.example` (7.5 KB, heavily commented). Keys actually present in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `CRON_SECRET`.

`next.config.ts`: `outputFileTracingRoot` pinning + `images.remotePatterns` limited to the Supabase storage host.

---

## 2. Current Text-Based Encounter & Note Structure

### 2.1 Where the encounter lives (two surfaces, one component)

There is **one encounter screen component**, mounted in two places:

| Surface | Route / entry | Host file |
| --- | --- | --- |
| **A. Consultation workspace (full page)** | `/app/consultation` (`APP_ROUTES.app.consultation`), deep link `?visit=<id>&pid=<id>&from=patients` | `app/app/consultation/page.tsx` (133 lines) |
| **B. Patient-record overlay (full-screen modal)** | Patients tab -> *Write Prescription* -> `WritePrescriptionOverlay` | `components/consultation/write-prescription-overlay.tsx` (193 lines), opened from `components/patients/patients-workspace.tsx:144-152` |

**Page-level orchestration** (`app/app/consultation/page.tsx`):

1. `createClient()` + `getCurrentClinic()` -> tenant.
2. `findDoctorForUser()` (`lib/consultation-queries.ts:194`) — links `auth.users` -> `doctors.user_id`.
3. `fetchDoctorWaitingList()` (`:58`) — visits with `status in ('waiting','in_consultation')` joined to patients/doctors/services/vitals, ordered by `queue_position`, scoped to the doctor when multi-doctor.
4. Active visit selection (`:68`): deep-linked `?visit=` else the `in_consultation` row.
5. `fetchConsultationData()` (`:108`) + `fetchPrescriptionTemplates()` (`:174`) + `fetchVitalsConfigs()` (`lib/vitals-config.ts`).
6. Renders `<ConsultationView>`, or `<DoctorWaitingList>` when nobody is active.

**Overlay variant** (`write-prescription-overlay.tsx:42-83`) fetches the *same* data **on the client** using `lib/supabase/client.ts`, then renders `<ConsultationView>` inside `fixed inset-0 z-50` (`:101`).

### 2.2 Encounter component tree

```
ConsultationView                         components/consultation/consultation-view.tsx (283 lines)
├── Header row                           :91-144  (back button, Print Preview, "Complete & Next" form)
├── grid grid-cols-[300px_1fr] gap-6     :150
│   ├── LEFT rail (300px, cards)
│   │   ├── Patient Details card         :154-198
│   │   ├── Pre-Consultation Questions   :201-227  (pre_consultation_answers)
│   │   └── Vitals card -> VitalsForm    :230-252  (components/queue/vitals-form.tsx, 374 lines)
│   └── RIGHT pane (Card > PrescriptionForm)
│       └── PrescriptionForm             components/consultation/prescription-form.tsx (284 lines)
│           ├── TemplateManager          :109-115 (sibling — its own <form>s, forms cannot nest)
│           └── <form action={formAction}>:117-281
│               ├── chiefComplaint  -> <Textarea rows=2>   :127
│               ├── findings        -> <Textarea rows=3>   :142
│               ├── diagnosis       -> <Input>             :158
│               ├── customDiagnosis -> <Input>             :170
│               ├── medicines[]     -> MedicineEntry rows  :192-202 (medicine-entry.tsx, 118 lines)
│               ├── labOrders[]     -> LabOrderEntry rows  :220-227 (lab-order-entry.tsx, 71 lines)
│               ├── followUpDate    -> <Input type=date>   :238
│               ├── followUpNotes   -> <Input>             :250
│               └── doctorNotes     -> <Textarea rows=3>   :265
└── PrescriptionPreview (print-only)     components/consultation/prescription-preview.tsx (247 lines)
```

Supporting files: `components/consultation/doctor-waiting-list.tsx` (159), `template-manager.tsx` (157), `components/queue/{check-in-modal.tsx (730), vitals-form.tsx (374), waiting-queue-list.tsx, receipt-generated-modal.tsx, queue-manager.tsx (unused)}`.

### 2.3 Type of note editor — plain controlled form inputs (no rich-text editor)

This is the single most important fact for a copilot embed:

- The note is **not** TipTap, Slate.js, ProseMirror, Quill, Lexical or CodeMirror — **no editor library appears in `package.json`** (deps in §1.1).
- It is a set of **controlled React `<Textarea>` / `<Input>` primitives** (`components/ui/textarea.tsx`, `components/ui/input.tsx`, thin wrappers over native elements) bound to `useState` in `prescription-form.tsx:35-49`, mutated by `onChange` handlers (`:63-102`).
- Draft -> submit: values post through `<form action={savePrescriptionAction}>` with `medicines` and `labOrders` serialized into **hidden inputs as JSON strings** (`prescription-form.tsx:118-120`).
- **No autosave, no debounced persistence, no draft/version history, no undo stack, no markdown, no rich text.** Persistence happens only when the form action runs; on success the component calls `router.refresh()` (`prescription-form.tsx:56-60`).
- Note text is stored in **plain `text` columns**, so generated content must be plain text (or something this app renders as text).

### 2.4 Database schemas for encounter data

#### 2.4.1 `patients` — `supabase/migrations/0005_patients_appointments.sql`

```sql
create table if not exists public.patients (
  id         uuid        primary key default gen_random_uuid(),
  clinic_id  uuid        not null references public.clinics (id) on delete cascade,
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  email      text        check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone      text        check (phone is null or char_length(btrim(phone)) between 3 and 32),
  notes      text        check (notes is null or char_length(btrim(notes)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_clinic_id_id_unique unique (clinic_id, id)
);
```

Later `add column` sets (all guarded `if not exists`):

| Columns | Migration |
| --- | --- |
| `date_of_birth date` | `0006_patients_crm.sql` |
| `city`, `gender ('male','female','other')`, `age`, `known_allergies`, `medical_conditions` | `0027_booking_modal_expanded_fields.sql` |
| `patient_code` (UHID, prefix from `clinics.patient_code_prefix`), `blood_group`, `registered_branch`, `ai_summary`, `ai_summary_generated_at`, `ai_summary_visit_count`, + 2 | `0029_patients_billing_ai_enhancements.sql` |
| `height`, `weight`, `current_medications`, + 2 (health fields, CHECK-range guarded) | `0039_patient_form_health_fields.sql` |

TS type: `types/database.ts:289 Patient`.

#### 2.4.2 `visits` (the encounter / state machine) — `0023_patient_checkin_queue_vitals.sql`

```sql
create table if not exists public.visits (
  id                      uuid        primary key default gen_random_uuid(),
  clinic_id               uuid        not null references public.clinics(id) on delete cascade,
  appointment_id          uuid        not null,   -- unique per clinic
  patient_id              uuid        not null,
  doctor_id               uuid,                   -- nullable (walk-in / unassigned)
  status                  public.visit_status     not null default 'waiting',
  payment_status          public.payment_status   not null default 'pending',
  token_number            int         not null,
  queue_position          int         not null,
  checked_in_at           timestamptz not null default now(),
  consultation_started_at timestamptz,
  completed_at            timestamptz,
  created_at, updated_at  timestamptz not null default now(),
  constraint visits_clinic_patient_fkey     foreign key (clinic_id, patient_id)     references public.patients(clinic_id, id),
  constraint visits_clinic_appointment_fkey foreign key (clinic_id, appointment_id) references public.appointments(clinic_id, id),
  constraint visits_clinic_doctor_fkey      foreign key (clinic_id, doctor_id)      references public.doctors(clinic_id, id)
);
-- 0030_billing_table_prerequisites.sql:52 adds unique (clinic_id, id)
```

**Enum values (authoritative):**

- `visit_status = 'scheduled' | 'checked_in' | 'waiting' | 'in_consultation' | 'completed'` (`0023:28`)
- `payment_status = 'pending' | 'collected_pre' | 'collected_post' | 'not_required'` (`0023:40`)
- `appointment_status = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'` (`0005`)
- `clinic_role = 'owner' | 'admin' | 'staff'` (`0001`)
- `patient_bill_status = 'pending' | 'paid' | 'partially_paid'`; `patient_payment_method = 'cash' | 'card' | 'bank_transfer' | 'jazzcash' | 'easypaisa'` (`0025`)

TS type: `types/database.ts:431 Visit`.

**Encounter transitions are Postgres RPCs (advisory-locked):**

| RPC | File | Behaviour |
| --- | --- | --- |
| `start_consultation(clinic, visit)` | `0024` (redefined/locked in `0040:19 returns public.visits`) | `waiting/checked_in -> in_consultation`, sets `consultation_started_at`; advisory lock `hashtext(clinic_id ‖ doctor_id)` |
| `complete_and_advance(clinic, visit)` | `0040:75-152` | marks current `completed` + `completed_at`, then promotes the **lowest-queue-position `waiting` visit of the same doctor** to `in_consultation`; returns that next row or `NULL` when the queue is empty |

Called from `lib/actions/consultation.ts` (`startConsultationAction:20`, `completeAndAdvanceAction:58`).

#### 2.4.3 `vitals` — `0023` + `0028` + `0038`

```sql
create table if not exists public.vitals (
  id uuid primary key, clinic_id uuid not null, visit_id uuid not null, recorded_by uuid,
  blood_pressure text  check (length between 1 and 32),
  temperature    numeric(4,1) check (30..45),   -- 0038 adds Fahrenheit handling
  pulse          int     check (30..300),
  weight         numeric(5,2) check (>0 and <=500),
  height         numeric(5,1) check (>0 and <=300),
  recorded_at, created_at, updated_at timestamptz,
  constraint vitals_clinic_visit_fkey foreign key (visit_id) references public.visits(id) on delete cascade
);
-- 0028_appointments_module_enhancements.sql adds:
--   systolic_bp int(50..300), diastolic_bp int(20..200), spo2 int(0..100),
--   respiratory_rate int(4..60), bmi numeric(5,2) (5..80)
```

Per-doctor field visibility comes from `doctor_vitals_config` (`0033`), read server-side by `lib/vitals-config.ts` and applied client-side by `hooks/use-doctor-vitals-config.ts`.

#### 2.4.4 `prescriptions` — this is the "clinical note" — `0024_consultation_prescription.sql`

```sql
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  visit_id      uuid not null,
  patient_id    uuid not null,
  doctor_id     uuid,

  chief_complaint   text not null default '',
  findings          text not null default '',   -- "Clinical / Examination Findings"
  diagnosis         text not null default '',
  custom_diagnosis  text not null default '',   -- free-text alternative/additional dx

  medicines   jsonb not null default '[]'::jsonb, -- [{name,route,form,frequency,duration,unit,instructions}]
  lab_orders  jsonb not null default '[]'::jsonb, -- [{test_name,notes}]

  follow_up_date   date,
  follow_up_notes  text not null default '',
  doctor_notes     text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint prescriptions_clinic_visit_unique unique (clinic_id, visit_id)  -- ONE note per encounter
);
```

- Guarded FKs (`0024`): -> `clinics`, -> `visits`, -> `patients(clinic_id, id)` composite, -> `doctors(clinic_id, id)` `on delete set null`.
- `updated_at` trigger `handle_prescriptions_updated_at`; indexes on `clinic_id`, `(clinic_id,visit_id)`, `(clinic_id,patient_id)`, `(clinic_id,doctor_id)`.
- **RLS:** 4 policies (select/insert/update/delete), all `is_clinic_member(clinic_id)`.
- **TS types:** `types/database.ts:497 Prescription`, `:476 MedicineEntry`, `:487 LabOrder`, `:520 PrescriptionTemplate`.

**Note semantics:** there is **no separate notes / encounter_notes / SOAP table**, no note type, no author-attribution columns, no status (draft/final/signed), no co-sign, no addendum. The SOAP structure is implicit: `chief_complaint` (S), `findings` (O/E), `diagnosis` + `custom_diagnosis` (A), `follow_up_*` / `doctor_notes` (P).

#### 2.4.5 Orders

- **Medications:** `prescriptions.medicines` jsonb; per-row fields `name, route, form, frequency, duration, unit, instructions`, coerced server-side in `savePrescriptionAction` (`lib/actions/consultation.ts:140-152`).
- **Lab orders:** `prescriptions.lab_orders` jsonb `{ test_name, notes }` (`lib/actions/consultation.ts:149-152`). **No catalog table, no order status, no results table** — lab orders are printed intent only.
- **Reusable sets:** `prescription_templates` (`0024`) — doctor-scoped `{name, diagnosis, custom_diagnosis, medicines, lab_orders, doctor_notes}`.
- **Print:** `components/consultation/prescription-preview.tsx`; the header's *Print Preview* button calls `window.print()` (`consultation-view.tsx:77-79`).

#### 2.4.6 Billing / coding (ICD-10) — absent

- Tables: `patient_bills`, `patient_bill_items`, `patient_payments`, `receipts` (`0025_patient_billing.sql`; FK/composite hardening `0030`; `discount_amount`, `discount_percent` `0028`; `bill_number`, `bill_type`, `bill_date`, `doctor_id` `0029`; `notes` `0036_bill_notes.sql`).
- `patient_bill_items`: `description text (1..255)`, `quantity int`, `unit_price numeric(12,2)`, `line_total numeric(12,2)` — **free-text line items, no code column**.
- Platform billing (`0010_billing.sql`) is SaaS subscription billing (`subscription_plans`, `subscriptions`, `payment_methods`, `payment_submissions`, `billing_events`) — unrelated to clinical coding.
- **Verified gap:** a repo-wide case-insensitive search for `icd` across `supabase/migrations/*.sql`, `lib/**/*.ts`, `types/*.ts` and `app/api/**` returns **no matches**. There is **no ICD-10 / CPT / SNOMED / LOINC table, no diagnosis code column, no charge master and no claims model**. Diagnosis is free text (`prescriptions.diagnosis`, `custom_diagnosis`); prices come from `services` (`0004_services_availability.sql`).

#### 2.4.7 Other encounter-adjacent tables

| Table | Migration | Relevance |
| --- | --- | --- |
| `appointments` | `0005` (+ `consultation_type` `0021`, booking fields `0027`, enhancements `0028`) | parent of `visits.appointment_id`; status enum; `booking_source` |
| `doctors` | `0017` (+ profile/slots/vitals config `0033`) | `user_id` link for "my patients"; `signature_url` printed on Rx |
| `services` | `0004` | priced items used for bill lines |
| `pre_consultation_questions` / `pre_consultation_answers` | `0035` | patient-reported history shown in the encounter left rail (`consultation-queries.ts:146-157`) |
| `patient_documents` | `0029` | uploads (lab PDFs etc.), served by `app/api/patients/documents/[id]/route.ts` |
| `clinic_ai_settings` / `clinic_ai_secrets` / `ai_conversation_logs` | `0007`, `0029` | existing LLM config + conversation logging |
| `app_event_logs` | `0013` | operational audit (no clinical categories) |

### 2.5 Validation of the note payload

`savePrescriptionSchema` (`lib/validation/schemas.ts:1505`) parses the 10 form fields (visitId, chiefComplaint, findings, diagnosis, customDiagnosis, medicines, labOrders, followUpDate, followUpNotes, doctorNotes). Invalid input returns `{ ok:false, message }`, rendered inline under the form (`prescription-form.tsx:275-277`).

---

## 3. UI Layout & Embedding Points

### 3.1 Application shell (where a global widget / floating recorder would live)

`app/app/layout.tsx`:

```
MobileNavProvider
└── div.flex.min-h-svh.flex-col.bg-app
    ├── <AppHeader/>            (Suspense; components/app/app-header.tsx -> app-header-shell.tsx)  h-16, border-b
    └── div.flex.min-w-0.flex-1
        ├── <AppSidebar/>       (Suspense; components/app/app-sidebar.tsx -> app-sidebar-shell.tsx,
        │                          NAV_ICONS + APP_NAV_SECTIONS from lib/constants.ts:49)   w-64, border-r
        └── div.min-w-0.flex-1
            └── <main class="mx-auto w-full max-w-5xl px-4 py-8">  <- children
```

- `main` is capped at `max-w-5xl`; routes opt out by rendering `data-app-wide` on the layout root — `app/app/patients/layout.tsx` does exactly that, with `main:has(> [data-app-wide]) { max-width: none }` in `app/globals.css`.
- Navigation is data-driven: `APP_NAV_SECTIONS` (`lib/constants.ts:49-80`) -> `APP_NAV_ITEMS` (`:83`). **Note:** the `Consultation` item was removed from this list in the current iteration; the `/app/consultation` route itself still exists and is reachable by deep link (`?visit=…&from=patients`).
- **A floating recording widget / global copilot trigger mounted in this layout would appear on every `/app/*` route** (single insertion point), independent of encounter state.

### 3.2 The encounter view (`ConsultationView`) — primary embed target

`components/consultation/consultation-view.tsx`:

| Region | Lines | Current content | Embedding opportunity |
| --- | --- | --- | --- |
| Header actions row | `:91-144` | back arrow, title, **Print Preview**, **Complete & Next** `<form>` | *Dictate / Copilot* toggle beside Print Preview; row is already `flex items-center justify-between` |
| Left rail (300px) | `:152-253` | Patient Details, Pre-Consultation Answers, Vitals | Add a **Copilot panel card** (transcript, draft sections, undo) using the same `Card` pattern — zero layout change |
| Main pane | `:256-265` | `<PrescriptionForm>` inside `<Card>` | Section-level "insert / replace" affordances on each `Textarea`/`Input` |
| Grid | `:150` | `grid grid-cols-[300px_1fr] gap-6` | becomes `grid-cols-[300px_1fr_320px]` (or a right-hand `aside`) if the copilot needs a persistent column |
| Print preview | `:268-280` | `PrescriptionPreview` (screen-hidden) | generated text must land in the same fields to be printed |

**Same component mounts:** full page (`app/app/consultation/page.tsx:108`) and full-screen overlay (`write-prescription-overlay.tsx:173`), the latter `fixed inset-0 z-50` with its own `Escape` handling and body-scroll lock (`:85-96`) — a floating recorder must live inside that stacking context.

### 3.3 The Patients EMR workspace — second embed target

`components/patients/patients-workspace.tsx` (master-detail shell, 183 lines):

```
grid lg:grid-cols-[minmax(340px,30%)_minmax(0,1fr)] gap-4     :94
├── left: sticky PatientListPane (search, KPI pills, rows)     :95-111
└── right: PatientRecord (rounded-card border bg-surface)      :113-139
    ├── RecordBanner  components/patients/record/record-banner.tsx (272 lines)
    │     • identity avatar / name / UHID / contact chips
    │     • ACTION ROW (:160-201): [Write Prescription] [Start Consultation | Complete and Next]
    ├── tablist (?tab= links via patientDirectoryHref)         patient-record.tsx:110-144
    └── tab body: visits / health / vitals / prescriptions /
                  appointments / documents                     patient-record.tsx:146-206
```

Embedding options on this surface:

- **RecordBanner action row** (`record-banner.tsx:160-201`) — already the "start the encounter" affordance; a *Dictate note* button sits here naturally once `activeVisit.status === 'in_consultation'`.
- **Write Prescription overlay** (`patients-workspace.tsx:144-152`) — full-screen; ideal canvas for a floating mic widget.
- **`VisitHistoryTab` / `PrescriptionsTab`** (`components/patients/record/`) — read-only prior notes.

### 3.4 How state updates today when a note or order is typed and saved

Exact current sequence for the note form:

1. **Typing** -> local `useState` only (`prescription-form.tsx:35-49`, handlers `:63-102`). Nothing hits the network; nothing persists; leaving the page loses the draft.
2. **Submit** -> React 19 `<form action={savePrescriptionAction}>` (`:117`) with hidden `visitId`, `medicines` (JSON), `labOrders` (JSON).
3. **Server action** (`lib/actions/consultation.ts:98-183`):
   - Zod parse -> `createClient()` -> `getCurrentClinic()` -> `canManageClinical(role)` gate (`:118-125`);
   - re-reads `visits (patient_id, doctor_id)` (`:128-137`);
   - **upsert** into `prescriptions` with `onConflict: "clinic_id,visit_id"` (`:171-175`);
   - `revalidatePath(APP_ROUTES.app.consultation)` (`:181`);
   - returns `{ ok: true, data: visitId }`.
4. **Client reaction** -> `useEffect` on `state?.ok` calls `router.refresh()` (`prescription-form.tsx:56-60`), which re-runs the Server Component and re-fetches visit, patient, vitals, prescription and answers.
5. **UI feedback** -> inline success text (`:278-280`) or inline error (`:275-277`); no toast.

Same pattern elsewhere: `consultation-view.tsx:70-75` (`advanceState.ok -> router.refresh()` + optional `onAdvanceSuccess`), `record-banner.tsx` (imperative `startTransition(async () => …)` around the actions, then `router.refresh()` / `router.push(next patient)`), `queue/check-in-modal.tsx` (`handledRef` single-shot guard so refresh effects fire once).

**Consequences for a copilot:**

- Voice-written content should either ride the existing Server Action / `FormData` contract or introduce an explicit autosave/patch endpoint — **today there is no incremental save**.
- Because `router.refresh()` re-renders from the server, external writes to `prescriptions` propagate on the next refresh; there is **no realtime subscription** (no `.channel(` / `postgres_changes` usage anywhere).
- Avoid the known effect-loop pitfall already solved in `check-in-modal.tsx`: use `useActionState` carefully or imperative `startTransition` handlers as in `record-banner.tsx`.

### 3.5 Other capture surfaces

- **Check-in modal** `components/queue/check-in-modal.tsx` (730 lines) — receptionist flow: patient select -> payment -> vitals -> receipt. Logic in `lib/actions/queue.ts` (`checkInPatientAction:45`, `recordVitalsAction:302`, `reorderQueueAction:400`).
- **Vitals form** `components/queue/vitals-form.tsx` (374) — controlled numeric fields + computed BMI; saves then `router.refresh()`.
- **Pre-consultation Q&A** (`pre_consultation_answers`) is already free text and rendered in the encounter left rail — a natural "patient said…" input for an ambient copilot.

---

## 4. API Endpoints & Integration Logic

### 4.1 Route Handlers (`app/api/**/route.ts`)

| Route | Methods | Purpose | Auth model |
| --- | --- | --- | --- |
| `app/api/ai/chat/route.ts` | `POST` | Internal AI receptionist chat (Phase 5). Zod body, `runtime = "nodejs"`, `maxDuration = 60`, per-user + per-IP rate limits | `auth.getUser()` -> `getCurrentClinic()` -> `canWriteClinic()` (owner/admin); 401/403/429/502 |
| `app/api/patients/[id]/ai-summary/route.ts` | `POST` | Generate/refresh cached `patients.ai_summary`; hourly per-user window; **never runs on page load** | `auth.getUser()` + `getCurrentClinic()` + `canManageClinical()` |
| `app/api/patients/documents/[id]/route.ts` | `GET` | Stream/download a patient document | session (cookie client) |
| `app/api/billing/proof/[id]/route.ts` | `GET` | Payment-proof image | session |
| `app/api/widget/chat/route.ts` | `POST` | **Public** booking-widget chat (service-role client + manual scoping) | IP + slug rate limits, no session |
| `app/api/widget/[slug]/settings/route.ts` | `GET` | Public widget config | public |
| `app/api/whatsapp/webhook/route.ts` | `GET`, `POST` | Meta webhook verify + inbound messages | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| `app/api/cron/appointment-reminders/route.ts` | `POST` | Scheduled reminders | `Authorization: Bearer CRON_SECRET` |
| `app/auth/callback/route.ts` | (auth) | Exchanges verification/OAuth token -> session cookie | — |

**Pattern to copy for a new copilot endpoint** (mirror `app/api/ai/chat/route.ts`): `export const runtime = "nodejs"`; `export const maxDuration = 60`; Zod-parse the body; `createClient()` -> `auth.getUser()` -> `getCurrentClinic()` -> role gate -> `checkRateLimit()` -> `resolveProviderForClinic(clinicId)` -> `NextResponse.json({ ok, … })` with 400/401/403/429/502.

### 4.2 Server Actions used by the encounter (the de-facto "clinical API")

`lib/actions/consultation.ts` (285 lines):

| Action | Line | Effect |
| --- | --- | --- |
| `startConsultationAction(prev, formData)` | `:20` | RPC `start_consultation`; revalidates `/app/consultation`, `/app/appointments`, `/app/patients`; returns `visit.id` (`:52`) |
| `completeAndAdvanceAction(prev, formData)` | `:58` | RPC `complete_and_advance`; returns the **next patient id** (`data?.patient_id ?? ""`, `:92`) |
| `savePrescriptionAction(prev, formData)` | `:98` | Upsert `prescriptions` on `(clinic_id, visit_id)`; returns `visitId` (`:182`) |
| `saveTemplateAction` / `deleteTemplateAction` | `:188` / `:253` | Prescription-template CRUD (doctor-scoped) |

Adjacent action modules a copilot may need: `lib/actions/queue.ts` (check-in/vitals/reorder), `lib/actions/patients.ts` (`createPatientAction:17`, `createPatientAndGetIdAction:91`, `updatePatientAction:163`), `lib/actions/patient-billing.ts` (`createPatientBillAction:22`, `collectPatientPaymentAction:99`), `lib/actions/patient-documents.ts` (`uploadPatientDocumentAction:103`), `lib/actions/pre-consultation.ts` (`replacePreConsultationQuestions:28`).

### 4.3 Read-side (Server Component) data functions

| Function | Location | Used by |
| --- | --- | --- |
| `fetchConsultationData(supabase, clinicId, visitId)` | `lib/consultation-queries.ts:108` -> `ConsultationData { visit, patient, doctor, service, vitals, prescription, answers }` (`:44`) | `/app/consultation` + Write Prescription overlay |
| `fetchDoctorWaitingList(...)` | `:58` | `/app/consultation` |
| `fetchPrescriptionTemplates(...)` | `:174` | both |
| `findDoctorForUser(...)` | `:194` | both |
| `fetchPatientRecord(...)` | `lib/patient-record.ts:73` -> `{ visits, vitals, prescriptions }` (`:43`) | `/app/patients` |
| `fetchTodayQueue` / `fetchWaitingQueue` / `fetchAllAppointments` | `lib/visits-queries.ts:28` / `:117` / `:204` | appointments & queue pages |
| `fetchActiveVisitInfo(...)` | `app/app/patients/page.tsx:376` (per-doctor queue eligibility; drives *Start Consultation*) | `/app/patients` |
| `fetchVitalsConfigs(...)` | `lib/vitals-config.ts` (server preload; avoids post-mount reflow) | both encounter surfaces |

### 4.4 Existing AI/LLM integration logic (the layer a copilot would extend)

- **Provider abstraction:** `lib/ai/types.ts` — `AIProvider` with `chat` / `complete`, `AIChatMessage`, `AIFunctionCall` (function-calling capable), `AITextPart`.
- **Implementation:** `GeminiProvider` (`lib/ai/gemini-provider.ts:29`) on `@google/genai`; singleton `getGeminiProvider():160` (reads `GEMINI_API_KEY`).
- **Per-clinic credentials:** `resolveProviderForClinic(clinicId)` (`lib/ai/provider.ts:35`) reads `clinic_ai_settings` + `clinic_ai_secrets` with the **service-role** client (zero RLS on that table), falling back to the env-backed provider.
- **Orchestration:** `runReceptionistTurn(...)` (`lib/ai/orchestrator.ts:158`) — multi-turn with tool calls; `ReceptionistProviderError` (`:24`) carries quota/retry info; tools in `lib/ai/tools.ts` (`AI_TOOLS:498`, `ToolContext:33`); system prompt `lib/ai/system-prompt.ts`; logging `lib/ai/logging.ts`; rate limiting `lib/ai/rate-limit.ts`.
- **Clinical AI (existing):** `lib/ai/patient-summary.ts` — off by default (`PATIENT_AI_SUMMARY_ENABLED`), de-identifies before egress (no name/phone/UHID/doctor names), caches into `patients.ai_summary` keyed by `ai_summary_visit_count`.
- **Streaming / WebSocket / audio:** **none.** A repo-wide search for `text/event-stream`, `ReadableStream`, `WebSocket`, `EventSource`, `navigator.mediaDevices`, `MediaRecorder`, `SpeechRecognition`, `getUserMedia` returns **zero matches**. All AI responses today are single-shot JSON (`NextResponse.json`).

### 4.5 Environment variable inventory

Names only (values in `.env.local`, documented in `.env.example`):

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_DOMAIN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `AI_CHAT_RATE_LIMIT`, `AI_CHAT_IP_RATE_LIMIT`, `PATIENT_AI_SUMMARY_ENABLED`, `PATIENT_AI_SUMMARY_RATE_LIMIT`, `WIDGET_CHAT_IP_RATE_LIMIT`, `WIDGET_CHAT_SLUG_RATE_LIMIT`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_RATE_LIMIT_PER_MINUTE`, `CRON_SECRET`.

---

## 5. Facts that constrain an Ambient Voice Copilot (observed, not prescriptions)

1. **Note = 10 fields, one row per visit** (`prescriptions`, `unique (clinic_id, visit_id)`). Section-level dictation maps directly onto `chief_complaint` / `findings` / `diagnosis` / `custom_diagnosis` / `medicines[]` / `lab_orders[]` / `follow_up_*` / `doctor_notes`.
2. **No rich-text editor** exists — formatted output would require adding an editor library or writing into `<textarea>` values controlled by `useState` in `prescription-form.tsx`.
3. **No autosave** — persistence is button-driven through a Server Action; a copilot either rides that action or needs an incremental-save endpoint (a patch-style server action on `prescriptions` would be the smallest change).
4. **No realtime channel, no streaming, no WebSocket** — progressive transcript/draft rendering needs SSE/`ReadableStream` added; nothing exists to reuse.
5. **No audio/media APIs in the codebase**; HTTPS dev server is already configured (`package.json:6`), which is the prerequisite for mic capture.
6. **No ICD-10/CPT coding, no charge master, no claim status** — a copilot cannot write diagnosis codes anywhere today; only free-text `diagnosis`.
7. **No clinical audit trail** — `app_event_logs` covers `api/booking/email/auth/billing` only; there is no per-field note history or sign event to hang "who dictated what" on.
8. **Tenant isolation is RLS-enforced** — any new copilot table needs `clinic_id` + `is_clinic_member(clinic_id)` policies (copy the `0024` prescriptions block) and composite same-clinic FKs.
9. **LLM egress is governed here** — the existing clinical AI (`patient-summary`) is opt-in via env flag, de-identifies payloads, is rate-limited and documented as a privacy decision in `.env.example`. Raw dictation would be a higher-sensitivity class than anything currently sent.
10. **Role model is coarse** — `canManageClinical` = all roles; `canWriteClinic` = owner/admin. `prescriptions` RLS is membership-based, not role-based.
11. **Encounter lifecycle is DB-owned** — `start_consultation` / `complete_and_advance` are advisory-locked RPCs; a copilot must not flip `visits.status` from the client.
12. **Doctor identity is optional** — `doctors.user_id` may be `null` (`findDoctorForUser` returns `null`), so "the current clinician" is not always resolvable; dictated-note attribution needs a fallback.

---

## 6. Quick file index (encounter path)

| Concern | Path |
| --- | --- |
| Encounter page (server) | `app/app/consultation/page.tsx` |
| Encounter screen (client) | `components/consultation/consultation-view.tsx` |
| Note editor | `components/consultation/prescription-form.tsx` |
| Medication row / lab row | `components/consultation/medicine-entry.tsx`, `lab-order-entry.tsx` |
| Templates | `components/consultation/template-manager.tsx` |
| Print output | `components/consultation/prescription-preview.tsx` |
| Overlay (from patient record) | `components/consultation/write-prescription-overlay.tsx` |
| Waiting list | `components/consultation/doctor-waiting-list.tsx` |
| Encounter actions (server) | `lib/actions/consultation.ts` |
| Encounter queries | `lib/consultation-queries.ts` |
| Patient record shell | `components/patients/patients-workspace.tsx` -> `patient-record.tsx` -> `record/record-banner.tsx` |
| Patient page (server) | `app/app/patients/page.tsx` |
| Vitals capture | `components/queue/vitals-form.tsx`, `check-in-modal.tsx`, `lib/actions/queue.ts` |
| Schema: note table | `supabase/migrations/0024_consultation_prescription.sql` |
| Schema: encounter table | `supabase/migrations/0023_patient_checkin_queue_vitals.sql`, `0040_doctor_scoped_consultation_locks.sql` |
| Schema: patient | `supabase/migrations/0005_patients_appointments.sql` (+ `0006`, `0027`, `0029`, `0039`) |
| Schema: billing | `supabase/migrations/0025_patient_billing.sql` (+ `0028`, `0029`, `0030`, `0036`) |
| Validation | `lib/validation/schemas.ts` |
| DB types | `types/database.ts` |
| Auth/session clients | `middleware.ts`, `lib/supabase/{server,client,middleware,widget}.ts` |
| Tenant/role gates | `lib/clinic-access.ts`, `supabase/migrations/0002_rls_policies.sql`, `0014_security_hardening_phase9.sql` |
| AI provider layer | `lib/ai/{types,provider,gemini-provider,orchestrator,tools,rate-limit,system-prompt,patient-summary}.ts` |
| Existing AI endpoints | `app/api/ai/chat/route.ts`, `app/api/patients/[id]/ai-summary/route.ts` |
| Env documentation | `.env.example`, `.env.local` |
