-- ================================================================
-- User Demographics
-- Run AFTER team-provisioning.sql.
--
-- Captures richer profile data at signup and plan upgrade so we
-- can understand who our users are and segment them.
--
-- Fields collected at signup:
--   full_name, job_title, company_name, company_size, use_case,
--   referral_source
--
-- Additional field at plan upgrade:
--   upgrade_reason (open text — why they're going paid)
-- ================================================================


-- ── 1. Demographic columns on profiles ───────────────────────────

ALTER TABLE public.profiles
  -- Already added by team-provisioning.sql:
  -- full_name TEXT
  ADD COLUMN IF NOT EXISTS full_name        TEXT,
  -- 'personal' or 'professional' — set by the onboarding toggle
  ADD COLUMN IF NOT EXISTS user_type        TEXT,
  ADD COLUMN IF NOT EXISTS job_title        TEXT,
  -- For personal users this may be blank; for professionals it's their org
  ADD COLUMN IF NOT EXISTS company_name     TEXT,
  -- 'solo', '2-10', '11-50', '51-200', '201-1000', '1000+' (pro users)
  -- or 'personal' (personal users — stored for segmentation)
  ADD COLUMN IF NOT EXISTS company_size     TEXT,
  -- Personal use cases: 'personal_productivity', 'writing', 'job_search',
  --                     'study', 'freelance', 'side_project', 'other'
  -- Business use cases: 'customer_support', 'sales', 'recruiting',
  --                     'marketing', 'engineering', 'legal', 'other'
  ADD COLUMN IF NOT EXISTS use_case         TEXT,
  -- How they found us: 'google', 'chrome_store', 'colleague', 'twitter',
  --                    'linkedin', 'blog', 'other'
  ADD COLUMN IF NOT EXISTS referral_source  TEXT,
  -- Why they upgraded (structured key + optional free text)
  ADD COLUMN IF NOT EXISTS upgrade_reason   TEXT,
  -- When they completed the onboarding form (null = not yet shown/completed)
  ADD COLUMN IF NOT EXISTS onboarded_at     TIMESTAMPTZ;


-- ── 2. save_demographics RPC ──────────────────────────────────────
-- Called from the options page after signup onboarding form.
-- Upserts demographic fields for the calling user.

CREATE OR REPLACE FUNCTION public.save_demographics(
  p_full_name       TEXT    DEFAULT NULL,
  p_user_type       TEXT    DEFAULT NULL,   -- 'personal' | 'professional'
  p_job_title       TEXT    DEFAULT NULL,
  p_company_name    TEXT    DEFAULT NULL,
  p_company_size    TEXT    DEFAULT NULL,
  p_use_case        TEXT    DEFAULT NULL,
  p_referral_source TEXT    DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name        = COALESCE(p_full_name,       full_name),
    user_type        = COALESCE(p_user_type,       user_type),
    job_title        = COALESCE(p_job_title,       job_title),
    company_name     = COALESCE(p_company_name,    company_name),
    company_size     = COALESCE(p_company_size,    company_size),
    use_case         = COALESCE(p_use_case,        use_case),
    referral_source  = COALESCE(p_referral_source, referral_source),
    onboarded_at     = COALESCE(onboarded_at, now())
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_demographics(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. save_upgrade_reason RPC ────────────────────────────────────
-- Called just before redirecting to Stripe Checkout.

CREATE OR REPLACE FUNCTION public.save_upgrade_reason(p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET upgrade_reason = p_reason
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_upgrade_reason(TEXT) TO authenticated;


-- ── Verify ────────────────────────────────────────────────────────
SELECT 'user-demographics migration ready' AS status;
