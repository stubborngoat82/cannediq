-- ================================================================
-- Migration: user_plan view + missing billing columns on profiles
--
-- Run this in Supabase Dashboard → SQL Editor.
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE.
--
-- Fixes:
--   1. The stale `plan` column on profiles always held 'free'.
--      Replace it with a GENERATED column that always mirrors `tier`
--      so any code that reads `plan` gets the correct value.
--   2. Add columns the stripe-webhook writes that were missing from
--      the original schema.
--   3. Create the user_plan view that refreshUserPlan() in the
--      extension queries. Without this view the cached plan was
--      always 'free' and AI commands were incorrectly gated.
-- ================================================================


-- ── 1. Fix the stale `plan` column ──────────────────────────────
--
-- Drop the old dead column (DEFAULT 'free', never updated) and
-- replace it with a stored generated column that always equals tier.
-- Every existing and future row will automatically have plan = tier.

ALTER TABLE public.profiles DROP COLUMN IF EXISTS plan;

ALTER TABLE public.profiles
  ADD COLUMN plan TEXT GENERATED ALWAYS AS (tier) STORED;


-- ── 2. Add missing billing columns ──────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_period_end    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_credits_remaining  INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_reset_at   TIMESTAMPTZ;


-- ── 3. user_plan view ────────────────────────────────────────────
--
-- Exposes exactly the fields that refreshUserPlan() in background.js
-- reads. WHERE id = auth.uid() means each user only sees their own row.

DROP VIEW IF EXISTS public.user_plan;

CREATE VIEW public.user_plan AS
SELECT
  id,
  plan,                    -- generated column: always equals tier
  subscription_status,
  current_period_end,
  cancel_at_period_end,
  ai_credits_remaining,
  ai_credits_reset_at,

  -- Mirrors PLAN_LIMITS in gates.js; NULL = unlimited (maps to Infinity)
  CASE tier
    WHEN 'free' THEN 25
    ELSE NULL
  END  AS max_commands,

  CASE tier
    WHEN 'free' THEN 3
    ELSE NULL
  END  AS max_stacks

FROM public.profiles
WHERE id = auth.uid();


-- ── 4. Grant read access ─────────────────────────────────────────

GRANT SELECT ON public.user_plan TO authenticated;
