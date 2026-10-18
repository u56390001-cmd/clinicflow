-- =============================================================================
-- MedBook AI — Migration 0103 : Drug interaction rules
--
-- Gap #4 of the dermatology roadmap: the prescription surfaces (GP RxBuilder,
-- GP consultation form, dermatology Tab 4) had no rule-based safety area at
-- all — the only "safety warnings" anywhere in the product were the AI
-- copilot's free-form `safety_warnings`, which is not a governed clinical
-- rule set. Spec §8.4 asks for a safety/interaction area "sourced from actual
-- medication/allergy/risk services"; the allergy side is real patient data
-- (`patients.known_allergies` + the dermatology profile), so what was missing
-- was the rules side.
--
-- Design:
--   * `clinic_id is null` rows are the shared global rule set (seeded below).
--   * A clinic's own admin may add rules for its rows (`clinic_id` set).
--   * Each side (`drug_a`, `drug_b`) is a comma-separated list of name
--     fragments. The evaluator in `lib/prescription-safety.ts` matches each
--     fragment case-insensitively on word boundaries against the draft's
--     medicine names and fires a warning when two DIFFERENT draft rows match
--     the two sides (two rows requirement so a combination product such as
--     "Ibuprofen + Paracetamol" cannot interact with itself).
--
-- Seed provenance: every pair below is a well-established interaction carried
-- in standard drug references (SmPC/stockley-level, universally documented).
-- Messages state the risk only — no dosing advice is invented. Rules that
-- reference drugs outside this deployment's formulary (e.g. warfarin,
-- methotrexate) are kept: they fire only when such a drug is actually
-- prescribed, from the clinic catalogue or free text.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- table
-- ----------------------------------------------------------------------------
create table if not exists public.drug_interaction_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics (id) on delete cascade,
  drug_a text not null check (char_length(drug_a) between 1 and 500),
  drug_b text not null check (char_length(drug_b) between 1 and 500),
  severity text not null default 'moderate'
    check (severity in ('major', 'moderate')),
  message text not null check (char_length(message) between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drug_interaction_rules is
  'Drug-drug interaction warnings for the prescription safety panel. drug_a/drug_b are comma-separated name fragments matched case-insensitively on word boundaries against drafted medicine names; a warning fires when two different rows match the two sides. Global rows have clinic_id null; clinics may add their own.';

drop trigger if exists drug_interaction_rules_updated_at on public.drug_interaction_rules;
create trigger drug_interaction_rules_updated_at
  before update
  on public.drug_interaction_rules
  for each row
  execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- indexes: per-scope listing + re-runnable global seed
-- ----------------------------------------------------------------------------
create index if not exists drug_interaction_rules_clinic_idx
  on public.drug_interaction_rules (clinic_id);

create unique index if not exists drug_interaction_rules_global_key
  on public.drug_interaction_rules (drug_a, drug_b)
  where clinic_id is null;

-- ----------------------------------------------------------------------------
-- RLS: any clinic member may read rules (the safety panel runs on the
-- prescription screen every role can open); only clinic admins may add or
-- edit rules scoped to their own clinic; the global set is read-only.
-- ----------------------------------------------------------------------------
alter table public.drug_interaction_rules enable row level security;

drop policy if exists drug_interaction_rules_select on public.drug_interaction_rules;
create policy drug_interaction_rules_select
  on public.drug_interaction_rules
  for select
  to authenticated
  using (clinic_id is null or public.is_clinic_member(clinic_id));

drop policy if exists drug_interaction_rules_insert on public.drug_interaction_rules;
create policy drug_interaction_rules_insert
  on public.drug_interaction_rules
  for insert
  to authenticated
  with check (clinic_id is not null and public.is_clinic_admin(clinic_id));

drop policy if exists drug_interaction_rules_update on public.drug_interaction_rules;
create policy drug_interaction_rules_update
  on public.drug_interaction_rules
  for update
  to authenticated
  using (clinic_id is not null and public.is_clinic_admin(clinic_id))
  with check (clinic_id is not null and public.is_clinic_admin(clinic_id));

drop policy if exists drug_interaction_rules_delete on public.drug_interaction_rules;
create policy drug_interaction_rules_delete
  on public.drug_interaction_rules
  for delete
  to authenticated
  using (clinic_id is not null and public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- seed — global rules (re-runnable via the partial unique index)
-- ----------------------------------------------------------------------------

-- Retinoid + tetracycline: the dermatology combination that must not be
-- prescribed together without supervision.
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'isotretinoin', 'doxycycline, minocycline, tetracycline, demeclocycline', 'major',
   'Isotretinoin with a tetracycline-class antibiotic can cause intracranial hypertension — avoid the combination unless specifically supervised.')
on conflict do nothing;

-- Warfarin pairs: bleeding (NSAID/antiplatelet) and INR rise (CYP inhibitors).
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'warfarin', 'aspirin, ibuprofen, diclofenac, naproxen, aceclofenac, etoricoxib, celecoxib, clopidogrel', 'major',
   'Warfarin with an NSAID or antiplatelet markedly increases bleeding risk.'),
  (null, 'warfarin', 'metronidazole, erythromycin, ciprofloxacin, ofloxacin, clarithromycin, fluconazole', 'major',
   'These agents inhibit warfarin metabolism and can raise INR and bleeding risk.'),
  (null, 'methotrexate', 'ibuprofen, diclofenac, naproxen, aceclofenac, etoricoxib, celecoxib, aspirin', 'major',
   'NSAIDs reduce methotrexate clearance and can worsen methotrexate toxicity.')
