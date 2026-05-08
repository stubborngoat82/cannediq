-- ─────────────────────────────────────────────────────────────────────────────
-- cannedIQ — Billing / Stripe integration migration
-- Run once against your Supabase project (SQL editor or supabase db push)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend profiles with billing fields ────────────────────────────────────

ALTER TABLE public.profiles
  -- plan: free | pro | ai | team
  -- NOTE: If you previously used a 'tier' column, this replaces/extends it.
  ADD COLUMN IF NOT EXISTS plan                   text        NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text,          -- active | trialing | past_due | canceled | etc.
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_credits_remaining   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_reset_at    timestamptz;

-- Keep plan and tier in sync (tier is used by the AI quota function)
-- We'll treat 'tier' as a computed alias — update it whenever plan changes.
-- If 'tier' column already exists, make it a generated column or use a trigger.

-- Trigger: mirror plan → tier so existing AI-quota logic still works
CREATE OR REPLACE FUNCTION public.sync_plan_to_tier()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.tier := CASE NEW.plan
    WHEN 'pro'  THEN 'pro'
    WHEN 'ai'   THEN 'pro'    -- Pro+AI also counts as 'pro' tier for AI quota
    WHEN 'team' THEN 'team'
    ELSE 'free'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_plan_to_tier ON public.profiles;
CREATE TRIGGER trg_sync_plan_to_tier
  BEFORE INSERT OR UPDATE OF plan ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_plan_to_tier();

-- Update AI quota function to also understand 'ai' plan
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan      text;
  v_used      integer;
  v_reset_at  timestamptz;
  v_quota     integer;
BEGIN
  SELECT plan, ai_requests_this_month, ai_requests_reset_at
    INTO v_plan, v_used, v_reset_at
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  -- Plan gate: pro, ai, and team get AI access
  IF v_plan NOT IN ('pro', 'ai', 'team') THEN
    RAISE EXCEPTION 'AI commands require a Pro, Pro+AI, or Team plan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Monthly reset
  IF now() >= date_trunc('month', v_reset_at) + interval '1 month' THEN
    v_used     := 0;
    v_reset_at := date_trunc('month', now()) + interval '1 month';
  END IF;

  -- Quota by plan
  v_quota := CASE v_plan
    WHEN 'ai'   THEN 500    -- Pro+AI: 500/month
    WHEN 'pro'  THEN 25     -- Pro: 25/month (legacy)
    WHEN 'team' THEN 100    -- Team: 100/month
    ELSE 0
  END;

  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'Monthly AI quota of % requests reached.', v_quota
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.profiles
     SET ai_requests_this_month = v_used + 1,
         ai_requests_reset_at   = v_reset_at
   WHERE id = p_user_id;

  RETURN v_used + 1;
END;
$$;

-- ── 2. Unique index on stripe_customer_id ─────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ── 3. RLS policies ───────────────────────────────────────────────────────────

-- Users can read their own billing fields
-- (Assumes RLS is already enabled on profiles — add if not)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Read own profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'profiles' AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY profiles_select_own ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  -- Update own profile (non-billing fields only — billing is service_role only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'profiles' AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own ON public.profiles
      FOR UPDATE USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ── 4. Plan limits view (used by options page) ────────────────────────────────

CREATE OR REPLACE VIEW public.user_plan AS
SELECT
  id                                                          AS user_id,
  plan,
  subscription_status,
  current_period_end,
  cancel_at_period_end,
  ai_credits_remaining,
  ai_credits_reset_at,
  -- Computed limits
  CASE plan
    WHEN 'free' THEN 25
    ELSE NULL           -- NULL = unlimited
  END                                                         AS max_commands,
  CASE plan
    WHEN 'free' THEN 3
    ELSE NULL
  END                                                         AS max_stacks,
  plan IN ('pro', 'ai', 'team')                              AS advanced_variables,
  plan IN ('pro', 'ai', 'team')                              AS context_commands,
  plan IN ('ai')                                             AS ai_commands,
  plan IN ('team')                                           AS team_stacks,
  CASE plan
    WHEN 'ai'   THEN 500
    WHEN 'team' THEN 100
    WHEN 'pro'  THEN 25
    ELSE 0
  END                                                         AS ai_quota
FROM public.profiles;

GRANT SELECT ON public.user_plan TO authenticated;

-- ── 5. Webhook helper: upsert billing fields (called by stripe-webhook fn) ────

CREATE OR REPLACE FUNCTION public.upsert_billing(
  p_user_id              uuid,
  p_plan                 text,
  p_stripe_customer_id   text,
  p_stripe_sub_id        text,
  p_status               text,
  p_period_end           timestamptz,
  p_cancel_at_period_end boolean,
  p_ai_credits           integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET plan                   = p_plan,
         stripe_customer_id     = p_stripe_customer_id,
         stripe_subscription_id = p_stripe_sub_id,
         subscription_status    = p_status,
         current_period_end     = p_period_end,
         cancel_at_period_end   = p_cancel_at_period_end,
         ai_credits_remaining   = COALESCE(p_ai_credits, ai_credits_remaining),
         -- Reset AI credits on renewal if plan is ai
         ai_credits_reset_at    = CASE
           WHEN p_plan = 'ai' AND p_ai_credits IS NOT NULL THEN now()
           ELSE ai_credits_reset_at
         END
   WHERE id = p_user_id;
END;
$$;
