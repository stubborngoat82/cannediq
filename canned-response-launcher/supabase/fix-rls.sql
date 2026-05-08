-- ============================================================
-- Fix: infinite recursion in RLS policies
-- Run this in Supabase SQL editor to replace the broken policies.
-- ============================================================

-- ── Drop the circular policies ───────────────────────────────

DROP POLICY IF EXISTS "teams: member can read"           ON public.teams;
DROP POLICY IF EXISTS "teams: owner can modify"          ON public.teams;
DROP POLICY IF EXISTS "team_members: member can read"    ON public.team_members;
DROP POLICY IF EXISTS "team_members: owner can manage"   ON public.team_members;
DROP POLICY IF EXISTS "categories: owner or team member can read"   ON public.categories;
DROP POLICY IF EXISTS "categories: owner or team admin can write"   ON public.categories;
DROP POLICY IF EXISTS "responses: can read if category readable"    ON public.responses;
DROP POLICY IF EXISTS "responses: can write if category writable"   ON public.responses;


-- ── SECURITY DEFINER helpers (bypass RLS, no recursion) ──────

-- Is the calling user a member (or owner) of a given team?
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  );
$$;

-- Is the calling user an admin/owner of a given team?
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  );
$$;


-- ── teams policies ────────────────────────────────────────────

CREATE POLICY "teams: owner or member can read" ON public.teams
  FOR SELECT USING (
    owner_id = auth.uid() OR public.is_team_member(id)
  );

CREATE POLICY "teams: owner can modify" ON public.teams
  FOR ALL USING (owner_id = auth.uid());


-- ── team_members policies ─────────────────────────────────────
-- Simple: you can always see your own membership rows.
-- Team owner can see and manage all rows for their team.

CREATE POLICY "team_members: see own rows" ON public.team_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "team_members: owner sees all rows" ON public.team_members
  FOR SELECT USING (public.is_team_member(team_id));

CREATE POLICY "team_members: owner can manage" ON public.team_members
  FOR ALL USING (public.is_team_admin(team_id));


-- ── categories policies ───────────────────────────────────────

CREATE POLICY "categories: owner or team member can read" ON public.categories
  FOR SELECT USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

CREATE POLICY "categories: owner or team admin can write" ON public.categories
  FOR ALL USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  );


-- ── responses policies ────────────────────────────────────────

-- Drop and recreate the helper functions that also had the recursion risk
CREATE OR REPLACE FUNCTION public.can_read_category(cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_member(c.team_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_category(cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_admin(c.team_id))
      )
  );
$$;

CREATE POLICY "responses: can read if category readable" ON public.responses
  FOR SELECT USING (public.can_read_category(category_id));

CREATE POLICY "responses: can write if category writable" ON public.responses
  FOR ALL USING (public.can_write_category(category_id));
