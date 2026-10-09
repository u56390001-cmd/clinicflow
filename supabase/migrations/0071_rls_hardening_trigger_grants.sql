-- ============================================================================
-- 0071_rls_hardening_trigger_grants.sql  (B2 follow-up)
-- Zero-trust multi-tenancy hardening — part 8 of 8.
--
-- The 0064 revoke loop ran over functions that already existed; the four
-- trigger functions created afterwards (0066/0067/0069) inherited the default
-- PUBLIC EXECUTE grant, which ci_lint flags as anon-executable. Trigger
-- invocation needs no EXECUTE grant, so this simply mirrors the 0064 rule:
-- strip PUBLIC/anon, keep authenticated + service_role (QA/ops parity).
--
-- Idempotent. Rollback: grant execute on these functions to public.
-- ============================================================================

revoke execute on function public.subscriptions_guard()        from public, anon;
revoke execute on function public.payment_submissions_guard()  from public, anon;
revoke execute on function public.clinic_members_guard()       from public, anon;
revoke execute on function public.prevent_clinic_id_change()   from public, anon;

grant execute on function public.subscriptions_guard()       to authenticated, service_role;
grant execute on function public.payment_submissions_guard() to authenticated, service_role;
grant execute on function public.clinic_members_guard()      to authenticated, service_role;
grant execute on function public.prevent_clinic_id_change()  to authenticated, service_role;

notify pgrst, 'reload schema';