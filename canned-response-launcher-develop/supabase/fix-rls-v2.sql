-- ============================================================
-- Fix RLS v2 — eliminates ALL recursive policy references
-- Run this in Supabase SQL Editor. It is safe to run multiple times.
-- ============================================================

-- ── 1. Drop every existing policy on the affected tables ─────

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles','teams','team_members','categories','responses')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 2. Drop old helper functions ─────────────────────────────

DROP FUNCTION IF EXISTS public.is_team_member(UUID);
DROP FUNCTION IF EXISTS public.is_team_admin(UUID);
DROP FUNCTION IF EXISTS public.can_read_category(UUID);
DROP FUNCTION IF EXISTS public.can_write_category(UUID);


-- ── 3. SECURITY DEFINER helpers ──────────────────────────────
-- These run as the function owner, bypassing RLS entirely.
-- Key rule: team_members policies must NOT call these functions
-- (that would re-enter team_members and loop). Only categories
-- and responses policies call them.

CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = p_team_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = p_team_id AND owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = p_team_id
        AND user_id = auth.uid()
        AND role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = p_team_id AND owner_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_category(p_cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_member(c.team_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_category(p_cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_admin(c.team_id))
      )
  );
$$;


-- ── 4. profiles ───────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own_row" ON public.profiles
  FOR ALL USING (auth.uid() = id);


-- ── 5. teams ──────────────────────────────────────────────────
-- Checks teams.owner_id (own table) — no cross-table reference needed for owner.
-- Member check uses is_team_member() which is SECURITY DEFINER → safe.

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT USING (
    owner_id = auth.uid()
    OR public.is_team_member(id)
  );

CREATE POLICY "teams_modify" ON public.teams
  FOR ALL USING (owner_id = auth.uid());


-- ── 6. team_members ───────────────────────────────────────────
-- These policies reference ONLY:
--   • auth.uid()              (built-in, no table)
--   • public.teams            (different table — no recursion)
-- They do NOT call is_team_member() or query team_members again.

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Any user can see their own membership rows
CREATE POLICY "team_members_own" ON public.team_members
  FOR SELECT USING (user_id = auth.uid());

-- Team owner can see all membership rows for their team
-- (checks teams table directly — no team_members self-reference)
CREATE POLICY "team_members_owner_select" ON public.team_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id
        AND t.owner_id = auth.uid()
    )
  );

-- Team owner can insert/update/delete membership rows
CREATE POLICY "team_members_owner_modify" ON public.team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_members.team_id
        AND t.owner_id = auth.uid()
    )
  );


-- ── 7. categories ─────────────────────────────────────────────

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

CREATE POLICY "categories_modify" ON public.categories
  FOR ALL USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  );


-- ── 8. responses ──────────────────────────────────────────────

ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "responses_select" ON public.responses
  FOR SELECT USING (public.can_read_category(category_id));

CREATE POLICY "responses_modify" ON public.responses
  FOR ALL USING (public.can_write_category(category_id));
