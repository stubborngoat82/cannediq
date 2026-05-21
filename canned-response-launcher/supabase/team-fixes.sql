-- Team fixes migration
-- Fixes: seat race condition, role management, expired invite seat leak,
--        RLS policy cleanup, and admin privilege gaps.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Fix accept_team_invite — set tier = 'team' when member joins
--    The original RPC adds the member row but never updates profiles.tier,
--    leaving the user on 'free' with no access to team features.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite          public.team_invites%ROWTYPE;
  v_team_name       TEXT;
  v_seats_purchased INTEGER;
  v_seats_used      BIGINT;
BEGIN
  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE token     = p_token
    AND status    = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'This invite link is no longer valid. Ask your team owner to send a new one.'
    );
  END IF;

  IF auth.uid() = (SELECT owner_id FROM public.teams WHERE id = v_invite.team_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are the owner of this team.');
  END IF;

  SELECT
    t.seats_purchased,
    1 + COUNT(tm.user_id)
  INTO v_seats_purchased, v_seats_used
  FROM public.teams t
  LEFT JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = v_invite.team_id
  GROUP BY t.seats_purchased;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = v_invite.team_id AND user_id = auth.uid()
  ) THEN
    IF v_seats_used >= v_seats_purchased THEN
      RETURN jsonb_build_object(
        'success', false,
        'error',   'This team has reached its seat limit. Ask the owner to purchase additional seats.'
      );
    END IF;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_invite.team_id, auth.uid(), 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Upgrade the joining member's tier to 'team'
  UPDATE public.profiles
  SET tier = 'team'
  WHERE id = auth.uid()
    AND tier IN ('free', 'pro');

  UPDATE public.team_invites
  SET status      = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  WHERE id = v_invite.id;

  SELECT name INTO v_team_name FROM public.teams WHERE id = v_invite.team_id;

  RETURN jsonb_build_object('success', true, 'team_id', v_invite.team_id, 'team_name', v_team_name);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0b. Back-fill tier for existing team members who are still on 'free'
--     Safe to re-run: only touches users who are in a team but still free.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles p
SET tier = 'team'
WHERE tier = 'free'
  AND (
    EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.user_id = p.id)
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.owner_id = p.id)
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix team_seat_usage view to exclude expired invites
--    (was counting expired pending invites as consumed seats)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.team_seat_usage;

CREATE VIEW public.team_seat_usage AS
SELECT
  t.id                                                          AS team_id,
  t.seats_purchased,
  1 + COALESCE(m.member_count, 0) + COALESCE(i.pending_count, 0) AS seats_used
FROM public.teams t
LEFT JOIN (
  SELECT team_id, COUNT(*)::int AS member_count
  FROM public.team_members
  GROUP BY team_id
) m ON m.team_id = t.id
LEFT JOIN (
  SELECT team_id, COUNT(*)::int AS pending_count
  FROM public.team_invites
  WHERE status = 'pending'
    AND expires_at > NOW()
  GROUP BY team_id
) i ON i.team_id = t.id;

