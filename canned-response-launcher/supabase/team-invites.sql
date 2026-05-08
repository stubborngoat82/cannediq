-- ================================================================
-- Team Invites
-- Run AFTER teams-and-stripe.sql.
--
-- Replaces the lookup-by-email invite system with token-based
-- invite links. Owner sends a link; recipient clicks it,
-- signs up or signs in, and is automatically added to the team.
-- No coordination required from the invitee's side.
-- ================================================================


-- ── 1. team_invites table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES auth.users(id),
  email        TEXT NOT NULL,
  token        UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | revoked
  accepted_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at  TIMESTAMPTZ
);

-- Ensure one active invite per team+email at a time
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_team_email_pending_idx
  ON public.team_invites (team_id, email)
  WHERE status = 'pending';

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;


-- ── 2. RLS on team_invites ────────────────────────────────────────
-- Team owners can see and manage all invites for their teams.
-- No public read access — invite details are only visible to owners.
-- The accept flow goes through a SECURITY DEFINER RPC, not direct table access.

DROP POLICY IF EXISTS "invites_owner_all"  ON public.team_invites;
DROP POLICY IF EXISTS "invites_owner_select" ON public.team_invites;
DROP POLICY IF EXISTS "invites_owner_insert" ON public.team_invites;
DROP POLICY IF EXISTS "invites_owner_delete" ON public.team_invites;

-- Owner of the team can SELECT/INSERT/DELETE invite rows
CREATE POLICY "invites_owner_all" ON public.team_invites
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_invites.team_id
        AND t.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = team_invites.team_id
        AND t.owner_id = auth.uid()
    )
  );


-- ── 3. accept_team_invite RPC ─────────────────────────────────────
-- Called by the accept page after the user authenticates.
-- SECURITY DEFINER so it can write to team_members and team_invites
-- regardless of the caller's RLS permissions.

CREATE OR REPLACE FUNCTION public.accept_team_invite(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite    public.team_invites%ROWTYPE;
  v_team_name TEXT;
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


-- ── 4. revoke_team_invite RPC ─────────────────────────────────────
-- Owner can revoke a pending invite before it is accepted.

CREATE OR REPLACE FUNCTION public.revoke_team_invite(p_invite_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.team_invites i
    JOIN public.teams t ON t.id = i.team_id
    WHERE i.id = p_invite_id
      AND t.owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized.');
  END IF;

  UPDATE public.team_invites
  SET status = 'revoked'
  WHERE id = p_invite_id AND status = 'pending';

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── 5. get_invite_preview — public-safe lookup ────────────────────
-- Returns only the team name and invite status for a given token.
-- Used server-side by the accept Edge Function to render the page.
-- No auth required (accessible via anon key).

CREATE OR REPLACE FUNCTION public.get_invite_preview(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite    public.team_invites%ROWTYPE;
  v_team_name TEXT;
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

  RETURN jsonb_build_object(
    'found',      true,
    'team_name',  v_team_name,
    'status',     v_invite.status,
    'expired',    v_invite.expires_at < now()
  );
END;
$$;

-- Grant anon role execute so the accept page can call it without auth
GRANT EXECUTE ON FUNCTION public.get_invite_preview(UUID) TO anon;


-- ── Verify ────────────────────────────────────────────────────────
SELECT 'team_invites table ready' AS status;
