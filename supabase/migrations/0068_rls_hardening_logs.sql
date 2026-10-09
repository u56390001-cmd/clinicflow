-- ============================================================================
-- 0068_rls_hardening_logs.sql  (B7)
-- Zero-trust multi-tenancy hardening — part 5 of 7.
--
-- `app_event_logs` inserts must be attributable: actor_user_id, when set, must
-- equal the caller; a clinic-scoped event must name a clinic the caller belongs
-- to. NULL-clinic (system) events remain service-role only because `anon` was
-- stripped of table privileges in 0064 and this policy is `TO authenticated`.
--
-- Idempotent. Rollback: re-apply the 0013 insert policy.
-- ============================================================================

drop policy if exists app_event_logs_insert_member on public.app_event_logs;
create policy app_event_logs_insert_member
  on public.app_event_logs for insert
  to authenticated
  with check (
    (actor_user_id is null or actor_user_id = (select auth.uid()))
    and (clinic_id is null or public.is_clinic_member(clinic_id))
  );

notify pgrst, 'reload schema';
