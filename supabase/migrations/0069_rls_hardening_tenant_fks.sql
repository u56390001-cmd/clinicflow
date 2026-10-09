-- ============================================================================
-- 0069_rls_hardening_tenant_fks.sql  (B11, C4, C5, AUTO-5)
-- Zero-trust multi-tenancy hardening — part 6 of 7.
--
-- Closes cross-tenant child injection by making every tenant->tenant relation
-- composite on `(clinic_id, x_id)`. Pre-flight (see AUDIT_LOG.md §"B11
-- pre-flight") found 0 existing mismatches, so each constraint is added
-- NOT VALID and then VALIDATEd.
--
-- Also:
--   * adds the missing UNIQUE (clinic_id, id) parent keys the composite FKs need;
--   * adds a `prevent_clinic_id_change()` immutability trigger to every table
--     that carries `clinic_id`;
--   * adds a `clinic_id` index where none exists.
--
-- Idempotent (drop-if-exists then re-add). Rollback: drop the new composite
-- constraints and re-add the original single-column FKs from the creating
-- migrations, drop the immutability triggers/function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Parent keys required by the composite FKs.
-- ---------------------------------------------------------------------------
alter table public.websites               drop constraint if exists websites_clinic_id_id_key;
alter table public.websites               add  constraint websites_clinic_id_id_key              unique (clinic_id, id);

alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_clinic_id_id_key;
alter table public.whatsapp_conversations add  constraint whatsapp_conversations_clinic_id_id_key unique (clinic_id, id);

alter table public.patient_bills          drop constraint if exists patient_bills_clinic_id_id_key;
alter table public.patient_bills          add  constraint patient_bills_clinic_id_id_key          unique (clinic_id, id);

alter table public.patient_documents      drop constraint if exists patient_documents_clinic_id_id_key;
alter table public.patient_documents      add  constraint patient_documents_clinic_id_id_key      unique (clinic_id, id);

-- ---------------------------------------------------------------------------
-- 1. Composite tenant FKs.
-- ---------------------------------------------------------------------------

-- website_images -> websites (content injection into another clinic's site)
alter table public.website_images drop constraint if exists website_images_website_id_fkey;
alter table public.website_images add  constraint website_images_website_id_fkey
  foreign key (clinic_id, website_id) references public.websites (clinic_id, id)
  on delete cascade not valid;
alter table public.website_images validate constraint website_images_website_id_fkey;

-- whatsapp_conversations -> patients
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_patient_id_fkey;
alter table public.whatsapp_conversations add  constraint whatsapp_conversations_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete set null (patient_id) not valid;
alter table public.whatsapp_conversations validate constraint whatsapp_conversations_patient_id_fkey;

-- whatsapp_messages -> whatsapp_conversations (inbox injection)
alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_conversation_id_fkey;
alter table public.whatsapp_messages add  constraint whatsapp_messages_conversation_id_fkey
  foreign key (clinic_id, conversation_id) references public.whatsapp_conversations (clinic_id, id)
  on delete cascade not valid;
alter table public.whatsapp_messages validate constraint whatsapp_messages_conversation_id_fkey;

-- vitals -> visits
alter table public.vitals drop constraint if exists vitals_visit_id_fkey;
alter table public.vitals add  constraint vitals_visit_id_fkey
  foreign key (clinic_id, visit_id) references public.visits (clinic_id, id)
  on delete cascade not valid;
alter table public.vitals validate constraint vitals_visit_id_fkey;

-- prescriptions -> visits (+ drop the duplicate clinic FK)
alter table public.prescriptions drop constraint if exists prescriptions_clinic_visit_fkey;
alter table public.prescriptions add  constraint prescriptions_clinic_visit_fkey
  foreign key (clinic_id, visit_id) references public.visits (clinic_id, id)
  on delete cascade not valid;
alter table public.prescriptions validate constraint prescriptions_clinic_visit_fkey;
alter table public.prescriptions drop constraint if exists prescriptions_clinic_clinic_fkey;

-- patient_bill_items -> patient_bills
alter table public.patient_bill_items drop constraint if exists patient_bill_items_bill_fkey;
alter table public.patient_bill_items add  constraint patient_bill_items_bill_fkey
  foreign key (clinic_id, bill_id) references public.patient_bills (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_bill_items validate constraint patient_bill_items_bill_fkey;

-- patient_payments -> patient_bills
alter table public.patient_payments drop constraint if exists patient_payments_bill_fkey;
alter table public.patient_payments add  constraint patient_payments_bill_fkey
  foreign key (clinic_id, bill_id) references public.patient_bills (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_payments validate constraint patient_payments_bill_fkey;

-- receipts -> patient_bills
alter table public.receipts drop constraint if exists receipts_bill_fkey;
alter table public.receipts add  constraint receipts_bill_fkey
  foreign key (clinic_id, bill_id) references public.patient_bills (clinic_id, id)
  on delete cascade not valid;
alter table public.receipts validate constraint receipts_bill_fkey;

-- medical_history -> patients
alter table public.medical_history drop constraint if exists medical_history_patient_id_fkey;
alter table public.medical_history add  constraint medical_history_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete cascade not valid;
alter table public.medical_history validate constraint medical_history_patient_id_fkey;

-- patient_medications -> patients
alter table public.patient_medications drop constraint if exists patient_medications_patient_id_fkey;
alter table public.patient_medications add  constraint patient_medications_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_medications validate constraint patient_medications_patient_id_fkey;

-- patient_alerts -> patients
alter table public.patient_alerts drop constraint if exists patient_alerts_patient_id_fkey;
alter table public.patient_alerts add  constraint patient_alerts_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_alerts validate constraint patient_alerts_patient_id_fkey;

-- patient_lab_results -> patients
alter table public.patient_lab_results drop constraint if exists patient_lab_results_patient_id_fkey;
alter table public.patient_lab_results add  constraint patient_lab_results_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_lab_results validate constraint patient_lab_results_patient_id_fkey;

-- patient_lab_results -> patient_documents
alter table public.patient_lab_results drop constraint if exists patient_lab_results_document_id_fkey;
alter table public.patient_lab_results add  constraint patient_lab_results_document_id_fkey
  foreign key (clinic_id, document_id) references public.patient_documents (clinic_id, id)
  on delete set null (document_id) not valid;
alter table public.patient_lab_results validate constraint patient_lab_results_document_id_fkey;

-- patient_intake_tokens -> patients
alter table public.patient_intake_tokens drop constraint if exists patient_intake_tokens_patient_id_fkey;
alter table public.patient_intake_tokens add  constraint patient_intake_tokens_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete cascade not valid;
alter table public.patient_intake_tokens validate constraint patient_intake_tokens_patient_id_fkey;

-- encounter_transcripts -> visits
alter table public.encounter_transcripts drop constraint if exists encounter_transcripts_visit_id_fkey;
alter table public.encounter_transcripts add  constraint encounter_transcripts_visit_id_fkey
  foreign key (clinic_id, visit_id) references public.visits (clinic_id, id)
  on delete cascade not valid;
alter table public.encounter_transcripts validate constraint encounter_transcripts_visit_id_fkey;

-- copilot_audit_logs -> visits
alter table public.copilot_audit_logs drop constraint if exists copilot_audit_logs_visit_id_fkey;
alter table public.copilot_audit_logs add  constraint copilot_audit_logs_visit_id_fkey
  foreign key (clinic_id, visit_id) references public.visits (clinic_id, id)
  on delete cascade not valid;
alter table public.copilot_audit_logs validate constraint copilot_audit_logs_visit_id_fkey;

-- engagement_logs -> patients
alter table public.engagement_logs drop constraint if exists engagement_logs_patient_id_fkey;
alter table public.engagement_logs add  constraint engagement_logs_patient_id_fkey
  foreign key (clinic_id, patient_id) references public.patients (clinic_id, id)
  on delete set null (patient_id) not valid;
alter table public.engagement_logs validate constraint engagement_logs_patient_id_fkey;

-- ---------------------------------------------------------------------------
-- 2. C4: clinic_id immutability trigger on every table that has clinic_id.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_clinic_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'clinic_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from information_schema.columns k
        where k.table_schema = 'public'
          and k.table_name = c.relname
          and k.column_name = 'clinic_id'
      )
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      t.relname || '_clinic_id_immutable', t.relname
    );
    execute format(
      'create trigger %I before update of clinic_id on public.%I '
      'for each row execute function public.prevent_clinic_id_change()',
      t.relname || '_clinic_id_immutable', t.relname
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. C5: clinic_id index where none already exists.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from information_schema.columns k
        where k.table_schema = 'public'
          and k.table_name = c.relname
          and k.column_name = 'clinic_id'
      )
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.oid
          and i.indisvalid
          and pg_get_indexdef(i.indexrelid) like '%(clinic_id%'
      )
  loop
    execute format(
      'create index if not exists %I on public.%I (clinic_id)',
      'idx_' || t.relname || '_clinic_id', t.relname
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
