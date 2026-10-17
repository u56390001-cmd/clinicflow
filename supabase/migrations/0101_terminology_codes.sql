-- =============================================================================
-- MedBook AI — Migration 0101 : Coded terminology search (ICD-10-CM / SNOMED-CT)
--
-- Gap #1 of the dermatology roadmap: diagnosis fields previously accepted only
-- free text plus a hand-typed ICD code (`derm-diagnosis.tsx` COMMON_TERMS said
-- as much). This migration adds a real terminology table the workspace can
-- query:
--
--   * `clinic_id is null` rows are the shared global catalog (seeded below).
--   * A clinic's own admin may add custom codes for its rows (`clinic_id` set).
--   * `search_text` is a trigger-maintained lowercase haystack of
--     code + display + category + synonyms, indexed with pg_trgm for partial
--     matching (`ILIKE '%term%'`).
--
-- Seed provenance — every ICD-10-CM row below was verified against the NLM
-- Clinical Tables API (clinicaltables.nlm.nih.gov) and/or icd10data.com block
-- pages during implementation. No code/title pair is invented.
--
-- SNOMED-CT: the schema accepts `'SNOMED-CT'` in `code_system`, but the full
-- SNOMED CT concept catalog is licensed content (SNOMED International / UMLS
-- Affiliate License; the public Snowstorm + NLM endpoints reject anonymous
-- access). Only the single independently verified concept
-- (24079001 = Atopic dermatitis) is seeded. A licensed SNOMED import is a
-- reported gap, not something to fabricate.
-- =============================================================================

create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- table
-- ----------------------------------------------------------------------------
create table if not exists public.terminology_codes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics (id) on delete cascade,
  code_system text not null default 'ICD-10-CM'
    check (code_system in ('ICD-10-CM', 'SNOMED-CT')),
  code text not null check (char_length(code) between 1 and 24),
  display text not null check (char_length(display) between 1 and 300),
  category text,
  synonyms text[] not null default '{}'::text[],
  search_text text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.terminology_codes is
  'ICD-10-CM / SNOMED-CT reference codes. Global rows have clinic_id null; clinics may add custom codes.';

-- ----------------------------------------------------------------------------
-- search_text: maintained by trigger (array_to_string over text[] keeps this
-- out of generated-column immutable-expression territory).
-- ----------------------------------------------------------------------------
create or replace function public.terminology_codes_search_text()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.search_text := lower(
    new.code || ' ' ||
    new.display || ' ' ||
    coalesce(new.category, '') || ' ' ||
    array_to_string(coalesce(new.synonyms, '{}'::text[]), ' ')
  );
  return new;
end;
$$;

drop trigger if exists terminology_codes_search_text on public.terminology_codes;
create trigger terminology_codes_search_text
  before insert or update
  on public.terminology_codes
  for each row
  execute function public.terminology_codes_search_text();

drop trigger if exists terminology_codes_updated_at on public.terminology_codes;
create trigger terminology_codes_updated_at
  before update
  on public.terminology_codes
  for each row
  execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- indexes: trigram search + per-scope uniqueness of a code
-- ----------------------------------------------------------------------------
create index if not exists terminology_codes_search_idx
  on public.terminology_codes using gin (search_text gin_trgm_ops);

create unique index if not exists terminology_codes_global_code_key
  on public.terminology_codes (code_system, code)
  where clinic_id is null;

create unique index if not exists terminology_codes_clinic_code_key
  on public.terminology_codes (clinic_id, code_system, code)
  where clinic_id is not null;

-- ----------------------------------------------------------------------------
-- RLS: any clinic member may read reference data; only clinic admins may add
-- or edit codes scoped to their own clinic; the global catalog is read-only.
-- ----------------------------------------------------------------------------
alter table public.terminology_codes enable row level security;

drop policy if exists terminology_codes_select on public.terminology_codes;
create policy terminology_codes_select
  on public.terminology_codes
  for select
  to authenticated
  using (clinic_id is null or public.is_clinic_member(clinic_id));

drop policy if exists terminology_codes_insert on public.terminology_codes;
create policy terminology_codes_insert
  on public.terminology_codes
  for insert
  to authenticated
  with check (clinic_id is not null and public.is_clinic_admin(clinic_id));

drop policy if exists terminology_codes_update on public.terminology_codes;
create policy terminology_codes_update
  on public.terminology_codes
  for update
  to authenticated
  using (clinic_id is not null and public.is_clinic_admin(clinic_id))
  with check (clinic_id is not null and public.is_clinic_admin(clinic_id));

drop policy if exists terminology_codes_delete on public.terminology_codes;
create policy terminology_codes_delete
  on public.terminology_codes
  for delete
  to authenticated
  using (clinic_id is not null and public.is_clinic_admin(clinic_id));

-- ----------------------------------------------------------------------------
-- seed — global ICD-10-CM dermatology catalog (verified; re-runnable)
-- ----------------------------------------------------------------------------