on conflict do nothing;

-- Serotonergic pairs.
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'sertraline, escitalopram, fluoxetine, fluvoxamine, paroxetine', 'tramadol', 'moderate',
   'Tramadol with an SSRI adds serotonin-syndrome risk.'),
  (null, 'sertraline, escitalopram, fluoxetine, paroxetine', 'aspirin, ibuprofen, diclofenac, naproxen, aceclofenac, celecoxib, etoricoxib', 'moderate',
   'SSRIs together with NSAIDs or aspirin increase gastrointestinal bleeding risk.'),
  (null, 'tramadol', 'alprazolam, lorazepam, bromazepam, clonazepam, diazepam, midazolam', 'moderate',
   'Tramadol with a benzodiazepine increases sedation and respiratory-depression risk.')
on conflict do nothing;

-- Renin-angiotensin + potassium-sparing diuretic.
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'ramipril, enalapril, lisinopril, losartan, telmisartan, valsartan, candesartan, olmesartan', 'spironolactone', 'moderate',
   'An ACE inhibitor or ARB with spironolactone can raise potassium — check renal function and monitor.')
on conflict do nothing;

-- Statin + CYP3A4 inhibitors; amlodipine's simvastatin dose limit.
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'simvastatin, atorvastatin, lovastatin, pravastatin', 'erythromycin, clarithromycin, ketoconazole, itraconazole', 'major',
   'A statin with these enzyme inhibitors raises myopathy and rhabdomyolysis risk.'),
  (null, 'amlodipine', 'simvastatin', 'moderate',
   'Amlodipine increases simvastatin exposure — myopathy risk rises above the usual simvastatin dose limit.')
on conflict do nothing;

-- Absorption and activation pairs.
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null, 'levothyroxine', 'calcium carbonate, calcium, ferrous, iron, sucralfate', 'moderate',
   'Calcium, iron and sucralfate reduce levothyroxine absorption — separate the doses by several hours.'),
  (null, 'clopidogrel', 'omeprazole, esomeprazole', 'moderate',
   'Omeprazole and esomeprazole can reduce clopidogrel activation — consider an alternative acid suppressant.'),
  (null, 'carbamazepine', 'erythromycin, clarithromycin', 'moderate',
   'These inhibitors can raise carbamazepine levels — watch for toxicity signs.'),
  (null, 'ciprofloxacin', 'tizanidine', 'major',
   'Ciprofloxacin blocks tizanidine metabolism — profound hypotension and sedation can follow.')
on conflict do nothing;

-- Two NSAIDs together (both sides intentionally identical: any two distinct
-- draft rows whose names match the NSAID list trigger it).
insert into public.drug_interaction_rules
  (clinic_id, drug_a, drug_b, severity, message)
values
  (null,
   'ibuprofen, diclofenac, naproxen, aceclofenac, etoricoxib, celecoxib, aspirin, piroxicam, mefenamic',
   'ibuprofen, diclofenac, naproxen, aceclofenac, etoricoxib, celecoxib, aspirin, piroxicam, mefenamic',
   'major',
   'Two NSAIDs together substantially increase gastrointestinal and renal risk.')
on conflict do nothing;
