-- ================================================================
-- Team Seat Tracking
-- Run AFTER team-invites.sql.
--
-- What this does:
--   1. Adds seats_purchased column to teams (default 1 = owner only)
--   2. Creates team_seat_usage view — counts owner + active members
--   3. Adds seats info to get_invite_preview RPC
--   4. Replaces accept_team_invite RPC with seat-aware version
--   5. Adds check_team_seat_available(team_id) helper
--      (used by send-team-invite Edge Function via RPC)
-- ================================================================


-- ── 1. seats_purchased on teams ───────────────────────────────────
-- Default 1 = just the owner. When a team Stripe subscription is
-- purchased for N seats, the webhook writes N here.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS seats_purchased INTEGER NOT NULL DEFAULT 1;


-- ── 2. team_seat_usage view ───────────────────────────────────────
-- Returns per-team counts:
--   seats_purchased — from teams row
--   members_count   — accepted team_members rows (excludes owner)
--   seats_used      — owner (1) + members_count
--   seats_available — seats_purchased - seats_used

CREATE OR REPLACE VIEW public.team_seat_usage AS
SELECT
  t.id                                        AS team_id,
  t.owner_id,
  t.seats_purchased,
  COUNT(tm.user_id)                           AS members_count,
  (1 + COUNT(tm.user_id))                     AS seats_used,
  GREATEST(0, t.seats_purchased - (1 + COUNT(tm.user_id))) AS seats_available
FROM public.teams t
LEFT JOIN public.team_members tm ON tm.team_id = t.id
GROUP BY t.id, t.owner_id, t.seats_purchased;

-- RLS note: the view inherits its access from teams + team_members,
-- but we expose it via a SECURITY DEFINER function below.


-- ── 3. check_team_seat_available RPC ─────────────────────────────
-- Returns { available: boolean, seats_used: int, seats_purchased: int }
-- Called by the send-team-invite Edge Function (service role) and
-- optionally by the options page to render seat indicators.

CREATE OR REPLACE FUNCTION public.check_team_seat_available(p_team_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_seats_purchased INTEGER;
  v_seats_used      BIGINT;
BEGIN
  SELECT
    t.seats_purchased,
    1 + COUNT(tm.user_id)
  INTO v_seats_purchased, v_seats_used
  FROM public.teams t
  LEFT JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = p_team_id
  GROUP BY t.seats_purchased;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'error', 'Team not found');
  END IF;

  RETURN jsonb_build_object(
    'available',       v_seats_used < v_seats_purchased,
    'seats_used',      v_seats_used,
    'seats_purchased', v_seats_purchased,
    'seats_available', GREATEST(0, v_seats_purchased - v_seats_used)
  );
END;
$$;

-- Allow service-role and authenticated users to call this
GRANT EXECUTE ON FUNCTION public.check_team_seat_available(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_team_seat_available(UUID) TO service_role;


-- ── 4. Replace accept_team_invite with seat-aware version ─────────
-- Adds a seat check before inserting into team_members.

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite          public.team_invites%ROWTYPE;
  v_team_name       TEXT;
  v_seats_purchased INTEGER;
  v_seats_used      BIGINT;
BEGIN
  -- Find a valid pending invite
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

  -- Don't add team owner as member
  IF auth.uid() = (SELECT owner_id FROM public.teams WHERE id = v_invite.team_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'You are the owner of this team.'
    );
  END IF;

  -- ── Seat check ────────────────────────────────────────────────
  SELECT
    t.seats_purchased,
    1 + COUNT(tm.user_id)
  INTO v_seats_purchased, v_seats_used
  FROM public.teams t
  LEFT JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = v_invite.team_id
  GROUP BY t.seats_purchased;

  -- If the invitee is already a member, skip seat check (idempotent accept)
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

  -- Add to team (idempotent)
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (v_invite.team_id, auth.uid(), 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Mark invite as accepted
  UPDATE public.team_invites
  SET status      = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now()
  WHERE id = v_invite.id;

  -- Return team name for the success screen
  SELECT name INTO v_team_name
  FROM public.teams
  WHERE id = v_invite.team_id;

  RETURN jsonb_build_object(
    'success',   true,
    'team_id',   v_invite.team_id,
    'team_name', v_team_name
  );
END;
$$;


-- ── 5. Update get_invite_preview to include seat info ─────────────
-- Lets the accept page warn the user if the team is full before
-- they go through the sign-up/sign-in flow.

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite          public.team_invites%ROWTYPE;
  v_team_name       TEXT;
  v_seats_purchased INTEGER;
  v_seats_used      BIGINT;
BEGIN
  SELECT * INTO v_invite
  FROM public.team_invites
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT name INTO v_team_name
  FROM public.teams
  WHERE id = v_invite.team_id;

  -- Seat snapshot (informational — actual enforcement is in accept RPC)
  SELECT
    t.seats_purchased,
    1 + COUNT(tm.user_id)
  INTO v_seats_purchased, v_seats_used
  FROM public.teams t
  LEFT JOIN public.team_members tm ON tm.team_id = t.id
  WHERE t.id = v_invite.team_id
  GROUP BY t.seats_purchased;

  RETURN jsonb_build_object(
    'found',           true,
    'team_name',       v_team_name,
    'status',          v_invite.status,
    'expired',         v_invite.expires_at < now(),
    'seats_purchased', v_seats_purchased,
    'seats_used',      v_seats_used,
    'seats_available', GREATEST(0, v_seats_purchased - v_seats_used)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_preview(UUID) TO anon;


-- ── Verify ────────────────────────────────────────────────────────
SELECT 'team_seats migration ready' AS status;
