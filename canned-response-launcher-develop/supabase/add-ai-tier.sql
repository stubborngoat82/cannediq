-- Migration: add 'ai' as a valid tier value
--
-- Run this against your Supabase project to fix the profiles_tier_check
-- constraint violation when a user purchases the Pro + AI plan.

-- 1. Drop the old constraint and recreate it with 'ai' included
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tier_check
    CHECK (tier IN ('free', 'pro', 'ai', 'team'));
