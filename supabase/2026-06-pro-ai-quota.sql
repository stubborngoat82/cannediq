-- ─────────────────────────────────────────────────────────────────────────────
-- cannedIQ — Pro AI quota bump migration (2026-06)
-- Run once in the Supabase SQL editor (dev + prod projects).
--
-- Change: regular Pro now includes AI commands at 100/month (was 25).
--         Pro+AI stays 500/month, Team stays 100/month.
-- Safe to re-run — all statements are CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Quota enforcement function
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
    WHEN 'pro'  THEN 100    -- Pro: 100/month
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

-- 2. Usage meter view (feeds the options-page "X of N AI requests" bar)
CREATE OR REPLACE VIEW public.ai_usage WITH (security_invoker = true) AS
SELECT
  id                        AS user_id,
  tier,
  ai_requests_this_month    AS used,
  CASE tier
    WHEN 'ai'   THEN 500
    WHEN 'pro'  THEN 100
    WHEN 'team' THEN 100
    ELSE 0
  END                       AS quota,
  ai_requests_reset_at      AS resets_at
FROM public.profiles;

GRANT SELECT ON public.ai_usage TO authenticated;
