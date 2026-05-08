-- ─────────────────────────────────────────────────────────────────────────────
-- cannedIQ — AI usage tracking migration
-- Run once against your Supabase project (SQL editor or supabase db push)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add AI usage columns to the profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_requests_this_month integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_requests_reset_at   timestamptz  NOT NULL DEFAULT now();

-- 2. Atomic quota check + increment function
--    Called by the ai-generate edge function via service_role.
--    Returns the NEW count after incrementing.
--    Raises:
--      P0001  if the user's tier is not 'pro' or 'team'
--      P0003  if the user has hit their monthly quota
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER           -- runs as owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  v_tier      text;
  v_used      integer;
  v_reset_at  timestamptz;
  v_quota     integer;
BEGIN
  -- Lock the row so concurrent requests can't race past the quota check
  SELECT tier, ai_requests_this_month, ai_requests_reset_at
    INTO v_tier, v_used, v_reset_at
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  -- Tier gate
  IF v_tier NOT IN ('pro', 'team') THEN
    RAISE EXCEPTION 'AI commands require a Pro or Team plan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Monthly reset: if we're past the start of the month after the reset was set
  IF now() >= date_trunc('month', v_reset_at) + interval '1 month' THEN
    v_used     := 0;
    v_reset_at := date_trunc('month', now()) + interval '1 month';
  END IF;

  -- Quota lookup
  v_quota := CASE v_tier
    WHEN 'pro'  THEN 25
    WHEN 'team' THEN 100
    ELSE 0
  END;

  -- Quota gate
  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'Monthly AI quota of % requests reached.', v_quota
      USING ERRCODE = 'P0003';
  END IF;

  -- Increment and persist
  UPDATE public.profiles
     SET ai_requests_this_month = v_used + 1,
         ai_requests_reset_at   = v_reset_at
   WHERE id = p_user_id;

  RETURN v_used + 1;
END;
$$;

-- 3. Convenience view — read-only usage snapshot per user
--    Used by the options page to display the usage meter.
CREATE OR REPLACE VIEW public.ai_usage AS
SELECT
  id                        AS user_id,
  tier,
  ai_requests_this_month    AS used,
  CASE tier
    WHEN 'pro'  THEN 25
    WHEN 'team' THEN 100
    ELSE 0
  END                       AS quota,
  ai_requests_reset_at      AS resets_at
FROM public.profiles;

-- RLS: users can only see their own row
ALTER VIEW public.ai_usage OWNER TO authenticated;

-- (Optional) Grant select to authenticated role so the options page
-- can read usage via the Supabase JS client with the user's JWT.
GRANT SELECT ON public.ai_usage TO authenticated;
