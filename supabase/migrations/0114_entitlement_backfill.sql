-- ============================================================================
-- 0114_entitlement_backfill.sql
-- Nobody loses a module on deploy day.
--
-- The gates (route guard + sidebar locks) arrive with the same release that
-- rewrites the plans. A clinic that uses Growth Agent, Engagement or the TV
-- queue today has never "bought" those add-ons — they were simply free. The
-- moment the gate lands they would be locked out, which is not a bug fix, it
-- is a broken promise.
--
-- So: every clinic with an active subscription is granted the add-ons it is
-- already using, at no cost, once. New clinics have to buy them.
-- ============================================================================

insert into public.clinic_addons (clinic_id, addon_id, status, quantity, activated_at)
select s.clinic_id, a.id, 'active', 1, now()
  from public.subscriptions s
  join public.addons a
    on a.slug in ('growth-agent', 'whatsapp-ai-receptionist', 'queue-management-system')
 where s.status = 'active'
on conflict (clinic_id, addon_id) do nothing;

notify pgrst, 'reload schema';