GRANT SELECT ON public.team_seat_usage TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Atomic seat-check + invite creation RPC
--    Prevents concurrent-invite race conditions by holding a row-level lock
--    on the team row before checking capacity.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_team_invite(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_team_invite(
  p_team_id UUID,
  p_email   TEXT
)
RETURNS TABLE (invite_id UUID, token UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          UUID  := auth.uid();
  v_seats_purchased INT;
  v_seats_used      INT;
  v_invite_id       UUID;
  v_token           UUID  := gen_random_uuid();
  v_is_authorized   BOOL  := FALSE;
BEGIN
  -- Verify caller is owner or admin of this team
  SELECT TRUE INTO v_is_authorized
  FROM public.teams t
  WHERE t.id = p_team_id
    AND (
      t.owner_id = v_caller
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = p_team_id
          AND tm.user_id = v_caller
          AND tm.role IN ('owner', 'admin')
      )
    );

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0401';
  END IF;

  -- Lock team row to prevent concurrent oversell
  SELECT seats_purchased INTO v_seats_purchased
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  SELECT seats_used INTO v_seats_used
  FROM public.team_seat_usage
  WHERE team_id = p_team_id;

  IF v_seats_used >= v_seats_purchased THEN
    RAISE EXCEPTION 'no_seats_available' USING ERRCODE = 'P0402';
  END IF;

  -- Revoke any live pending invite for this email (resend scenario).
  -- Revoking first means the seat count drops before we re-check capacity,
  -- so a resend never incorrectly blocks on a "full" team.
  UPDATE public.team_invites
  SET status = 'revoked'
  WHERE team_id = p_team_id
    AND email = LOWER(p_email)
    AND status = 'pending';

  -- Create the invite
  INSERT INTO public.team_invites (team_id, email, token, status, expires_at)
  VALUES (p_team_id, LOWER(p_email), v_token, 'pending', NOW() + INTERVAL '7 days')
  RETURNING id INTO v_invite_id;

  RETURN QUERY SELECT v_invite_id, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_team_invite(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team_invite(UUID, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Role management RPC (promote / demote members)
--    Only team owner can change roles. Owners cannot be demoted via this RPC.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_member_role(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_team_id  UUID,
  p_user_id  UUID,
  p_new_role TEXT  -- 'admin' or 'member'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- Only owner can manage roles
  IF NOT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = v_caller
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0401';
  END IF;

  -- Validate role value
  IF p_new_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = 'P0400';
  END IF;

  -- Cannot change the owner's own role
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot_change_owner_role' USING ERRCODE = 'P0400';
  END IF;

  UPDATE public.team_members
  SET role = p_new_role
  WHERE team_id = p_team_id
    AND user_id = p_user_id
    AND role != 'owner';  -- safety: never demote an owner row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found' USING ERRCODE = 'P0404';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_role(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_member_role(UUID, UUID, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cancel invite RPC (owner or admin)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cancel_team_invite(UUID, UUID);

CREATE OR REPLACE FUNCTION public.cancel_team_invite(
  p_team_id   UUID,
  p_invite_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND owner_id = v_caller)
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = p_team_id AND user_id = v_caller AND role IN ('owner', 'admin')
    )
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0401';
  END IF;

  UPDATE public.team_invites
  SET status = 'cancelled'
  WHERE id = p_invite_id
    AND team_id = p_team_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0404';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_team_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_team_invite(UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helper: is_team_admin — used by edge functions + RLS policies
--    Returns true if caller is owner OR has admin role in the team.
--    (Replaces inline subquery patterns in policies to avoid recursion risk.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = p_team_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_team_admin(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Update team_commands RLS policies to use helper function
--    (cleaner and avoids subquery-recursion risk)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "team_commands_select" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_insert" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_update" ON public.team_commands;
DROP POLICY IF EXISTS "team_commands_delete" ON public.team_commands;

-- Members can read their team's commands
CREATE POLICY "team_commands_select" ON public.team_commands
  FOR SELECT USING (
    public.is_team_member(team_id)
  );

-- Only admins/owners can write
CREATE POLICY "team_commands_insert" ON public.team_commands
  FOR INSERT WITH CHECK (
    public.is_team_admin(team_id)
  );

CREATE POLICY "team_commands_update" ON public.team_commands
  FOR UPDATE USING (
    public.is_team_admin(team_id)
  );

CREATE POLICY "team_commands_delete" ON public.team_commands
  FOR DELETE USING (
    public.is_team_admin(team_id)
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Get pending invites for a team (visible to owner + admin)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_team_invites(UUID);

CREATE OR REPLACE FUNCTION public.get_team_invites(p_team_id UUID)
RETURNS TABLE (
  id         UUID,
  email      TEXT,
  status     TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_team_admin(p_team_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0401';
  END IF;

  RETURN QUERY
  SELECT ti.id, ti.email, ti.status, ti.expires_at, ti.created_at
  FROM public.team_invites ti
  WHERE ti.team_id = p_team_id
    AND ti.status = 'pending'
    AND ti.expires_at > NOW()
  ORDER BY ti.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_invites(UUID) TO authenticated;
