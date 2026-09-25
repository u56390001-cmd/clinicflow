-- =============================================================================
-- MedBook AI — Phase 11 | Migration 0018
-- Notification Dispatcher: patient channel preference (schema only)
--
-- * Adds `notification_preference` ('email' | 'whatsapp' | 'both', default
--   'email') and nullable `whatsapp_number` to `patients` so Phase 13 does not
--   need another migration. NO routing behavior changes in this phase — the
--   dispatcher (code-level abstraction) still always sends email.
-- * Backward compatible: both columns are defaulted/nullable; no existing row
--   or query is affected.
-- =============================================================================

alter table public.patients
  add column if not exists notification_preference text
    not null default 'email'
    constraint patients_notification_preference_check
      check (notification_preference in ('email', 'whatsapp', 'both'));

alter table public.patients
  add column if not exists whatsapp_number text
    constraint patients_whatsapp_number_check
      check (whatsapp_number is null or char_length(btrim(whatsapp_number)) between 3 and 32);

-- Lookups by WhatsApp number arrive with the channel's phone format (leading +,
-- digits, spaces); a plain btree on the raw value is enough for Phase 13's
-- returning-patient recognition and cheap to add now.
create index if not exists patients_whatsapp_number_idx
  on public.patients (whatsapp_number)
  where whatsapp_number is not null;
