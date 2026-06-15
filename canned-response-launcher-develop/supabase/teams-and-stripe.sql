-- ================================================================
-- Teams + Stripe Migration
-- Run AFTER fix-rls-v3.sql (which must already be applied).
--
-- What this does:
--   1. Adds Stripe billing columns to profiles
--   2. Ensures team_members has a unique constraint
--   3. Replaces the flat category/response policies with
--      team-aware versions using SECURITY DEFINER helpers
--   4. Adds team SELECT policy so members can see their teams
--   5. Adds increment_response_use_count RPC (atomic)
--   6. Adds invite_team_member RPC
-- ================================================================


-- ── 1. Stripe columns on profiles ────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'inactive';

-- Also expose subscription_status in the getProfile() query
-- (no schema change needed — just a reminder to update the SELECT in api-client.js)


-- ── 2. Ensure team_members unique constraint exists ───────────────
-- Safe to run even if the constraint already exists.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'team_members_team_id_user_id_key'
      AND table_name = 'team_members'
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
  END IF;
END
$$;


-- ── 3. Drop policies we are replacing ────────────────────────────

-- Flat single-owner category/response policies (from fix-rls-v3.sql)
DROP POLICY IF EXISTS "categories_own"   ON public.categories;
DROP POLICY IF EXISTS "responses_own"    ON public.responses;

-- Teams all-in-one owner policy — we'll replace with granular ones
DROP POLICY IF EXISTS "teams_owner"      ON public.teams;

-- Previous v2 policies (in case someone ran fix-rls-v2.sql before v3)
DROP POLICY IF EXISTS "categories_select"  ON public.categories;
DROP POLICY IF EXISTS "categories_modify"  ON public.categories;
DROP POLICY IF EXISTS "categories_insert"  ON public.categories;
DROP POLICY IF EXISTS "categories_update"  ON public.categories;
DROP POLICY IF EXISTS "categories_delete"  ON public.categories;
DROP POLICY IF EXISTS "responses_select"   ON public.responses;
DROP POLICY IF EXISTS "responses_modify"   ON public.responses;
DROP POLICY IF EXISTS "responses_insert"   ON public.responses;
DROP POLICY IF EXISTS "responses_update"   ON public.responses;
DROP POLICY IF EXISTS "responses_delete"   ON public.responses;
DROP POLICY IF EXISTS "teams_select"       ON public.teams;
DROP POLICY IF EXISTS "teams_modify"       ON public.teams;
DROP POLICY IF EXISTS "teams_insert"       ON public.teams;
DROP POLICY IF EXISTS "teams_update"       ON public.teams;
DROP POLICY IF EXISTS "teams_delete"       ON public.teams;
DROP POLICY IF EXISTS "teams_member_select" ON public.teams;


-- ── 4. SECURITY DEFINER helper functions ─────────────────────────
--
-- SECURITY DEFINER means the function runs as its owner (postgres)
-- and bypasses RLS on every table it touches internally.
-- This is the safe pattern to avoid RLS recursion:
--   • The team_members policies use only auth.uid() — no helper calls
--   • The categories/responses policies call these helpers safely
--   • The helpers read team_members / teams without triggering their policies

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
        AND role IN ('owner', 'admin')
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


-- ── 5. Teams policies ─────────────────────────────────────────────
--
-- is_team_member(id) is called from the SELECT policy on teams.
-- Inside is_team_member, team_members is read via SECURITY DEFINER
-- (bypasses team_members RLS) — no recursion possible.

CREATE POLICY "teams_select"
  ON public.teams FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_team_member(id)
  );

CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "teams_delete"
  ON public.teams FOR DELETE
  USING (owner_id = auth.uid());


-- ── 6. Categories policies (team-aware) ──────────────────────────
-- Personal categories: user_id = auth.uid()
-- Team categories:     team_id IS NOT NULL AND caller is a member/admin

CREATE POLICY "categories_select"
  ON public.categories FOR SELECT
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id))
  );

CREATE POLICY "categories_insert"
  ON public.categories FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  );

CREATE POLICY "categories_update"
  ON public.categories FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  );

CREATE POLICY "categories_delete"
  ON public.categories FOR DELETE
  USING (
    user_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_admin(team_id))
  );


-- ── 7. Responses policies (team-aware via category helpers) ───────
-- We delegate to can_read_category / can_write_category so all
-- team membership logic stays in one place.

CREATE POLICY "responses_select"
  ON public.responses FOR SELECT
  USING (public.can_read_category(category_id));

CREATE POLICY "responses_insert"
  ON public.responses FOR INSERT
  WITH CHECK (public.can_write_category(category_id));

CREATE POLICY "responses_update"
  ON public.responses FOR UPDATE
  USING (public.can_write_category(category_id));

CREATE POLICY "responses_delete"
  ON public.responses FOR DELETE
  USING (public.can_write_category(category_id));


-- ── 8. increment_response_use_count RPC (atomic) ─────────────────
-- SECURITY DEFINER so it can update any response the caller can read,
-- without requiring them to have UPDATE permission on the raw row.

CREATE OR REPLACE FUNCTION public.increment_response_use_count(p_response_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.responses
  SET use_count = COALESCE(use_count, 0) + 1
  WHERE id = p_response_id
    AND public.can_read_category(category_id);  -- safety: caller must be able to read it
END;
$$;


-- ── 9. invite_team_member RPC ─────────────────────────────────────
-- Only the team owner can invite. Looks up the invitee by email in
-- auth.users (SECURITY DEFINER lets us read that table).

CREATE OR REPLACE FUNCTION public.invite_team_member(p_team_id UUID, p_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invitee_id UUID;
  v_is_owner   BOOLEAN;
BEGIN
  -- Verify caller owns the team
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only the team owner can invite members.');
  END IF;

  -- Look up user by email
  SELECT id INTO v_invitee_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_invitee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No account found with that email. Ask them to sign up for Canned Response Launcher first.');
  END IF;

  IF v_invitee_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You are already the team owner.');
  END IF;

  -- Insert (idempotent — ignore if already a member)
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (p_team_id, v_invitee_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── 10. remove_team_member RPC ────────────────────────────────────
-- Team owner can remove any member. Members can remove themselves.

CREATE OR REPLACE FUNCTION public.remove_team_member(p_team_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only the team owner can remove other members.');
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── Verify ────────────────────────────────────────────────────────
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