-- L00–L08 — skin infections
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L00', 'Staphylococcal scalded skin syndrome', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01', 'Impetigo', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.00', 'Impetigo, unspecified', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.01', 'Non-bullous impetigo', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.02', 'Bockhart''s impetigo', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.03', 'Bullous impetigo', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.09', 'Other impetigo', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L01.1', 'Impetiginization of other dermatoses', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L02', 'Cutaneous abscess, furuncle and carbuncle', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L03', 'Cellulitis and acute lymphangitis', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L03.3', 'Cellulitis and acute lymphangitis of trunk', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L03.9', 'Cellulitis and acute lymphangitis, unspecified', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04', 'Acute lymphadenitis', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.0', 'Acute lymphadenitis of face, head and neck', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.1', 'Acute lymphadenitis of trunk', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.2', 'Acute lymphadenitis of upper limb', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.3', 'Acute lymphadenitis of lower limb', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.8', 'Acute lymphadenitis of other sites', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L04.9', 'Acute lymphadenitis, unspecified', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L05', 'Pilonidal cyst and sinus', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L05.0', 'Pilonidal cyst and sinus with abscess', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L05.9', 'Pilonidal cyst and sinus without abscess', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L08', 'Other local infections of skin and subcutaneous tissue', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L08.0', 'Pyoderma', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L08.1', 'Erythrasma', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L08.8', 'Other specified local infections of the skin and subcutaneous tissue', 'Skin infections', '{}'),
  (null, 'ICD-10-CM', 'L08.9', 'Local infection of the skin and subcutaneous tissue, unspecified', 'Skin infections', '{}')
on conflict do nothing;

-- L10–L14 — bullous disorders
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L10', 'Pemphigus', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.0', 'Pemphigus vulgaris', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.1', 'Pemphigus vegetans', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.2', 'Pemphigus foliaceous', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.3', 'Brazilian pemphigus [fogo selvagem]', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.4', 'Pemphigus erythematosus', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.5', 'Drug-induced pemphigus', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.8', 'Other pemphigus', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L10.9', 'Pemphigus, unspecified', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L11', 'Other acantholytic disorders', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L11.0', 'Acquired keratosis follicularis', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L11.1', 'Transient acantholytic dermatosis [Grover]', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L11.8', 'Other specified acantholytic disorders', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L11.9', 'Acantholytic disorder, unspecified', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12', 'Pemphigoid', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.0', 'Bullous pemphigoid', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.1', 'Cicatricial pemphigoid', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.2', 'Chronic bullous disease of childhood', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.3', 'Acquired epidermolysis bullosa', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.8', 'Other pemphigoid', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L12.9', 'Pemphigoid, unspecified', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L13', 'Other bullous disorders', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L13.0', 'Dermatitis herpetiformis', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L13.1', 'Subcorneal pustular dermatitis', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L13.8', 'Other specified bullous disorders', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L13.9', 'Bullous disorder, unspecified', 'Bullous disorders', '{}'),
  (null, 'ICD-10-CM', 'L14', 'Bullous disorders in diseases classified elsewhere', 'Bullous disorders', '{}')
on conflict do nothing;

