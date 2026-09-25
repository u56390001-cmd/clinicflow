-- FAQ / Knowledge Management enhancement (gap-fix to Phase 5).
--
-- `clinic_ai_settings.faqs` already exists as jsonb since 0007 with the
-- original shape {question, answer}. This migration upgrades every entry to
-- the knowledge-entry shape {id, question, answer, active, is_custom} and
-- enforces that shape at the database level.
--
-- Anything stored before this change was doctor-authored through the old
-- settings form, so pre-existing entries are normalized as custom
-- (`is_custom = true`) and stay active (`active = true`). Empty arrays are
-- left untouched.
--
-- Entry shape is enforced with a BEFORE trigger rather than a CHECK because
-- Postgres CHECK constraints cannot contain subqueries over array elements.

update public.clinic_ai_settings cs
set faqs = norm.new_faqs,
    updated_at = now()
from (
  select cs2.id as settings_id,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', coalesce(e ->> 'id', gen_random_uuid()::text),
               'question', e -> 'question',
               'answer', e -> 'answer',
               'active', coalesce(e -> 'active', 'true'::jsonb),
               'is_custom', coalesce(e -> 'is_custom', 'true'::jsonb)
             )
             order by t.idx
           ),
           '[]'::jsonb
         ) as new_faqs
  from public.clinic_ai_settings cs2
  cross join lateral jsonb_array_elements(cs2.faqs)
    with ordinality as t(e, idx)
  group by cs2.id
) norm
where cs.id = norm.settings_id;

create or replace function public.validate_clinic_ai_settings_faqs()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry jsonb;
begin
  if new.faqs is null or jsonb_typeof(new.faqs) <> 'array' then
    raise exception 'faqs must be a JSON array';
  end if;

  for entry in
    select e from jsonb_array_elements(new.faqs) as x(e)
  loop
    if coalesce(jsonb_typeof(entry), '') <> 'object'
       or coalesce(jsonb_typeof(entry -> 'id'), '') <> 'string'
       or entry ->> 'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(entry -> 'question'), '') <> 'string'
       or char_length(entry ->> 'question') > 240
       or coalesce(jsonb_typeof(entry -> 'answer'), '') <> 'string'
       or char_length(entry ->> 'answer') > 2000
       or coalesce(jsonb_typeof(entry -> 'active'), '') <> 'boolean'
       or coalesce(jsonb_typeof(entry -> 'is_custom'), '') <> 'boolean'
    then
      raise exception 'faqs entries must be objects shaped {id: uuid, question: text (max 240), answer: text (max 2000), active: boolean, is_custom: boolean}';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists clinic_ai_settings_faqs_shape
  on public.clinic_ai_settings;

create trigger clinic_ai_settings_faqs_shape
  before insert or update of faqs
  on public.clinic_ai_settings
  for each row
  execute function public.validate_clinic_ai_settings_faqs();
