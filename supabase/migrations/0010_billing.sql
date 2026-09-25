-- ============================================================================
-- Phase 8: Billing & Email Notifications
-- ============================================================================
-- Adds subscription billing (manual bank transfer / JazzCash / Easypaisa)
-- and platform admin concept. No Stripe — manual verification only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform admin concept
-- ---------------------------------------------------------------------------

-- Simple function to check if a user is a platform admin.
-- Uses a dedicated table so we don't mix clinic-level roles with platform roles.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: only the platform admin themselves can read their own row.
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins: self read"
  ON public.platform_admins FOR SELECT
  USING (user_id = auth.uid());

-- Helper function used by RLS policies across billing tables.
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Subscription plans (data-driven, not hardcoded)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,            -- 'starter', 'professional', 'enterprise'
  name text NOT NULL,                   -- 'Starter Plan'
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'PKR',
  billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'quarterly', 'annual')),
  features jsonb NOT NULL DEFAULT '[]',  -- [{key, label, included}]
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans: public read active"
  ON public.subscription_plans FOR SELECT
  USING (active = true);

CREATE POLICY "Plans: admin full access"
  ON public.subscription_plans FOR ALL
  USING (public.is_platform_admin());

CREATE TRIGGER subscription_plans_set_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed 3 plans
INSERT INTO public.subscription_plans (code, name, price, currency, billing_interval, features) VALUES
  ('starter', 'Starter', 2999, 'PKR', 'monthly', '[
    {"key": "appointments", "label": "Appointment Management", "included": true},
    {"key": "patients", "label": "Patient CRM (up to 100)", "included": true},
    {"key": "ai_receptionist", "label": "AI Receptionist", "included": false},
    {"key": "website", "label": "Custom Website", "included": false},
    {"key": "priority_support", "label": "Priority Support", "included": false}
  ]'),
  ('professional', 'Professional', 7999, 'PKR', 'monthly', '[
    {"key": "appointments", "label": "Appointment Management", "included": true},
    {"key": "patients", "label": "Patient CRM (up to 500)", "included": true},
    {"key": "ai_receptionist", "label": "AI Receptionist", "included": true},
    {"key": "website", "label": "Custom Website", "included": true},
    {"key": "priority_support", "label": "Priority Support", "included": false}
  ]'),
  ('enterprise', 'Enterprise', 19999, 'PKR', 'monthly', '[
    {"key": "appointments", "label": "Appointment Management", "included": true},
    {"key": "patients", "label": "Patient CRM (Unlimited)", "included": true},
    {"key": "ai_receptionist", "label": "AI Receptionist", "included": true},
    {"key": "website", "label": "Custom Website", "included": true},
    {"key": "priority_support", "label": "Priority Support", "included": true}
  ]')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Subscriptions (one per clinic)
-- ---------------------------------------------------------------------------

