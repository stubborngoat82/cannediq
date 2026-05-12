-- ================================================================
-- Migration: user_plan view + missing billing columns on profiles
--
-- Run this in Supabase Dashboard → SQL Editor.
--
-- Fixes:
--   1. Adds columns the stripe-webhook writes but that never existed
--      in schema.sql (current_period_end, cancel_at_period_end,
--      ai_credits_remaining, ai_credits_reset_at).
--   2. Creates the user_plan view that refreshUserPlan() in the
--      extension queries. Without this view the extension always
--      cached plan='free' and gated AI commands incorrectly.
-- ================================================================


-- ── 1. Add missing billing columns to profiles ───────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_period_end    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_credits_remaining  INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credits_reset_at   TIMESTAMPTZ;


-- ── 2. user_plan view ────────────────────────────────────────────
--
-- Exposes exactly the fields that refreshUserPlan() in background.js
-- reads. The WHERE clause limits each user to their own row so this
-- view is safe to expose via the Supabase REST API.
--
-- Column mapping:
--   tier → plan          (extension stores "plan", DB stores "tier")
--   computed max_commands / max_stacks from the tier

DROP VIEW IF EXISTS public.user_plan;

CREATE VIEW public.user_plan AS
SELECT
  id,

  -- Rename tier → plan so background.js can read row.plan directly
  tier                                          AS plan,

  subscription_status,
  current_period_end,
  cancel_at_period_end,
  ai_credits_remaining,
  ai_credits_reset_at,

  -- Derived limits (mirrors PLAN_LIMITS in gates.js)
  CASE tier
    WHEN 'free' THEN 25
    ELSE NULL          -- NULL = unlimited; background.js treats NULL as Infinity
  END                                           AS max_commands,

  CASE tier
    WHEN 'free' THEN 3
    ELSE NULL
  END                                           AS max_stacks

FROM public.profiles
WHERE id = auth.uid();   -- RLS-equivalent: users only see their own row


-- ── 3. Grant read access to authenticated users ──────────────────

GRANT SELECT ON public.user_plan TO authenticated;
