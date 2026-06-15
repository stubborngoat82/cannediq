-- ─────────────────────────────────────────────────────────────────────────────
-- team_commands.sql
-- Shared command library for teams.
-- Each row stores a full CRL command object as JSONB.
-- Team members can read; team owners/admins can write.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.team_commands (
  id           TEXT        PRIMARY KEY,               -- matches command.id
  team_id      UUID        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  stack_id     TEXT        NOT NULL DEFAULT 'general',
  stack_name   TEXT        NOT NULL DEFAULT 'Shared',
  stack_color  TEXT        NOT NULL DEFAULT '#7c3aed',
  stack_icon   TEXT        NOT NULL DEFAULT '🏢',
  command_data JSONB       NOT NULL,                  -- full CRL command object
  created_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_commands_team_id_idx ON public.team_commands(team_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_team_commands_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_commands_updated_at ON public.team_commands;
CREATE TRIGGER trg_team_commands_updated_at
  BEFORE UPDATE ON public.team_commands
  FOR EACH ROW EXECUTE FUNCTION update_team_commands_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_commands ENABLE ROW LEVEL SECURITY;

-- Any team member can read their team's commands
CREATE POLICY "team_members_can_read_commands"
  ON public.team_commands FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT id FROM public.teams WHERE owner_id = auth.uid()
    )
  );

-- Team owners and members with admin role can insert
CREATE POLICY "team_owners_can_insert_commands"
  ON public.team_commands FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT id FROM public.teams WHERE owner_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Same for update
CREATE POLICY "team_owners_can_update_commands"
  ON public.team_commands FOR UPDATE
  USING (
    team_id IN (
      SELECT id FROM public.teams WHERE owner_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Same for delete
CREATE POLICY "team_owners_can_delete_commands"
  ON public.team_commands FOR DELETE
  USING (
    team_id IN (
      SELECT id FROM public.teams WHERE owner_id = auth.uid()
    )
    OR
    team_id IN (
      SELECT team_id FROM public.team_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Upsert RPC ────────────────────────────────────────────────────────────────
-- Called by the extension import flow. Upserts many commands in one shot.

CREATE OR REPLACE FUNCTION public.upsert_team_commands(
  p_team_id    UUID,
  p_commands   JSONB   -- array of { id, stack_id, stack_name, stack_color, stack_icon, command_data }
)
RETURNS INT              -- number of rows upserted
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cmd    JSONB;
  v_count  INT := 0;
  v_caller UUID := auth.uid();
  v_is_authorized BOOLEAN;
BEGIN
  -- Check the caller is owner or admin of the team
  SELECT EXISTS (
    SELECT 1 FROM public.teams    WHERE id = p_team_id AND owner_id = v_caller
    UNION ALL
    SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND user_id = v_caller AND role = 'admin'
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to manage commands for this team' USING ERRCODE = 'P0001';
  END IF;

  FOR v_cmd IN SELECT * FROM jsonb_array_elements(p_commands)
  LOOP
    INSERT INTO public.team_commands
      (id, team_id, stack_id, stack_name, stack_color, stack_icon, command_data, created_by)
    VALUES (
      v_cmd->>'id',
      p_team_id,
      COALESCE(v_cmd->>'stack_id',    'general'),
      COALESCE(v_cmd->>'stack_name',  'Shared'),
      COALESCE(v_cmd->>'stack_color', '#7c3aed'),
      COALESCE(v_cmd->>'stack_icon',  '🏢'),
      v_cmd->'command_data',
      v_caller
    )
    ON CONFLICT (id) DO UPDATE SET
      stack_id     = EXCLUDED.stack_id,
      stack_name   = EXCLUDED.stack_name,
      stack_color  = EXCLUDED.stack_color,
      stack_icon   = EXCLUDED.stack_icon,
      command_data = EXCLUDED.command_data,
      updated_at   = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