CREATE TYPE public.subscription_status AS ENUM (
  'pending_payment',   -- clinic hasn't submitted any payment yet
  'payment_submitted', -- proof uploaded, waiting for admin
  'under_review',      -- admin is looking at it (optional intermediate)
  'approved',          -- admin approved, activating
  'active',            -- subscription is live
  'expiring',          -- approaching expiry (computed, not stored as row status)
  'expired',           -- past end date
  'rejected'           -- admin rejected the payment
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status public.subscription_status NOT NULL DEFAULT 'pending_payment',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subscriptions: clinic read own"
  ON public.subscriptions FOR SELECT
  USING (
    clinic_id IN (
      SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Subscriptions: admin full access"
  ON public.subscriptions FOR ALL
  USING (public.is_platform_admin());

-- Clinic inserts their own subscription on first checkout
CREATE POLICY "Subscriptions: clinic insert own"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- Clinic can update their own subscription (for status changes driven by renewal flow)
CREATE POLICY "Subscriptions: clinic update own"
  ON public.subscriptions FOR UPDATE
  USING (
    clinic_id IN (
      SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Admin-configurable payment methods
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('bank_transfer', 'jazzcash', 'easypaisa')),
  name text NOT NULL,                    -- 'HBL Bank Transfer', 'JazzCash Wallet'
  account_title text,
  account_number text,
  iban text,
  instructions text,                     -- free-text instructions shown to clinic
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Public read for active methods (checkout page needs them before auth check sometimes)
CREATE POLICY "Payment methods: public read active"
  ON public.payment_methods FOR SELECT
  USING (active = true);

CREATE POLICY "Payment methods: admin full access"
  ON public.payment_methods FOR ALL
  USING (public.is_platform_admin());

CREATE TRIGGER payment_methods_set_updated_at
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed default payment methods
INSERT INTO public.payment_methods (type, name, account_title, account_number, iban, instructions, sort_order) VALUES
  ('bank_transfer', 'Bank Transfer (HBL)', 'MedBook AI Pvt Ltd', '01234567890123', 'PK36SCBL0000001234567890', 'Transfer the exact amount to the account above. Include your clinic name in the payment reference.', 1),
  ('jazzcash', 'JazzCash', 'MedBook AI', '03001234567', NULL, 'Send the exact amount via JazzCash mobile wallet. Save the transaction ID as proof.', 2),
  ('easypaisa', 'Easypaisa', 'MedBook AI', '03001234567', NULL, 'Send the exact amount via Easypaisa. Save the transaction ID as proof.', 3)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Payment submissions (clinic uploads proof)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'PKR',
  sender_name text NOT NULL,
  sender_phone text NOT NULL,
  transaction_reference text NOT NULL,
  account_title text,
  notes text,
  proof_file_path text,                  -- storage path: payment-proofs/{clinic_id}/{submission_id}/{filename}
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submissions: clinic read own"
  ON public.payment_submissions FOR SELECT
  USING (
    clinic_id IN (
      SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Submissions: clinic insert own"
  ON public.payment_submissions FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT cm.clinic_id FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Submissions: admin full access"
  ON public.payment_submissions FOR ALL
  USING (public.is_platform_admin());

CREATE TRIGGER payment_submissions_set_updated_at
  BEFORE UPDATE ON public.payment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for admin panel queries
CREATE INDEX payment_submissions_status_idx ON public.payment_submissions (status, created_at DESC);
CREATE INDEX payment_submissions_clinic_idx ON public.payment_submissions (clinic_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Billing events (audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_submission_id uuid REFERENCES public.payment_submissions(id) ON DELETE SET NULL,
  event_type text NOT NULL,              -- 'payment_submitted', 'payment_approved', 'payment_rejected', 'subscription_activated', etc.
  actor_user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- Clinic reads events for their subscriptions
CREATE POLICY "Billing events: clinic read own"
  ON public.billing_events FOR SELECT
  USING (
    subscription_id IN (
      SELECT s.id FROM public.subscriptions s
      WHERE s.clinic_id IN (
        SELECT cm.clinic_id FROM public.clinic_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Billing events: admin read all"
  ON public.billing_events FOR SELECT
  USING (public.is_platform_admin());

-- Server-side inserts via service role (no client insert policy needed — uses service role key)
CREATE POLICY "Billing events: system insert"
  ON public.billing_events FOR INSERT
  WITH CHECK (true);

CREATE INDEX billing_events_subscription_idx ON public.billing_events (subscription_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Storage bucket for payment proofs (private)
-- ---------------------------------------------------------------------------

-- Note: bucket creation must be done via Supabase Dashboard or CLI:
--   supabase storage create-bucket payment-proofs --public=false
-- The policies below are for the storage.objects table.

-- Storage RLS policies for payment-proofs bucket
CREATE POLICY "Payment proofs: clinic upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] IN (
      SELECT cm.clinic_id::text FROM public.clinic_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Payment proofs: clinic read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      -- Clinic reads their own
      (storage.foldername(name))[1] IN (
        SELECT cm.clinic_id::text FROM public.clinic_members cm
        WHERE cm.user_id = auth.uid()
      )
      OR
      -- Admin reads all
      public.is_platform_admin()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Helper: get or create clinic subscription
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_subscription(
  p_clinic_id uuid,
  p_plan_id uuid
)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_sub public.subscriptions;
BEGIN
  -- Try to get existing subscription
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE clinic_id = p_clinic_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub IS NOT NULL THEN
    RETURN v_sub;
  END IF;

  -- Create new subscription
  INSERT INTO public.subscriptions (clinic_id, plan_id, status)
  VALUES (p_clinic_id, p_plan_id, 'pending_payment')
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Helper: activate subscription after admin approval
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_subscription_id uuid,
  p_duration_days integer DEFAULT 30
)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_sub public.subscriptions;
  v_start timestamptz := now();
  v_end timestamptz := now() + (p_duration_days || ' days')::interval;
BEGIN
  UPDATE public.subscriptions
  SET
    status = 'active',
    current_period_start = v_start,
    current_period_end = v_end,
    updated_at = now()
  WHERE id = p_subscription_id
  RETURNING * INTO v_sub;

  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  RETURN v_sub;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Helper: check if clinic has active subscription
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_active_subscription(p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE clinic_id = p_clinic_id
      AND status = 'active'
      AND current_period_end > now()
  );
$$;