-- L20–L30 — dermatitis and eczema
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L20', 'Atopic dermatitis', 'Dermatitis and eczema', array['eczema', 'atopic eczema']),
  (null, 'ICD-10-CM', 'L20.0', 'Besnier''s prurigo', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L20.8', 'Other atopic dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis and eczema', array['atopic eczema']),
  (null, 'ICD-10-CM', 'L21', 'Seborrheic dermatitis', 'Dermatitis and eczema', array['seb derm']),
  (null, 'ICD-10-CM', 'L21.0', 'Seborrhea capitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L21.1', 'Seborrheic infantile dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L21.8', 'Other seborrheic dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L21.9', 'Seborrheic dermatitis, unspecified', 'Dermatitis and eczema', array['seborrhoeic dermatitis']),
  (null, 'ICD-10-CM', 'L22', 'Diaper dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23', 'Allergic contact dermatitis', 'Dermatitis and eczema', array['allergic eczema']),
  (null, 'ICD-10-CM', 'L23.0', 'Allergic contact dermatitis due to metals', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.1', 'Allergic contact dermatitis due to adhesives', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.2', 'Allergic contact dermatitis due to cosmetics', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.3', 'Allergic contact dermatitis due to drugs in contact with skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.4', 'Allergic contact dermatitis due to dyes', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.5', 'Allergic contact dermatitis due to other chemical products', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.6', 'Allergic contact dermatitis due to food in contact with the skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.7', 'Allergic contact dermatitis due to plants, except food', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.8', 'Allergic contact dermatitis due to other agents', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24', 'Irritant contact dermatitis', 'Dermatitis and eczema', array['irritant eczema']),
  (null, 'ICD-10-CM', 'L24.0', 'Irritant contact dermatitis due to detergents', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.1', 'Irritant contact dermatitis due to oils and greases', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.2', 'Irritant contact dermatitis due to solvents', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.3', 'Irritant contact dermatitis due to cosmetics', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.4', 'Irritant contact dermatitis due to drugs in contact with skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.5', 'Irritant contact dermatitis due to other chemical products', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.6', 'Irritant contact dermatitis due to food in contact with skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.7', 'Irritant contact dermatitis due to plants, except food', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.8', 'Irritant contact dermatitis due to other agents', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.9', 'Irritant contact dermatitis, unspecified cause', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.A0', 'Irritant contact dermatitis due to friction or contact with body fluids, unspecified', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.A1', 'Irritant contact dermatitis due to saliva', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L24.A2', 'Irritant contact dermatitis due to fecal, urinary or dual incontinence', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25', 'Unspecified contact dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.0', 'Unspecified contact dermatitis due to cosmetics', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.1', 'Unspecified contact dermatitis due to drugs in contact with skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.2', 'Unspecified contact dermatitis due to dyes', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.3', 'Unspecified contact dermatitis due to other chemical products', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.4', 'Unspecified contact dermatitis due to food in contact with skin', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.5', 'Unspecified contact dermatitis due to plants, except food', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.8', 'Unspecified contact dermatitis due to other agents', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L25.9', 'Unspecified contact dermatitis, unspecified cause', 'Dermatitis and eczema', array['contact dermatitis', 'contact eczema']),
  (null, 'ICD-10-CM', 'L26', 'Exfoliative dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L27', 'Dermatitis due to substances taken internally', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L27.0', 'Generalized skin eruption due to drugs and medicaments taken internally', 'Dermatitis and eczema', array['drug rash']),
  (null, 'ICD-10-CM', 'L27.1', 'Localized skin eruption due to drugs and medicaments taken internally', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L27.2', 'Dermatitis due to ingested food', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L27.8', 'Dermatitis due to other substances taken internally', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L27.9', 'Dermatitis due to unspecified substance taken internally', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L28', 'Lichen simplex chronicus and prurigo', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L28.0', 'Lichen simplex chronicus', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L28.1', 'Prurigo nodularis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L28.2', 'Other prurigo', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29', 'Pruritus', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.0', 'Pruritus ani', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.1', 'Pruritus scroti', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.2', 'Pruritus vulvae', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.3', 'Anogenital pruritus, unspecified', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.8', 'Other pruritus', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L29.9', 'Pruritus, unspecified', 'Dermatitis and eczema', array['itching']),
  (null, 'ICD-10-CM', 'L30', 'Other and unspecified dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.0', 'Nummular dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.1', 'Dyshidrosis [pompholyx]', 'Dermatitis and eczema', array['pompholyx', 'dyshidrotic eczema']),
  (null, 'ICD-10-CM', 'L30.2', 'Cutaneous autosensitization', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.3', 'Infective dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.4', 'Erythema intertrigo', 'Dermatitis and eczema', array['intertrigo']),
  (null, 'ICD-10-CM', 'L30.5', 'Pityriasis alba', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.8', 'Other specified dermatitis', 'Dermatitis and eczema', '{}'),
  (null, 'ICD-10-CM', 'L30.9', 'Dermatitis, unspecified', 'Dermatitis and eczema', '{}')
on conflict do nothing;

-- L40–L45 — papulosquamous disorders
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L40', 'Psoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.0', 'Psoriasis vulgaris', 'Papulosquamous disorders', array['plaque psoriasis']),
  (null, 'ICD-10-CM', 'L40.1', 'Generalized pustular psoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.2', 'Acrodermatitis continua', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.3', 'Pustulosis palmaris et plantaris', 'Papulosquamous disorders', array['palmoplantar pustulosis']),
  (null, 'ICD-10-CM', 'L40.4', 'Guttate psoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.5', 'Arthropathic psoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.8', 'Other psoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L40.9', 'Psoriasis, unspecified', 'Papulosquamous disorders', array['psoriatic']),
  (null, 'ICD-10-CM', 'L41', 'Parapsoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.0', 'Pityriasis lichenoides et varioliformis acuta', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.1', 'Pityriasis lichenoides chronica', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.3', 'Small plaque parapsoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.4', 'Large plaque parapsoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.5', 'Retiform parapsoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.8', 'Other parapsoriasis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L41.9', 'Parapsoriasis, unspecified', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L42', 'Pityriasis rosea', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43', 'Lichen planus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.0', 'Hypertrophic lichen planus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.1', 'Bullous lichen planus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.2', 'Lichenoid drug reaction', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.3', 'Subacute (active) lichen planus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.8', 'Other lichen planus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L43.9', 'Lichen planus, unspecified', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44', 'Other papulosquamous disorders', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.0', 'Pityriasis rubra pilaris', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.1', 'Lichen nitidus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.2', 'Lichen striatus', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.3', 'Lichen ruber moniliformis', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.4', 'Infantile papular acrodermatitis [Gianotti-Crosti]', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.8', 'Other specified papulosquamous disorders', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L44.9', 'Papulosquamous disorder, unspecified', 'Papulosquamous disorders', '{}'),
  (null, 'ICD-10-CM', 'L45', 'Papulosquamous disorders in diseases classified elsewhere', 'Papulosquamous disorders', '{}')
on conflict do nothing;

-- L49–L54 — urticaria and erythema
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L49', 'Exfoliation due to erythematous conditions according to extent of body surface involved', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.0', 'Exfoliation due to erythematous condition involving less than 10 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.1', 'Exfoliation due to erythematous condition involving 10-19 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.2', 'Exfoliation due to erythematous condition involving 20-29 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.3', 'Exfoliation due to erythematous condition involving 30-39 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.4', 'Exfoliation due to erythematous condition involving 40-49 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.5', 'Exfoliation due to erythematous condition involving 50-59 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.6', 'Exfoliation due to erythematous condition involving 60-69 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.7', 'Exfoliation due to erythematous condition involving 70-79 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.8', 'Exfoliation due to erythematous condition involving 80-89 percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L49.9', 'Exfoliation due to erythematous condition involving 90 or more percent of body surface', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50', 'Urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.0', 'Allergic urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.1', 'Idiopathic urticaria', 'Urticaria and erythema', array['chronic urticaria']),
  (null, 'ICD-10-CM', 'L50.2', 'Urticaria due to cold and heat', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.3', 'Dermatographic urticaria', 'Urticaria and erythema', array['dermatographism']),
  (null, 'ICD-10-CM', 'L50.4', 'Vibratory urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.5', 'Cholinergic urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.6', 'Contact urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.8', 'Other urticaria', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L50.9', 'Urticaria, unspecified', 'Urticaria and erythema', array['hives']),
  (null, 'ICD-10-CM', 'L51', 'Erythema multiforme', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.0', 'Nonbullous erythema multiforme', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.1', 'Stevens-Johnson syndrome', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.2', 'Toxic epidermal necrolysis [Lyell]', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.3', 'Stevens-Johnson syndrome-toxic epidermal necrolysis overlap', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.8', 'Other erythema multiforme', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L51.9', 'Erythema multiforme, unspecified', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L52', 'Erythema nodosum', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53', 'Other erythematous conditions', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.0', 'Toxic erythema', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.1', 'Erythema annulare centrifugum', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.2', 'Erythema marginatum', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.3', 'Other chronic figurate erythema', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.8', 'Other specified erythematous conditions', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L53.9', 'Erythematous condition, unspecified', 'Urticaria and erythema', '{}'),
  (null, 'ICD-10-CM', 'L54', 'Erythema in diseases classified elsewhere', 'Urticaria and erythema', '{}')
on conflict do nothing;

-- L55–L59 — radiation-related skin changes
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L55', 'Sunburn', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L55.0', 'Sunburn of first degree', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L55.1', 'Sunburn of second degree', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L55.2', 'Sunburn of third degree', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L55.9', 'Sunburn, unspecified', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56', 'Other acute skin changes due to ultraviolet radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.0', 'Drug phototoxic response', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.1', 'Drug photoallergic response', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.2', 'Photocontact dermatitis [berloque dermatitis]', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.3', 'Solar urticaria', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.4', 'Polymorphous light eruption', 'Radiation-related skin changes', array['PMLE']),
  (null, 'ICD-10-CM', 'L56.5', 'Disseminated superficial actinic porokeratosis (DSAP)', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.8', 'Other specified acute skin changes due to ultraviolet radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L56.9', 'Acute skin change due to ultraviolet radiation, unspecified', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57', 'Skin changes due to chronic exposure to nonionizing radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.0', 'Actinic keratosis', 'Radiation-related skin changes', array['solar keratosis']),
  (null, 'ICD-10-CM', 'L57.1', 'Actinic reticuloid', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.2', 'Cutis rhomboidalis nuchae', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.3', 'Poikiloderma of Civatte', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.4', 'Cutis laxa senilis', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.5', 'Actinic granuloma', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.8', 'Other skin changes due to chronic exposure to nonionizing radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L57.9', 'Skin changes due to chronic exposure to nonionizing radiation, unspecified', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L58', 'Radiodermatitis', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L58.0', 'Acute radiodermatitis', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L58.1', 'Chronic radiodermatitis', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L58.9', 'Radiodermatitis, unspecified', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L59', 'Other disorders of skin and subcutaneous tissue related to radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L59.0', 'Erythema ab igne [dermatitis ab igne]', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L59.8', 'Other specified disorders of the skin and subcutaneous tissue related to radiation', 'Radiation-related skin changes', '{}'),
  (null, 'ICD-10-CM', 'L59.9', 'Disorder of the skin and subcutaneous tissue related to radiation, unspecified', 'Radiation-related skin changes', '{}')
on conflict do nothing;

-- L60–L75 — skin appendages (nails, hair, sweat glands)
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L60', 'Nail disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.0', 'Ingrowing nail', 'Skin appendage disorders', array['ingrown nail', 'ingrowing toenail']),
  (null, 'ICD-10-CM', 'L60.1', 'Onycholysis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.2', 'Onychogryphosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.3', 'Nail dystrophy', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.4', 'Beau''s lines', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.5', 'Yellow nail syndrome', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.8', 'Other nail disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L60.9', 'Nail disorder, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L62', 'Nail disorders in diseases classified elsewhere', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63', 'Alopecia areata', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63.0', 'Alopecia (capitis) totalis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63.1', 'Alopecia universalis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63.2', 'Ophiasis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63.8', 'Other alopecia areata', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L63.9', 'Alopecia areata, unspecified', 'Skin appendage disorders', array['patchy hair loss']),
  (null, 'ICD-10-CM', 'L64', 'Androgenic alopecia', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L64.0', 'Drug-induced androgenic alopecia', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L64.8', 'Other androgenic alopecia', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L64.9', 'Androgenic alopecia, unspecified', 'Skin appendage disorders', array['male pattern baldness', 'androgenetic alopecia']),
  (null, 'ICD-10-CM', 'L65', 'Other nonscarring hair loss', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L65.0', 'Telogen effluvium', 'Skin appendage disorders', array['hair fall']),
  (null, 'ICD-10-CM', 'L65.1', 'Anagen effluvium', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L65.2', 'Alopecia mucinosa', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L65.8', 'Other specified nonscarring hair loss', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L65.9', 'Nonscarring hair loss, unspecified', 'Skin appendage disorders', array['hair loss']),
  (null, 'ICD-10-CM', 'L66', 'Cicatricial alopecia [scarring hair loss]', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.0', 'Pseudopelade', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.1', 'Lichen planopilaris', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.2', 'Folliculitis decalvans', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.3', 'Perifolliculitis capitis abscedens', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.4', 'Folliculitis ulerythematosa reticulata', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.8', 'Other cicatricial alopecia', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L66.9', 'Cicatricial alopecia, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L67', 'Hair color and hair shaft abnormalities', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L67.0', 'Trichorrhexis nodosa', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L67.1', 'Variations in hair color', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L67.8', 'Other hair color and hair shaft abnormalities', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L67.9', 'Hair color and hair shaft abnormality, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68', 'Hypertrichosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.0', 'Hirsutism', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.1', 'Acquired hypertrichosis lanuginosa', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.2', 'Localized hypertrichosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.3', 'Polytrichia', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.8', 'Other hypertrichosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L68.9', 'Hypertrichosis, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70', 'Acne', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.0', 'Acne vulgaris', 'Skin appendage disorders', array['acne', 'pimples']),
  (null, 'ICD-10-CM', 'L70.1', 'Acne conglobata', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.2', 'Acne varioliformis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.3', 'Acne tropica', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.4', 'Infantile acne', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.5', 'Acné excoriée', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.8', 'Other acne', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L70.9', 'Acne, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L71', 'Rosacea', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L71.0', 'Perioral dermatitis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L71.1', 'Rhinophyma', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L71.8', 'Other rosacea', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L71.9', 'Rosacea, unspecified', 'Skin appendage disorders', array['acne rosacea']),
  (null, 'ICD-10-CM', 'L72', 'Follicular cysts of skin and subcutaneous tissue', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L72.0', 'Epidermal cyst', 'Skin appendage disorders', array['epidermoid cyst']),
  (null, 'ICD-10-CM', 'L72.1', 'Pilar and trichodermal cyst', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L72.2', 'Steatocystoma multiplex', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L72.3', 'Sebaceous cyst', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L72.8', 'Other follicular cysts of the skin and subcutaneous tissue', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L72.9', 'Follicular cyst of the skin and subcutaneous tissue, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L73', 'Other follicular disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L73.0', 'Acne keloid', 'Skin appendage disorders', array['acne keloidalis']),
  (null, 'ICD-10-CM', 'L73.1', 'Pseudofolliculitis barbae', 'Skin appendage disorders', array['razor bumps']),
  (null, 'ICD-10-CM', 'L73.2', 'Hidradenitis suppurativa', 'Skin appendage disorders', array['hidradenitis', 'HS']),
  (null, 'ICD-10-CM', 'L73.8', 'Other specified follicular disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L73.9', 'Follicular disorder, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74', 'Eccrine sweat disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.0', 'Miliaria rubra', 'Skin appendage disorders', array['heat rash', 'prickly heat']),
  (null, 'ICD-10-CM', 'L74.1', 'Miliaria crystallina', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.2', 'Miliaria profunda', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.3', 'Miliaria, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.4', 'Anhidrosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.5', 'Focal hyperhidrosis', 'Skin appendage disorders', array['excessive sweating']),
  (null, 'ICD-10-CM', 'L74.8', 'Other eccrine sweat disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L74.9', 'Eccrine sweat disorder, unspecified', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75', 'Apocrine sweat disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75.0', 'Bromhidrosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75.1', 'Chromhidrosis', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75.2', 'Apocrine miliaria', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75.8', 'Other apocrine sweat disorders', 'Skin appendage disorders', '{}'),
  (null, 'ICD-10-CM', 'L75.9', 'Apocrine sweat disorder, unspecified', 'Skin appendage disorders', '{}')
on conflict do nothing;

-- L80–L99 — other disorders of skin and subcutaneous tissue
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'L80', 'Vitiligo', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81', 'Other disorders of pigmentation', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.0', 'Postinflammatory hyperpigmentation', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.1', 'Chloasma', 'Other skin disorders', array['melasma']),
  (null, 'ICD-10-CM', 'L81.2', 'Freckles', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.3', 'Café au lait spots', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.4', 'Other melanin hyperpigmentation', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.5', 'Leukoderma, not elsewhere classified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.6', 'Other disorders of diminished melanin formation', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.7', 'Pigmented purpuric dermatosis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.8', 'Other specified disorders of pigmentation', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L81.9', 'Disorder of pigmentation, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L82', 'Seborrheic keratosis', 'Other skin disorders', array['seborrhoeic keratosis']),
  (null, 'ICD-10-CM', 'L82.0', 'Inflamed seborrheic keratosis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L82.1', 'Other seborrheic keratosis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L83', 'Acanthosis nigricans', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L84', 'Corns and callosities', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85', 'Other epidermal thickening', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85.0', 'Acquired ichthyosis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85.1', 'Acquired keratosis [keratoderma] palmaris et plantaris', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85.2', 'Keratosis punctata (palmaris et plantaris)', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85.3', 'Xerosis cutis', 'Other skin disorders', array['dry skin']),
  (null, 'ICD-10-CM', 'L85.8', 'Other specified epidermal thickening', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L85.9', 'Epidermal thickening, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L86', 'Keratoderma in diseases classified elsewhere', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87', 'Transepidermal elimination disorders', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87.0', 'Keratosis follicularis et parafollicularis in cutem penetrans', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87.1', 'Reactive perforating collagenosis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87.2', 'Elastosis perforans serpiginosa', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87.8', 'Other transepidermal elimination disorders', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L87.9', 'Transepidermal elimination disorder, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L88', 'Pyoderma gangrenosum', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L89', 'Pressure ulcer', 'Other skin disorders', array['bedsore', 'decubitus ulcer']),
  (null, 'ICD-10-CM', 'L90', 'Atrophic disorders of skin', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.0', 'Lichen sclerosus et atrophicus', 'Other skin disorders', array['lichen sclerosus']),
  (null, 'ICD-10-CM', 'L90.1', 'Anetoderma of Schweninger-Buzzi', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.2', 'Anetoderma of Jadassohn-Pellizzari', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.3', 'Atrophoderma of Pasini and Pierini', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.4', 'Acrodermatitis chronica atrophicans', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.5', 'Scar conditions and fibrosis of skin', 'Other skin disorders', array['scar']),
  (null, 'ICD-10-CM', 'L90.6', 'Striae atrophicae', 'Other skin disorders', array['stretch marks']),
  (null, 'ICD-10-CM', 'L90.8', 'Other atrophic disorders of skin', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L90.9', 'Atrophic disorder of skin, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L91', 'Hypertrophic disorders of skin', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L91.0', 'Hypertrophic scar', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L91.8', 'Other hypertrophic disorders of the skin', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L91.9', 'Hypertrophic disorder of the skin, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92', 'Granulomatous disorders of skin and subcutaneous tissue', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.0', 'Granuloma annulare', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.1', 'Necrobiosis lipoidica, not elsewhere classified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.2', 'Granuloma faciale [eosinophilic granuloma of skin]', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.3', 'Foreign body granuloma of the skin and subcutaneous tissue', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.8', 'Other granulomatous disorders of the skin and subcutaneous tissue', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L92.9', 'Granulomatous disorder of the skin and subcutaneous tissue, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L93', 'Lupus erythematosus', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L93.0', 'Discoid lupus erythematosus', 'Other skin disorders', array['DLE']),
  (null, 'ICD-10-CM', 'L93.1', 'Subacute cutaneous lupus erythematosus', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L93.2', 'Other local lupus erythematosus', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94', 'Other localized connective tissue disorders', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.0', 'Localized scleroderma [morphea]', 'Other skin disorders', array['morphea']),
  (null, 'ICD-10-CM', 'L94.1', 'Linear scleroderma', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.2', 'Calcinosis cutis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.3', 'Sclerodactyly', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.4', 'Gottron''s papules', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.5', 'Poikiloderma vasculare atrophicans', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.6', 'Ainhum', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.8', 'Other specified localized connective tissue disorders', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L94.9', 'Localized connective tissue disorder, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L95', 'Vasculitis limited to the skin, not elsewhere classified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L95.0', 'Livedoid vasculitis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L95.1', 'Erythema elevatum diutinum', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L95.8', 'Other vasculitis limited to the skin', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L95.9', 'Vasculitis limited to the skin, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L97', 'Non-pressure chronic ulcer of lower limb, not elsewhere classified', 'Other skin disorders', array['leg ulcer']),
  (null, 'ICD-10-CM', 'L98', 'Other disorders of skin and subcutaneous tissue', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.0', 'Pyogenic granuloma', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.1', 'Factitial dermatitis', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.2', 'Febrile neutrophilic dermatosis [Sweet]', 'Other skin disorders', array['Sweet syndrome']),
  (null, 'ICD-10-CM', 'L98.3', 'Eosinophilic cellulitis [Wells]', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.4', 'Non-pressure chronic ulcer of skin, not elsewhere classified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.A', 'Non-pressure chronic ulcer of upper limb, not elsewhere classified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.8', 'Other specified disorders of the skin and subcutaneous tissue', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L98.9', 'Disorder of the skin and subcutaneous tissue, unspecified', 'Other skin disorders', '{}'),
  (null, 'ICD-10-CM', 'L99', 'Other disorders of skin and subcutaneous tissue in diseases classified elsewhere', 'Other skin disorders', '{}')
on conflict do nothing;

-- B00–B08 — viral skin infections
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'B00', 'Herpesviral [herpes simplex] infections', 'Viral skin infections', array['cold sore', 'herpes simplex']),
  (null, 'ICD-10-CM', 'B00.0', 'Eczema herpeticum', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.1', 'Herpesviral vesicular dermatitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.2', 'Herpesviral gingivostomatitis and pharyngotonsillitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.3', 'Herpesviral meningitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.4', 'Herpesviral encephalitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.5', 'Herpesviral ocular disease', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.7', 'Disseminated herpesviral disease', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.8', 'Other forms of herpesviral infections', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B00.9', 'Herpesviral infection, unspecified', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02', 'Zoster [herpes zoster]', 'Viral skin infections', array['shingles']),
  (null, 'ICD-10-CM', 'B02.0', 'Zoster encephalitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.1', 'Zoster meningitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.2', 'Zoster with other nervous system involvement', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.3', 'Zoster ocular disease', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.7', 'Disseminated zoster', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.8', 'Zoster with other complications', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B02.9', 'Zoster without complications', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B07', 'Viral warts', 'Viral skin infections', array['warts', 'verruca']),
  (null, 'ICD-10-CM', 'B07.0', 'Plantar wart', 'Viral skin infections', array['verruca plantaris']),
  (null, 'ICD-10-CM', 'B07.8', 'Other viral warts', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B07.9', 'Viral wart, unspecified', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08', 'Other viral infections characterized by skin and mucous membrane lesions, not elsewhere classified', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.0', 'Other orthopoxvirus infections', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.1', 'Molluscum contagiosum', 'Viral skin infections', array['molluscum']),
  (null, 'ICD-10-CM', 'B08.2', 'Exanthema subitum [sixth disease]', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.3', 'Erythema infectiosum [fifth disease]', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.4', 'Enteroviral vesicular stomatitis with exanthem', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.5', 'Enteroviral vesicular pharyngitis', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.6', 'Parapoxvirus infections', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.7', 'Yatapoxvirus infections', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B08.8', 'Other specified viral infections characterized by skin and mucous membrane lesions', 'Viral skin infections', '{}'),
  (null, 'ICD-10-CM', 'B09', 'Unspecified viral infection characterized by skin and mucous membrane lesions', 'Viral skin infections', '{}')
on conflict do nothing;

-- B35–B37, deep cutaneous mycoses — fungal infections
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'B35', 'Dermatophytosis', 'Fungal skin infections', array['ringworm']),
  (null, 'ICD-10-CM', 'B35.0', 'Tinea barbae and tinea capitis', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B35.1', 'Tinea unguium', 'Fungal skin infections', array['nail fungus']),
  (null, 'ICD-10-CM', 'B35.2', 'Tinea manuum', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B35.3', 'Tinea pedis', 'Fungal skin infections', array['athlete''s foot', 'athlete foot']),
  (null, 'ICD-10-CM', 'B35.4', 'Tinea corporis', 'Fungal skin infections', array['ringworm']),
  (null, 'ICD-10-CM', 'B35.5', 'Tinea imbricata', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B35.6', 'Tinea cruris', 'Fungal skin infections', array['jock itch']),
  (null, 'ICD-10-CM', 'B35.8', 'Other dermatophytoses', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B35.9', 'Dermatophytosis, unspecified', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36', 'Other superficial mycoses', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36.0', 'Pityriasis versicolor', 'Fungal skin infections', array['tinea versicolor']),
  (null, 'ICD-10-CM', 'B36.1', 'Tinea nigra', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36.2', 'White piedra', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36.3', 'Black piedra', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36.8', 'Other specified superficial mycoses', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B36.9', 'Superficial mycosis, unspecified', 'Fungal skin infections', '{}'),
  (null, 'ICD-10-CM', 'B37.2', 'Candidiasis of skin and nail', 'Fungal skin infections', array['candida', 'yeast infection']),
  (null, 'ICD-10-CM', 'B42.1', 'Lymphocutaneous sporotrichosis', 'Deep fungal infections', '{}'),
  (null, 'ICD-10-CM', 'B43.0', 'Cutaneous chromomycosis', 'Deep fungal infections', '{}'),
  (null, 'ICD-10-CM', 'B45.2', 'Cutaneous cryptococcosis', 'Deep fungal infections', '{}'),
  (null, 'ICD-10-CM', 'B46.3', 'Cutaneous mucormycosis', 'Deep fungal infections', '{}')
on conflict do nothing;

-- B85–B86 — infestations
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'B85', 'Pediculosis and phthiriasis', 'Infestations', array['lice', 'lice infestation']),
  (null, 'ICD-10-CM', 'B85.0', 'Pediculosis due to Pediculus humanus capitis', 'Infestations', array['head lice']),
  (null, 'ICD-10-CM', 'B85.1', 'Pediculosis due to Pediculus humanus corporis', 'Infestations', array['body lice']),
  (null, 'ICD-10-CM', 'B85.2', 'Pediculosis, unspecified', 'Infestations', '{}'),
  (null, 'ICD-10-CM', 'B85.3', 'Phthiriasis', 'Infestations', array['crabs']),
  (null, 'ICD-10-CM', 'B85.4', 'Mixed pediculosis and phthiriasis', 'Infestations', '{}'),
  (null, 'ICD-10-CM', 'B86', 'Scabies', 'Infestations', '{}')
on conflict do nothing;

-- C43 / C4A / C44 — malignant skin neoplasms
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'C43', 'Malignant melanoma of skin', 'Malignant skin neoplasms', array['melanoma']),
  (null, 'ICD-10-CM', 'C43.0', 'Malignant melanoma of lip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.1', 'Malignant melanoma of eyelid, including canthus', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.2', 'Malignant melanoma of ear and external auricular canal', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.3', 'Malignant melanoma of other and unspecified parts of face', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.4', 'Malignant melanoma of scalp and neck', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.5', 'Malignant melanoma of trunk', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.6', 'Malignant melanoma of upper limb, including shoulder', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.7', 'Malignant melanoma of lower limb, including hip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.8', 'Malignant melanoma of overlapping sites of skin', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C43.9', 'Malignant melanoma of skin, unspecified', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A', 'Merkel cell carcinoma', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.0', 'Merkel cell carcinoma of lip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.1', 'Merkel cell carcinoma of eyelid, including canthus', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.2', 'Merkel cell carcinoma of ear and external auricular canal', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.3', 'Merkel cell carcinoma of other and unspecified parts of face', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.4', 'Merkel cell carcinoma of scalp and neck', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.5', 'Merkel cell carcinoma of trunk', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.6', 'Merkel cell carcinoma of upper limb, including shoulder', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.7', 'Merkel cell carcinoma of lower limb, including hip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.8', 'Merkel cell carcinoma of overlapping sites', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C4A.9', 'Merkel cell carcinoma, unspecified', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44', 'Other and unspecified malignant neoplasm of skin', 'Malignant skin neoplasms', array['skin cancer']),
  (null, 'ICD-10-CM', 'C44.0', 'Other and unspecified malignant neoplasm of skin of lip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.1', 'Other and unspecified malignant neoplasm of skin of eyelid, including canthus', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.2', 'Other and unspecified malignant neoplasm of skin of ear and external auricular canal', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.3', 'Other and unspecified malignant neoplasm of skin of other and unspecified parts of face', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.4', 'Other and unspecified malignant neoplasm of skin of scalp and neck', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.5', 'Other and unspecified malignant neoplasm of skin of trunk', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.6', 'Other and unspecified malignant neoplasm of skin of upper limb, including shoulder', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.7', 'Other and unspecified malignant neoplasm of skin of lower limb, including hip', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.8', 'Other and unspecified malignant neoplasm of overlapping sites of skin', 'Malignant skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'C44.9', 'Other and unspecified malignant neoplasm of skin, unspecified', 'Malignant skin neoplasms', '{}')
on conflict do nothing;

-- D22 / D23 — melanocytic nevi and other benign skin neoplasms
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'ICD-10-CM', 'D22', 'Melanocytic nevi', 'Benign skin neoplasms', array['moles', 'mole']),
  (null, 'ICD-10-CM', 'D22.0', 'Melanocytic nevi of lip', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.1', 'Melanocytic nevi of eyelid, including canthus', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.2', 'Melanocytic nevi of ear and external auricular canal', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.3', 'Melanocytic nevi of other and unspecified parts of face', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.4', 'Melanocytic nevi of scalp and neck', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.5', 'Melanocytic nevi of trunk', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.6', 'Melanocytic nevi of upper limb, including shoulder', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.7', 'Melanocytic nevi of lower limb, including hip', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D22.9', 'Melanocytic nevi, unspecified', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23', 'Other benign neoplasms of skin', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.0', 'Other benign neoplasm of skin of lip', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.1', 'Other benign neoplasm of skin of eyelid, including canthus', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.2', 'Other benign neoplasm of skin of ear and external auricular canal', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.3', 'Other benign neoplasm of skin of other and unspecified parts of face', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.4', 'Other benign neoplasm of skin of scalp and neck', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.5', 'Other benign neoplasm of skin of trunk', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.6', 'Other benign neoplasm of skin of upper limb, including shoulder', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.7', 'Other benign neoplasm of skin of lower limb, including hip', 'Benign skin neoplasms', '{}'),
  (null, 'ICD-10-CM', 'D23.9', 'Other benign neoplasm of skin, unspecified', 'Benign skin neoplasms', '{}')
on conflict do nothing;

-- SNOMED-CT — single independently verified concept (24079001).
-- Full SNOMED import requires a SNOMED International / UMLS Affiliate License
-- and is reported as an open gap rather than faked with unverified IDs.
insert into public.terminology_codes
  (clinic_id, code_system, code, display, category, synonyms)
values
  (null, 'SNOMED-CT', '24079001', 'Atopic dermatitis', 'Dermatitis and eczema', array['atopic dermatitis', 'atopic eczema'])
on conflict do nothing;

notify pgrst, 'reload schema';

-- ROLLBACK
-- ----------------------------------------------------------------------------
-- drop trigger if exists terminology_codes_search_text on public.terminology_codes;
-- drop trigger if exists terminology_codes_updated_at on public.terminology_codes;
-- drop function if exists public.terminology_codes_search_text();
-- drop policy if exists terminology_codes_select on public.terminology_codes;
-- drop policy if exists terminology_codes_insert on public.terminology_codes;
-- drop policy if exists terminology_codes_update on public.terminology_codes;
-- drop policy if exists terminology_codes_delete on public.terminology_codes;
-- drop index if exists terminology_codes_search_idx;
-- drop index if exists terminology_codes_global_code_key;
-- drop index if exists terminology_codes_clinic_code_key;
-- drop table if exists public.terminology_codes;  -- also removes the seeded catalog
-- notify pgrst, 'reload schema';
-- (pg_trgm is intentionally NOT dropped — in use since migration 0006.)
-- =============================================================================
