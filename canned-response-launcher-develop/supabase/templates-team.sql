-- ============================================================
-- cannedIQ — Team Template Purchasing
-- Run after templates.sql.
-- ============================================================

-- Add team_id to user_template_purchases so a single owner
-- purchase grants access to all team members.

ALTER TABLE user_template_purchases
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_template_purchases_team
  ON user_template_purchases (team_id);

COMMENT ON COLUMN user_template_purchases.team_id IS
  'When set, this is a team purchase. All members of this team have access to the pack.';

-- Update the RLS policy so members can see team purchases

DROP POLICY IF EXISTS "Users can view own purchases" ON user_template_purchases;

CREATE POLICY "Users can view own or team purchases"
  ON user_template_purchases FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR (
      team_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_id = user_template_purchases.team_id
          AND user_id = (select auth.uid())
      )
    )
  );

-- Update template_commands RLS to also allow team members access

DROP POLICY IF EXISTS "Purchased users can read template commands" ON template_commands;

CREATE POLICY "Purchased users can read template commands"
  ON template_commands FOR SELECT
  USING (
    -- Free packs
    EXISTS (
      SELECT 1 FROM template_packs tp
      WHERE tp.id = pack_id AND tp.price_cents = 0
    )
    -- Individual purchase
    OR EXISTS (
      SELECT 1 FROM user_template_purchases utp
      WHERE utp.pack_id = pack_id
        AND utp.user_id = (select auth.uid())
    )
    -- Team purchase — user is a member of the purchasing team
    OR EXISTS (
      SELECT 1 FROM user_template_purchases utp
      JOIN team_members tm ON tm.team_id = utp.team_id
      WHERE utp.pack_id = pack_id
        AND utp.team_id IS NOT NULL
        AND tm.user_id = (select auth.uid())
    )
  );
