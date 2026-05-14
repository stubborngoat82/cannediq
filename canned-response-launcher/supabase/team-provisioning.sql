-- ================================================================
-- Team Provisioning — Admin-Created Member Accounts
-- Run AFTER team-seats.sql.
--
-- The owner creates accounts on behalf of team members. Members
-- receive an email with their credentials and are immediately
-- added to the team — no invite link flow required.
--
-- What this does:
--   1. Adds provisioning metadata to team_members
--   2. Adds must_change_password flag to profiles
--   3. Creates get_team_member_details RPC — joins auth.users for
--      email + last_sign_in_at (SECURITY DEFINER, owner only)
--   4. Creates set_member_password_changed RPC — member calls this
--      after changing their temp password
-- ================================================================


-- ── 1. Provisioning metadata on team_members ──────────────────────

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS provisioned_by  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS provisioned_at  TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS temp_password   BOOLEAN     DEFAULT false;
-- temp_password = true means the member was provisioned with a
-- system-generated password and must change it on first login.


-- ── 2. must_change_password flag on profiles ──────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS provisioned_team_id  UUID REFERENCES public.teams(id);
-- provisioned_team_id identifies which team this account was created
-- for — lets the extension auto-select the right team on first load.


-- ── 3. get_team_member_details RPC ───────────────────────────────
-- Readable only by the team owner (enforced inside the function).
-- Joins auth.users to surface email + last_sign_in_at, which are
-- not otherwise accessible from client-side code.
--
-- Returns JSON array of:
-- {
--   user_id, email, role, provisioned_at, temp_password,
--   last_sign_in_at  (null = never signed in)
-- }

CREATE OR REPLACE FUNCTION public.get_team_member_details(p_team_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_result   JSONB;
BEGIN
  -- Only the team owner may query member details
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id',        tm.user_id,
      'email',          u.email,
      'role',           tm.role,
      'provisioned_at', tm.provisioned_at,
      'temp_password',  COALESCE(tm.temp_password, false),
      'last_sign_in_at', u.last_sign_in_at
    )
    ORDER BY tm.provisioned_at ASC
  )
  INTO v_result
  FROM public.team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_member_details(UUID) TO authenticated;


-- ── 4. set_member_password_changed RPC ───────────────────────────
-- Called by the member after they successfully change their
-- temp password. Clears must_change_password and temp_password.

CREATE OR REPLACE FUNCTION public.set_member_password_changed()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Clear must_change_password on the caller's profile
  UPDATE public.profiles
  SET must_change_password = false
  WHERE id = auth.uid();

  -- Clear temp_password flag on all their team_member rows
  UPDATE public.team_members
  SET temp_password = false
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_member_password_changed() TO authenticated;


-- ── Verify ────────────────────────────────────────────────────────
SELECT 'team-provisioning migration ready' AS status;
