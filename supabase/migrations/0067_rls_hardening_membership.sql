-- ============================================================================
-- 0067_rls_hardening_membership.sql  (B6)
-- Zero-trust multi-tenancy hardening — part 4 of 7.
--
-- Closes owner lock-out and membership injection:
--   * an admin can no longer UPDATE a row whose current role is `owner`
--     (USING now checks the existing row, not just the new one);
--   * the last owner can never be demoted or removed (trigger);
--   * identity columns (user_id, clinic_id, email, id, created_at) are
--     immutable (trigger).
--
-- Idempotent. Rollback: re-apply 0003 clinic_members policies and drop the
-- trigger/function.
-- ============================================================================

drop policy if exists clinic_members_update_admin on public.clinic_members;
create policy clinic_members_update_admin
  on public.clinic_members for update
  to authenticated
  using (
    public.is_clinic_admin(clinic_id)
    and (role <> 'owner'::public.clinic_role or public.is_clinic_owner(clinic_id))
  )
  with check (
    public.is_clinic_admin(clinic_id)
    and (role <> 'owner'::public.clinic_role or public.is_clinic_owner(clinic_id))
  );

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

  -- The last owner of a clinic can never be removed or demoted.
  if old.role = 'owner'::public.clinic_role then
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'owner'::public.clinic_role) then
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

drop trigger if exists clinic_members_guard on public.clinic_members;
create trigger clinic_members_guard
  before update or delete on public.clinic_members
  for each row execute function public.clinic_members_guard();

notify pgrst, 'reload schema';
