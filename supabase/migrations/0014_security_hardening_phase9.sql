-- ============================================================================
-- 0014 — Security hardening (Phase 9)
-- 1. Pin search_path on every app function (prevents search-path hijacking).
-- 2. is_platform_admin becomes SECURITY DEFINER so RLS policies on tables it
--    guards cannot be bypassed by schema/function privilege games.
-- 3. Event trigger that auto-enables RLS on any new table created in `public`.
-- All statements are idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. search_path pinning
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_member(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_id = target_clinic_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_owner(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_id = target_clinic_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_admin(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_id = target_clinic_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_creator(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinics
    WHERE id = target_clinic_id AND created_by = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Functions below are patched in place WITHOUT rewriting their bodies:
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn record;
BEGIN
  -- Patch function attributes (search_path) without rewriting bodies.
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'book_appointment',
        'reschedule_appointment',
        'get_or_create_subscription',
        'activate_subscription',
        'has_active_subscription'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I SET search_path = public, auth',
      fn.proname
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Platform-admin helper: SECURITY DEFINER + pinned search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Auto-enable RLS on new tables in `public`
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public')
       AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();
