-- ── CRL: AI Usage Tracking ────────────────────────────────────────────────────
--
-- Run this against your Supabase project (SQL Editor or CLI migration).
-- Adds per-user AI request counters to the profiles table and a helper
-- RPC that checks quota, auto-resets the counter monthly, then increments.
--
-- Quotas (requests per calendar month):
--   free  →  0  (blocked entirely)
--   pro   → 25
--   team  → 100  (shared pool per user seat, not per team)

-- ── 1. Columns ────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_requests_this_month  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_requests_reset_at    timestamptz  NOT NULL DEFAULT now();

-- ── 2. RPC: check_and_increment_ai_usage ─────────────────────────────────────
--
-- Called by the ai-generate edge function (service-role key, so RLS is bypassed).
-- Returns the new usage count on success, raises an exception on failure.

CREATE OR REPLACE FUNCTION public.check_and_increment_ai_usage(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier      text;
  v_quota     integer;
  v_used      integer;
  v_reset_at  timestamptz;
  v_new_used  integer;
BEGIN
  -- Lock the row for update so concurrent calls don't double-count
  SELECT tier, ai_requests_this_month, ai_requests_reset_at
    INTO v_tier, v_used, v_reset_at
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- Determine quota by tier
  CASE v_tier
    WHEN 'pro'  THEN v_quota := 25;
    WHEN 'team' THEN v_quota := 100;
    ELSE
      RAISE EXCEPTION 'AI commands require a Pro or Team subscription.'
        USING ERRCODE = 'P0001';
  END CASE;

  -- Reset counter if we've passed the first of the month since last reset
  IF now() >= date_trunc('month', v_reset_at) + interval '1 month' THEN
    v_used     := 0;
    v_reset_at := date_trunc('month', now()) + interval '1 month'; -- next month
  END IF;

  -- Enforce quota
  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'Monthly AI limit reached (% / %). Resets %.', v_used, v_quota,
      to_char(v_reset_at AT TIME ZONE 'UTC', 'Mon DD')
      USING ERRCODE = 'P0003';
  END IF;

  -- Increment
  v_new_used := v_used + 1;

  UPDATE public.profiles
     SET ai_requests_this_month = v_new_used,
         ai_requests_reset_at   = v_reset_at
   WHERE id = p_user_id;

  RETURN v_new_used;
END;
$$;

-- Grant execute to the service role used by edge functions
GRANT EXECUTE ON FUNCTION public.check_and_increment_ai_usage(uuid)
  TO service_role;

-- ── 3. Helper view: ai_usage_for_user ─────────────────────────────────────────
--
-- Exposed via REST so the options page can display usage without a raw SQL call.
-- RLS ensures users only see their own row.

CREATE OR REPLACE VIEW public.ai_usage AS
SELECT
  id                                                        AS user_id,
  tier,
  ai_requests_this_month                                    AS used,
  CASE tier
    WHEN 'pro'  THEN 25
    WHEN 'team' THEN 100
    ELSE 0
  END                                                       AS quota,
  ai_requests_reset_at                                      AS resets_at
FROM public.profiles;

-- Row-level security on the view (Supabase exposes views through PostgREST)
ALTER VIEW public.ai_usage OWNER TO postgres;

-- Grant SELECT to authenticated role so the anon client can read it with a JWT
GRANT SELECT ON public.ai_usage TO authenticated;

COMMENT ON VIEW public.ai_usage IS
  'Per-user AI request quota. RLS on profiles ensures users only see their own row via ?id=eq.{uid}.';
