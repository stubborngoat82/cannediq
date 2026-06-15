-- ============================================================
-- cannedIQ — RLS Performance Fix
-- Replaces auth.uid() with (select auth.uid()) in all policies
-- so Postgres evaluates the function ONCE per query, not per row.
--
-- Run in Supabase SQL editor. Safe to re-run.
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_own"          ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_all"          ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ── teams ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "teams_owner_all"   ON public.teams;
DROP POLICY IF EXISTS "teams_select"      ON public.teams;
DROP POLICY IF EXISTS "teams_insert"      ON public.teams;
DROP POLICY IF EXISTS "teams_update"      ON public.teams;
DROP POLICY IF EXISTS "teams_delete"      ON public.teams;

-- Owners can do everything; members can read their teams
CREATE POLICY "teams_select" ON public.teams
  FOR SELECT USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = id AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE USING (owner_id = (select auth.uid()));

-- ── team_members ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "team_members_select"   ON public.team_members;
DROP POLICY IF EXISTS "team_members_insert"   ON public.team_members;
DROP POLICY IF EXISTS "team_members_update"   ON public.team_members;
DROP POLICY IF EXISTS "team_members_delete"   ON public.team_members;
DROP POLICY IF EXISTS "members_select"        ON public.team_members;
DROP POLICY IF EXISTS "members_owner_manage"  ON public.team_members;

-- Members can see others in the same team; owners can manage
CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.team_members tm2
      WHERE tm2.team_id = team_id AND tm2.user_id = (select auth.uid())
    )
  );

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_id AND owner_id = (select auth.uid())
    )
  );

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_id AND owner_id = (select auth.uid())
    )
  );

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE USING (
    user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_id AND owner_id = (select auth.uid())
    )
  );

-- ── team_invites ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "invites_owner_all"    ON public.team_invites;
DROP POLICY IF EXISTS "invites_select"       ON public.team_invites;
DROP POLICY IF EXISTS "invites_insert"       ON public.team_invites;
DROP POLICY IF EXISTS "invites_update"       ON public.team_invites;
DROP POLICY IF EXISTS "invites_delete"       ON public.team_invites;

CREATE POLICY "invites_select" ON public.team_invites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "invites_insert" ON public.team_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "invites_update" ON public.team_invites
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "invites_delete" ON public.team_invites
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_id AND t.owner_id = (select auth.uid())
    )
  );

-- ── team_commands ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "team_commands_select" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_insert" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_update" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_delete" ON public.team_commands;

CREATE POLICY "team_commands_select" ON public.team_commands
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = team_commands.team_id AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "team_commands_insert" ON public.team_commands
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = team_commands.team_id
        AND user_id = (select auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_commands_update" ON public.team_commands
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = team_commands.team_id
        AND user_id = (select auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team_commands_delete" ON public.team_commands
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = team_commands.team_id
        AND user_id = (select auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- ── eula_acceptances ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own EULA acceptances"  ON public.eula_acceptances;
DROP POLICY IF EXISTS "Users can insert own EULA acceptance" ON public.eula_acceptances;

CREATE POLICY "eula_select" ON public.eula_acceptances
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "eula_insert" ON public.eula_acceptances
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- ── maintenance_config ────────────────────────────────────────────────────────
-- Public read policy has no auth.uid() call — already optimal, no change needed.
