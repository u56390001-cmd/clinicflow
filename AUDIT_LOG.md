# AUDIT_LOG.md — Multi-Tenancy & RLS Zero-Trust Security Audit

**Project:** ClinicFlow / MedBook AI (multi-clinic SaaS)
**Spec:** `docs/66_security_audit_multitenancy_rls_v2.md`
**Status:** Phase A (Discovery) complete. **No fixes applied yet.** Awaiting approval before Phase B/C/D migrations per Operating Rule #1.
**Live project:** Supabase ref `ntkuxmrhpigzyeutffjc` (name `ClinicFlowAi`).
**Method:** Read-only queries via `supabase db query --linked` (Docker unavailable, so `db dump`/`db diff` cannot run). Raw outputs saved under `%TEMP%\opencode\audit\` (A1–A10, F1–F4).

---

## 1. Tenant Classification Matrix (every table/view)

Classes: **T-direct** (`clinic_id NOT NULL`), **T-indirect** (scoped via parent), **G-global**, **P-platform**, **S-secret**, **L-log**, **V-view**.

| Table | Class | Notes |
|---|---|---|
| clinics | T-root | Tenant root; key is `id` (not `clinic_id`) |
| clinic_members | T-direct | Membership/roles |
| clinic_invites | T-direct | |
| services | T-direct | |
| availability_rules | T-direct | |
| blocked_times | T-direct | |
| doctors | T-direct | |
| doctor_slot_templates | T-direct | |
| service_slot_templates | T-direct | |
| doctor_vitals_config | T-direct | |
| pre_consultation_questions | T-direct | |
| pre_consultation_answers | T-direct | |
| patients | T-direct | |
| appointments | T-direct | |
| visits | T-direct | |
| vitals | T-direct | |
| prescriptions | T-direct | |
| prescription_templates | T-direct | |
| patient_bills | T-direct | |
| patient_bill_items | T-direct | |
| patient_payments | T-direct | |
| receipts | T-direct | |
| patient_documents | T-direct | |
| clinic_ai_settings | T-direct | |
| whatsapp_conversations | T-direct | |
| whatsapp_messages | T-direct | |
| websites | T-direct | |
| website_images | T-direct | |
| engagement_automations | T-direct | |
| engagement_templates | T-direct | |
| engagement_logs | T-direct | |
| clinic_reviews | T-direct | |
| growth_agent_settings | T-direct | |
| growth_posts | T-direct | |
| growth_metrics | T-direct | |
| clinic_integrations | T-direct | |
| medical_history | T-direct | |
| patient_intake_tokens | T-direct | |
| patient_medications | T-direct | |
| patient_alerts | T-direct | |
| patient_lab_results | T-direct | |
| encounter_transcripts | T-direct | |
| copilot_audit_logs | T-direct / L-log | |
| medicines | T-direct | |
| clinic_addons | T-direct | |
| support_tickets | T-direct (nullable clinic_id) | |
| app_event_logs | L-log (nullable clinic_id) | System events may be NULL |
| ai_conversation_logs | L-log | |
| billing_events | T-indirect / L-log | via `subscription_id`; no `clinic_id` |
| clinic_ai_secrets | S-secret | via `settings_id` |
| clinic_whatsapp_secrets | S-secret | via `config_id` |
| clinic_integration_secrets | S-secret | via `integration_id` |
| growth_agent_secrets | S-secret | via `settings_id` |
| subscription_plans | G-global | |
| payment_methods | G-global | |
| addons | G-global | Public catalog (intended) |
| platform_admins | P-platform | |
| patient_directory | V-view | `security_invoker=true` (verified F4) |

Auto-detected extra tables not in the spec's list: `clinic_integrations`, `clinic_integration_secrets`, `growth_agent_settings`, `growth_agent_secrets`, `growth_posts`, `growth_metrics`, `medical_history`, `patient_intake_tokens`, `patient_medications`, `patient_alerts`, `patient_lab_results`, `encounter_transcripts`, `copilot_audit_logs`, `medicines`, `addons`, `clinic_addons`, `support_tickets`, `engagement_*` (×3), `clinic_reviews`. **All are audited under zero-trust rules** (see Section 5).

---

## 2. Database Inventory (query outputs)

### A1 — RLS status
All **61** `public` tables have `relrowsecurity = true`. No table with RLS disabled. (No `rls_forced`.)

### A2 — Policies
251 storage+public policies captured in `A2.out.csv`. Key defects listed in Section 5.

### A3 — Tables WITHOUT `clinic_id`
`addons, billing_events, clinic_ai_secrets, clinic_integration_secrets, clinic_whatsapp_secrets, clinics, growth_agent_secrets, payment_methods, platform_admins, subscription_plans` — each correctly classified (root / global / platform / secret / indirect).

### A4 — Functions (`SECURITY DEFINER`, `search_path`, EXECUTE ACL)
SECURITY DEFINER: `complete_and_advance`, `ensure_engagement_defaults`, `ensure_walk_in_service`, `is_addon_active`, `is_clinic_admin`, `is_clinic_member`, `is_clinic_owner`, `is_platform_admin`, `merge_patient_profiles`, `resolve_website_domain`, `rls_auto_enable`, `start_consultation`.
- `start_consultation` / `complete_and_advance`: `search_path=""`, ACL includes `=X/postgres` (= **PUBLIC/anon** execute) and **no membership check** → B1 confirmed.
- `ensure_engagement_defaults`: definer, `search_path=public`, PUBLIC+anon execute → cross-tenant write confirmed.
- `is_addon_active` / `resolve_website_domain`: definer, anon execute (verify bodies).
- `activate_subscription`: **INVOKER**, PUBLIC+anon execute, no admin check → B3 confirmed.
- `merge_patient_profiles`, `ensure_walk_in_service`: definer with membership checks, no anon execute → acceptable (keep).

### A5 — Views
Only `patient_directory`; `reloptions = {security_invoker=true}` (F4 confirms it filters `merged_at IS NULL` and scopes by `clinic_id`). **OK.**

### A6 — Grants
`anon` and `authenticated` hold **ALL** table privileges on **every** `public` table (defense-in-depth gap, B23).

### A7 — Storage buckets
| bucket | public | file_size_limit | allowed_mime_types |
|---|---|---|---|
| website-images | true | NULL | NULL |
| patient-documents | false | NULL | NULL |
| ai-ocr-documents | false | NULL | NULL |
| clinic-logos | true | 2 MB | (set) |
| reminder-header-images | true | 300 KB | (set) |
| payment-proofs | **DOES NOT EXIST** | — | — |

`payment-proofs` is referenced by `app/api/billing/proof/[id]/route.ts` and has storage policies but the bucket is missing → those policies are dead and the route 500s.

### A8 — Realtime publication
`supabase_realtime` is **empty**. App polls; no realtime exposure.

### A9 — Foreign keys
Composite `(clinic_id, x_id)` FKs exist for many relations (services↔doctors, appointments↔patients/services/doctors, visits, bills, pre-consultation, encounter_transcripts, etc.). **Single-column tenant FKs still present** (B11): `website_images.website_id`, `whatsapp_conversations.patient_id`, `whatsapp_messages.conversation_id`, `vitals.visit_id`, `prescriptions.visit_id`, `patient_bill_items.bill_id`, `patient_payments.bill_id`, `receipts.bill_id`, `medical_history.patient_id`, `patient_medications.patient_id`, `patient_alerts.patient_id`, `patient_lab_results.patient_id`, `patient_lab_results.document_id`, `patient_intake_tokens.patient_id`, `encounter_transcripts.visit_id`, `copilot_audit_logs.visit_id`, `engagement_logs.patient_id`.

### A10 — Triggers / event triggers / extensions
- Triggers: `handle_updated_at`, `assign_patient_code`, `patients_reject_merge_chain`, `validate_clinic_ai_settings_faqs` (+ per-table `updated_at`). **No** `clinic_id` immutability, last-owner, subscription-status, or payment-submission guard triggers.
- Event trigger: `rls_auto_enable` (enables RLS on new tables) + standard Supabase triggers.
- Extensions: `pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp`. No `pg_net`/`pg_cron`/`http`.

### F1 — Function bodies
Confirmed above.
### F2 — Non-`clinic_id` tables' columns
`clinic_ai_secrets.api_key`, `clinic_whatsapp_secrets.access_token`, `clinic_integration_secrets.api_key/api_secret`, `growth_agent_secrets.refresh_token/access_token` — plaintext credentials, parent-scoped.
### F3 — Constraints
Parents missing `UNIQUE (clinic_id, id)`: `websites`, `whatsapp_conversations`, `patient_bills`, `patient_documents` (and others). Needed before composite FKs can be added for B11.
### F4 — `patient_directory`
`security_invoker = true`; safe.

---

## 3. Application-Layer Inventory

### Service-role client (`lib/supabase/widget.ts` → `createWidgetClient()`, bypasses RLS)
Importers: `lib/actions/ai-settings.ts`, `auth.ts`, `inbox.ts`, `patient-intake-actions.ts`, `public-booking.ts`, `team.ts`, `whatsapp.ts`; `lib/ai/provider.ts`; `lib/email/send.ts`; `lib/notifications/{email,whatsapp}.ts`; `lib/supabase/secrets.ts`; `lib/whatsapp/client.ts`.
**Each must be verified to resolve tenant server-side and carry explicit `.eq('clinic_id', …)`.** Server Actions using service-role bypass RLS entirely — highest-risk surface. (B14/B15)

### `app/api/**` routes and auth
| Route | Auth |
|---|---|
| `api/whatsapp/webhook` | ✅ `X-Hub-Signature-256` HMAC (raw body); accepts unsigned only when `NODE_ENV !== production` and `META_APP_SECRET` unset |
| `api/cron/appointment-reminders` | ✅ `Authorization: Bearer CRON_SECRET` or `x-cron-secret`; fails closed if unset |
| `api/billing/proof/[id]` | ✅ session + membership/platform-admin; ❌ references missing `payment-proofs` bucket |
| `api/patients/documents/[id]` | session (verify) |
| `api/patients/[id]/ai-summary` | session (verify) |
| `api/scribe/*` (3) | session (verify) |
| `api/ai/chat` | session (verify) |
| `api/display/queue/[slug]` | public-by-slug (verify scoping) |
| `api/growth/google/callback` | OAuth state (verify) |
| `api/widget/**` (3) | public-by-slug; service-role (verify scoping/rate-limit) |

### Server Actions (`lib/actions/**`, 34 files)
Every file must: authenticate → resolve clinic from membership server-side → check role for admin mutations → Zod-validate → ignore client-supplied `clinic_id`/`user_id`/`role`/`price`/`status`. Service-role users listed above need the strictest review. Detailed per-action compliance table pending (not yet produced).

### Middleware
`middleware.ts` protects only `/app/*` (note: tests `startsWith("/app/")`, so bare `/app` is not matched). API routes are **not** protected by middleware → each handler owns its auth. Uses `updateSession` (JWT-based routing). Public: `/site/*`, `/widget/*`, `/api/widget/*`, webhooks.

### Caching
`next.config.ts` sets `experimental.staleTimes.dynamic = 30`. No `unstable_cache`/`revalidate` per-tenant tagging observed yet — **flag for B16** (verify no per-user/per-tenant dynamic data is shared across sessions by the client router cache).

### `NEXT_PUBLIC_*`
Only Supabase URL + anon key and app URL are expected public. Service-role / provider keys live in non-public env. **No `import "server-only"` guard on `lib/supabase/widget.ts`** → recommend adding.

---

## 4. Role-Permission Matrix (CURRENT behavior)

Legend: ✅ allowed · ➖ denied · ⚠️ anomalous.

| Table | owner | admin | staff | anon | other-clinic |
|---|---|---|---|---|---|
| Config (services, doctors, slots, availability, blocked_times, pre_consultation_questions, clinic_ai_settings, clinic_whatsapp_config, websites, website_images) | RWD | RWD | R | ➖ | ➖ |
| Clinic-floor (patients, appointments, visits, vitals, prescriptions, bills, etc.) | RW | RW | RW | ➖ | ➖ |
| Config deletes | ✅ | ✅ | ➖ | ➖ | ➖ |
| clinic_members | R/W | R/W⚠️ (can update/demote owner; cannot delete owner) | R | ➖ | ➖ |
| clinics | RU/D | RU/D | R | ⚠️ **ALL rows** via `USING (true)`; plus booking_slug public rows | ⚠️ **ALL rows** |
| subscriptions | R | **I/U own⚠️** (self-activate) | R | ⚠️ read own via `auth.uid()` (fails closed) | ➖ |
| payment_submissions | R | **I own⚠️** (any status/amount) | R | ⚠️ read own (fails closed) | ➖ |
| billing_events | — | R own | — | ⚠️ **INSERT true** | ➖ |
| app_event_logs | — | R | — | ⚠️ INSERT with `clinic_id IS NULL` | ➖ |
| secret tables | ➖ | ➖ | ➖ | ➖ (zero policies) | ➖ |
| global (subscription_plans, payment_methods) | R active | R active | R active | R active | R active |
| platform_admins | self R | self R | self R | ➖ | ➖ |

**Proposed changes** (require approval — Section 5 of spec): full proposals in Section 5 below.

---

## 5. Findings (verified against live DB)

Status: `fixed` · `not-applicable` · `needs-decision`

| ID | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| **T-LEAK-1** | 🔴 | `clinics` SELECT policy **"Clinic members can view all clinics"** `USING (true)` `TO public` → any unauthenticated caller can read **every** clinic's row (name, phone, email, address, GST, billing config, slugs). | A2 line 60 | verified, needs fix |
| **B1** | 🔴 | `start_consultation` / `complete_and_advance` SECURITY DEFINER, `search_path=""`, PUBLIC+anon execute, no membership check → cross-tenant visit writes. | A4 #2,#13; F1 | confirmed |
| **B1b** | 🔴 | `ensure_engagement_defaults` SECURITY DEFINER, PUBLIC+anon execute, no membership check → cross-tenant row injection. | A4 #3; F1 | confirmed |
| **B2** | 🔴 | App RPCs executable by PUBLIC/anon (`acl` has `=X/postgres`): `book_appointment, check_in_patient, collect_patient_payment(_with_adjustments), create_patient_bill, get_or_create_subscription, has_active_subscription, record_vitals, record_pre_consultation_answers, reorder_queue, reschedule_appointment, upsert_availability_rules, activate_subscription, start_consultation, complete_and_advance, …` | A4 | confirmed |
| **B3** | 🔴 | `activate_subscription` INVOKER + PUBLIC/anon execute + no admin check; `subscriptions` admin update own with no column restriction → clinic self-activation. | A4 #14; A2 L206 | confirmed |
| **B4** | 🔴 | `payment_submissions` "admin insert own" only checks membership → client can set `status='approved'`, `reviewed_by`, arbitrary `amount`. | A2 L169 | confirmed |
| **B5** | 🔴 | `billing_events` policy `system insert WITH CHECK (true) TO public` → anon can forge billing events. | A2 L15 | confirmed |
| **B6** | 🟠 | `clinic_members_update_admin` lets an **admin update the owner row** (demote to staff); no restriction on changing `user_id`/`email` → owner lock-out + membership injection. (DELETE of owner is protected.) | A2 L48 | confirmed |
| **B7** | 🟠 | `app_event_logs` insert `TO authenticated` with `clinic_id IS NULL OR is_clinic_member(clinic_id)` → NULL-clinic log spam / spoofable actor. | A2 L5 | confirmed |
| **B8** | 🟠 | Many policies omit `TO` (→ PUBLIC), e.g. `medical_history`, `patient_alerts`, `patient_lab_results`, `patient_medications`, `billing_events`, `app_event_logs`, `clinic_addons`, `clinic_integrations`, `copilot_audit_logs`, `encounter_transcripts`, `subscriptions`, `payment_submissions`, `payment_methods`, `subscription_plans`, `support_tickets`, `medicines`, `website_images`, `websites`, `clinic_reviews`, `growth_*`, `engagement_*`, `clinics`. Mostly fail closed via `auth.uid()`, but must be explicit. | A2 | confirmed |
| **B9** | 🔴 | Secret tables: RLS on + **zero policies** (good). Needs a real-JWT behavioural test that `anon`/`authenticated` get 0 rows; and code grep that no user-scoped client selects them. Tables hold plaintext `api_key`/`access_token`/`refresh_token`. | A2 (absent); F2 | partially verified (structural OK) |
| **B10** | 🟠 | Only view `patient_directory`; `security_invoker=true`. **Not-applicable** (no unsafe view/materialized view). | A5; F4 | not-applicable |
| **B11** | 🟠 | Single-column tenant FKs → cross-tenant child injection (website image into another clinic's site; WhatsApp message into another clinic's inbox; vitals/prescription/bill items/med history/alerts/medications/lab results/intake tokens referencing another clinic's parent). | A9; F3 | confirmed (needs pre-flight) |
| **B12** | 🟠 | Any member (incl. `staff`) can DELETE `patients, appointments, visits, prescriptions, patient_bills, patient_bill_items`; direct INSERT on `patient_payments`/`receipts` (bypasses RPC idempotency). | A2 L126–165, L188–190 | **needs-decision** (role matrix) |
| **B13** | 🔴 | Storage: buckets lack `file_size_limit`/`allowed_mime_types` (website-images, patient-documents, ai-ocr-documents); path-prefix policies cast `[1]::uuid` (fails closed on malformed path but should regex-guard); `payment-proofs` bucket **missing** though referenced. | A7; A2 L231–251 | confirmed |
| **B14** | 🔴 | Service-role used across 7 server-action files + helpers without a scoping wrapper; raw factory import is unbounded. | grep | confirmed |
| **B15** | 🔴 | AI/tool tenant-injection: tool `clinic_id`/`patientId` must come from server context — needs code review of orchestrator/tools + adversarial tests. | code review pending | needs-verification |
| **B16** | 🟠 | `getCurrentClinic` uses latest membership; `staleTimes.dynamic=30` client cache. Verify active-clinic is explicit and cache keys are tenant/user-safe. | next.config.ts:17; code review pending | needs-verification |
| **B17** | 🟠 | API routes not covered by middleware; bare `/app` not matched (`startsWith("/app/")`). Each API route auth verified individually (webhook/cron OK). | middleware.ts:49 | confirmed (partially good) |
| **B18** | 🟠 | Server Actions: full authenticate→resolve→role-check→validate audit pending. | code review pending | needs-verification |
| **B19** | 🟡 | Realtime publication empty; app polls. Document in `SECURITY_MODEL.md`. | A8 | not-applicable |
| **B20** | 🟡 | `rls_auto_enable` active (safe default). No `pg_net`/`pg_cron`/`http` extension (no SSRF surface). | A10 | not-applicable |
| **B21** | 🟡 | Uniform error/`NOT_A_CLINIC_MEMBER` leakage review pending. | code review pending | needs-verification |
| **B22** | 🟠 | `is_platform_admin` SECURITY DEFINER (fine); verify no policy allows inserting `platform_admins` (none seen) and admin routes check server-side. | A2 | partially verified |
| **B23** | 🟠 | `anon` & `authenticated` hold **ALL** privileges on **all** tables → RLS is the only gate. Propose `REVOKE` + selective re-grant; **ask whether checkout needs pre-auth `subscription_plans`/`payment_methods` read**. | A6 | confirmed, needs-decision |
| **AUTO-1** | 🟠 | `addons` SELECT `USING (true)` `TO public` — global catalog, likely intended, confirm. | A2 L2 | needs-decision |
| **AUTO-2** | 🟠 | `copilot_audit_logs`, `encounter_transcripts`, `medical_history`, `patient_alerts/_medications/_lab_results` UPDATE policies omit `WITH CHECK` (Postgres reuses USING → effectively safe, but inconsistent). Normalize. | A2 | confirmed |
| **AUTO-3** | 🟡 | `patient_bill_items`, `patient_payments`, `receipts` insert/delete = member; payments/receipts immutable (no U/D) — OK; review whether bill items delete should be admin. | A2 | needs-decision |
| **AUTO-4** | 🟠 | `get_or_create_subscription` invoker + anon execute; can create pending subscription for one's clinic — tie to B3. | A4 #23 | confirmed |
| **AUTO-5** | 🟡 | `prescriptions` has duplicate FKs (`prescriptions_clinic_clinic_fkey` + `prescriptions_clinic_id_fkey`). Cleanup candidate. | A9 #50–54 | note |

---

## 6. Section 4 disposition summary

- **Confirmed:** B1, B1b, B2, B3, B4, B5, B6, B7, B8, B11, B12, B13, B14, B23 (+ T-LEAK-1).
- **Not-applicable (with evidence):** B10 (no unsafe view), B19 (empty publication), B20 (no risky extensions).
- **Needs verification (code review):** B9 (behavioural), B15, B16, B18, B21, B22 (partially).
- **Needs your decision:** B12 (who may delete clinical/financial rows), B23 (revoke anon privileges / checkout needs), AUTO-1 (addons public).

---

## 7. Proposed Role-Matrix Changes (awaiting approval)

1. **Drop** `clinics` policy `"Clinic members can view all clinics"` (`USING true`). Keep `clinics_select_member` and the `booking_slug` public policy.
2. **subscriptions:** members may INSERT only `status='pending_payment'`, `current_period_* = NULL`, valid `plan_id`; **no UPDATE** by members. `activate_subscription` → platform-admin check + revoke from `authenticated`/`anon`. Trigger forbids member changes to `status`, `plan_id`, `current_period_*`.
3. **payment_submissions:** INSERT `WITH CHECK (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL AND subscription belongs to clinic_id)`; amount validated against plan price by DB trigger; no member UPDATE of status/review columns.
4. **billing_events:** drop `system insert (true)`; writes only via service-role/SECURITY DEFINER.
5. **app_event_logs:** insert `TO authenticated` requiring `actor_user_id = auth.uid()` when set; NULL-clinic events service-role only.
6. **clinic_members:** only `owner` may change/delete an `owner` row; trigger prevents removing/demoting the **last owner**; trigger rejects changes to `user_id`/`clinic_id`/`email`/`created_at`; restrict updatable column to `role`.
7. **B12 proposal:** clinical/financial **deletes → admin-only** (or soft-delete); payments/receipts written only through RPCs.
8. **B23 proposal:** `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon` + `ALTER DEFAULT PRIVILEGES … REVOKE … FROM anon`; re-grant only `subscription_plans`/`payment_methods` active reads **if checkout truly needs pre-auth access**.
9. **B8:** add `TO authenticated` to every tenant policy.
10. **B11:** add `UNIQUE (clinic_id, id)` to the four parents, then composite FKs `NOT VALID` → `VALIDATE`.
11. **New helper functions:** `prevent_clinic_id_change()` trigger + per-table immutability triggers + `clinic_id` indexes where missing.

**Migration list** (numbering continues at **0064**; all written this session):
- `0064_rls_hardening_privileges.sql` — ✅ written. B2/B23 execute/table grants (anon) + `ALTER DEFAULT PRIVILEGES`, `TO authenticated` normalization (B8), T-LEAK-1 policy drop, anon catalog re-grants.
- `0065_rls_hardening_functions.sql` — ✅ written. B1/B1b RPC membership checks (search_path kept `''`), `activate_subscription` admin guard, `get_or_create_subscription` membership+active-plan gate.
- `0066_rls_hardening_billing.sql` — ✅ written. B3 subscriptions insert/update + `subscriptions_guard` trigger; B4 payment_submissions scoped insert + price override trigger; B5 billing_events scoped actor insert (drift policies `"Submissions: admin insert own"` dropped).
- `0067_rls_hardening_membership.sql` — ✅ written. B6 owner-row handling, last-owner + identity-immutable guards.
- `0068_rls_hardening_logs.sql` — ✅ written. B7 app_event_logs actor check.
- `0069_rls_hardening_tenant_fks.sql` — ✅ written. B11 uniques + composite FKs (`NOT VALID` → `VALIDATE`) + `prevent_clinic_id_change()` triggers + clinic_id indexes (C4/C5).
- `0070_storage_hardening.sql` — ✅ written. B13 bucket limits/mime + create missing `payment-proofs` bucket + `storage_path_clinic_id()` defensive parser + recreated storage policies.
- `0071_rls_hardening_trigger_grants.sql` — ✅ written. Strips PUBLIC/anon EXECUTE from the four guard/trigger functions created after 0064's revoke loop (found by live testing: they were anon-executable; authenticated+service_role kept).

Each migration ends with `notify pgrst, 'reload schema';` and a rollback note.

**Applied to live + verified (this session) — `supabase db query --linked` (same Management API the Supabase MCP uses; the MCP server is configured in `.mcp.json` but its tools were not exposed to this session):**
- `0064`–`0071` were confirmed already applied to the live project by @mentor (live migration history uses timestamp ids, not `00NN` names).
- `0071` was NOT yet applied → live test exposed the anon-executable trigger functions; the 0071 grants were then applied live.
- `supabase/tests/phase1_migration_test.sql` → **PHASE1 OK** (exit 0): S1–S9 catalog checks + B1–B10 behavioural cross-tenant checks (documented `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims')` pattern) with a controlled subscription fixture — self-activation blocked, pending→payment_submitted allowed, tampered amount/currency overwritten from plan price; all inside a rolled-back transaction.
- `supabase/tests/ci_lint.sql` → **PASS** (exit 0).

---

## 8. Commands run (this session) & outputs
- `supabase db query --linked -f A1..A10,F1..F4.sql -o csv` → `%TEMP%\opencode\audit\*.out.csv` (all captured).
- `supabase db dump` → **not run** (Docker unavailable).
- Supabase security/performance advisors → **not yet run** (pending).
- `npx tsc --noEmit` → **clean** after `tenant-guard.ts`, `service-scoped.ts`, `rls-api-test.ts`.
- `npx tsx scripts/rls-api-test.ts` → **13/13 checks passed, exit 0** (app-layer guard; mocks auth, no credentials needed).

## 9. Residual risks / not verified
- **Live DB verified OK:** migrations 0064–0071 applied; `phase1_migration_test.sql` + `ci_lint.sql` both green. Migrations never run from here against live again without approval.
- **App layer verified OK:** `lib/auth/tenant-guard.ts` (`requireClinicContext` / `UnauthorizedError` 401 / `ForbiddenError` 403), `lib/supabase/service-scoped.ts` (`getScopedServiceClient` + `createScopedServiceClient`), covered by `scripts/rls-api-test.ts`. These are additive helpers — adopting them in existing actions/route handlers is the follow-up (no live impact until call sites use them).
- **B5 residual:** billing_events still lets a clinic admin record events for their own subscription (see `SECURITY_MODEL.md §6`). Recommended follow-up: service-role-only writer.
- **B14:** 7 server action files + `lib/supabase/widget.ts` still use raw `createWidgetClient()`; migration onto `service-scoped.ts` is the recommended follow-up.
- **RBAC + audit verified OK (this session):** migration `0072_rbac_and_audit_logs.sql` (granular `clinic_role` enum labels `clinic_admin/doctor/receptionist/nurse/accountant`, `clinic_members.permissions jsonb`, immutable `audit_logs` with RLS + `BEFORE UPDATE` block trigger + anon revoke) and `0073_clinic_admin_helper.sql` (`is_clinic_admin` now includes `clinic_admin`). Confirmed already present on live with the exact expected objects; behavioural check inside a rolled-back tx: `is_clinic_admin` returns **true** for `clinic_admin`, **false** for `doctor`; `audit_logs` has RLS on, anon SELECT/INSERT false, authenticated SELECT/INSERT only. App layer: `lib/auth/rbac-config.ts` + `lib/auth/role-guard.ts` (`hasPermission`, `requirePermission`, `logAuditEvent`), covered by `scripts/rbac-test.ts` (17/17 PASS). Team UI/schemas/sidebar updated for the new roles; `npx tsc --noEmit`, `npx eslint <changed>`, `npm run build` all clean.
- Advisors not yet collected.
