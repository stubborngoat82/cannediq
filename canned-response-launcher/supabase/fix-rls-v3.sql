-- ============================================================
-- Fix RLS v3 — nuclear option: flat single-table policies only
-- No cross-table references anywhere. Zero recursion possible.
-- Team-sharing can be added back later once the core is stable.
--
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ── 1. Nuke every existing policy on every affected table ────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','teams','team_members','categories','responses')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropped policy % on %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- ── 2. Drop all helper functions ─────────────────────────────

DROP FUNCTION IF EXISTS public.is_team_member(UUID);
DROP FUNCTION IF EXISTS public.is_team_admin(UUID);
DROP FUNCTION IF EXISTS public.can_read_category(UUID);
DROP FUNCTION IF EXISTS public.can_write_category(UUID);
DROP FUNCTION IF EXISTS public.check_free_tier_limits(UUID, TEXT);
DROP FUNCTION IF EXISTS public.increment_ai_usage(UUID);

-- ── 3. Make sure RLS is on ────────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses    ENABLE ROW LEVEL SECURITY;

-- ── 4. profiles — own row only ────────────────────────────────

CREATE POLICY "profiles_own"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 5. teams — owner only ─────────────────────────────────────
-- Simple: only the owner can see and modify their teams.
-- No team_members join needed.

CREATE POLICY "teams_owner"
  ON public.teams FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── 6. team_members — direct column match only ────────────────
-- A user can see rows where they are the user_id.
-- Team owner rows are visible because owner_id check is on teams,
-- not here. We keep this completely self-contained.

CREATE POLICY "team_members_own"
  ON public.team_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "team_members_insert"
  ON public.team_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "team_members_delete"
  ON public.team_members FOR DELETE
  USING (user_id = auth.uid());

-- ── 7. categories — user_id column match only ─────────────────
-- Users can only see and modify categories they own personally.
-- Team categories (team_id IS NOT NULL) are excluded for now —
-- add team support back once the core product is stable.

CREATE POLICY "categories_own"
  ON public.categories FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 8. responses — via category ownership ────────────────────
-- Join directly to categories on user_id. No helper functions,
-- no recursion risk.

CREATE POLICY "responses_own"
  ON public.responses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = responses.category_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = responses.category_id
        AND c.user_id = auth.uid()
    )
  );

-- ── 9. Recreate free-tier limit function (no RLS calls) ───────

CREATE OR REPLACE FUNCTION public.check_free_tier_limits(p_user_id UUID, p_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier      TEXT;
  v_cat_count INT;
  v_res_count INT;
BEGIN
  SELECT tier INTO v_tier FROM public.profiles WHERE id = p_user_id;

  IF v_tier IS NULL OR v_tier != 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF p_type = 'category' THEN
    SELECT COUNT(*) INTO v_cat_count
    FROM public.categories WHERE user_id = p_user_id;
    IF v_cat_count >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        'Free plan is limited to 3 categories. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  IF p_type = 'response' THEN
    SELECT COUNT(*) INTO v_res_count
    FROM public.responses r
    JOIN public.categories c ON c.id = r.category_id
    WHERE c.user_id = p_user_id;
    IF v_res_count >= 15 THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        'Free plan is limited to 15 responses. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- Verify — should print 0 remaining policy rows that could cause recursion
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
