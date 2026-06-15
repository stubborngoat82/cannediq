-- ============================================================
-- cannedIQ — Admin & Maintenance Schema
-- Run in Supabase SQL editor (or via `supabase db push`).
-- ============================================================

-- ── Profiles: admin + suspension flags ───────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN profiles.is_admin   IS 'Grants access to cannediq.com/admin dashboard.';
COMMENT ON COLUMN profiles.suspended  IS 'When true, API calls return 403 and extension shows suspension notice.';
COMMENT ON COLUMN profiles.last_seen_at IS 'Updated by the extension on each successful API call.';

-- ── Maintenance config (singleton row) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_config (
  id               int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces singleton
  banner_message   text,          -- null = no banner; any text = shown in extension
  maintenance_mode boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES auth.users(id)
);

-- Seed the singleton row so it always exists
INSERT INTO maintenance_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE maintenance_config IS
  'Single-row table. banner_message non-null shows a bar in the extension. maintenance_mode = true blocks all commands.';

-- ── RLS on maintenance_config ─────────────────────────────────────────────────

ALTER TABLE maintenance_config ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated) can read — extension polls without a session
CREATE POLICY "Public read maintenance config"
  ON maintenance_config FOR SELECT
  USING (true);

-- Only admins can update via service-role Edge Function (RLS bypassed by service role)
-- No INSERT or DELETE policies needed — row is seeded above and never deleted

-- ── RLS on profiles: allow admins to read all profiles ───────────────────────

-- Drop existing select policy if present so we can replace it
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- ── Helper RPC: update_last_seen ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION update_last_seen() TO authenticated;
