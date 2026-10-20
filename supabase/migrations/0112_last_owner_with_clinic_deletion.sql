-- ============================================================================
-- 0112_last_owner_with_clinic_deletion.sql
-- Lets a clinic be deleted together with its last owner.
--
-- The membership guard (0067) refuses to remove the last owner of a clinic.
-- That is right while the clinic lives, but it also fires on the
-- `ON DELETE CASCADE` from the clinic row, which makes the clinic itself
-- undeletable: the delete of the clinic cascades into the membership and the
-- guard blocks the whole cascade, so a clinic can never be removed.
--
-- The guard now lets the last owner go when the clinic row is already gone -
-- i.e. the membership is being removed as part of the clinic's own deletion.
-- A standalone removal of the last owner is still refused.
-- ============================================================================

create or replace function public.clinic_members_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
  v_other_owners integer;
begin
  -- Identity columns are immutable once a membership exists.
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.clinic_id is distinct from old.clinic_id
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'MEMBERSHIP_IDENTITY_IMMUTABLE';
    end if;
  end if;

  -- The last owner of a clinic can never be removed or demoted - unless the
  -- clinic itself is being deleted, in which case the membership is going
  -- away with it.
  if old.role = 'owner'::public.clinic_role then
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'owner'::public.clinic_role) then
      if tg_op = 'DELETE'
         and not exists (select 1 from public.clinics where id = old.clinic_id) then
        return old;
      end if;

      select count(*) into v_other_owners
      from public.clinic_members
      where clinic_id = old.clinic_id
        and role = 'owner'::public.clinic_role
        and id <> old.id;

      if v_other_owners = 0 then
        raise exception using errcode = '42501', message = 'LAST_OWNER_CANNOT_BE_REMOVED';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
