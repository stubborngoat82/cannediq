-- ============================================================
-- cannedIQ — EULA Acceptances
-- Run this migration once in the Supabase SQL editor (or via
-- `supabase db push`).
-- ============================================================

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eula_acceptances (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eula_version  text        NOT NULL,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  user_agent    text,

  -- A user can only accept a given version once
  UNIQUE (user_id, eula_version)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_eula_acceptances_user_id
  ON eula_acceptances (user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE eula_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can read their own acceptance records (e.g. to verify)
CREATE POLICY "Users can view own EULA acceptances"
  ON eula_acceptances
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own acceptance (service role bypasses RLS for admin queries)
CREATE POLICY "Users can insert own EULA acceptance"
  ON eula_acceptances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE eula_acceptances IS
  'Tracks which version of the EULA each user has accepted and when.';

COMMENT ON COLUMN eula_acceptances.eula_version IS
  'Semantic version string matching EULA_VERSION in eula-modal.js (e.g. "1.0").';

COMMENT ON COLUMN eula_acceptances.user_agent IS
  'Browser user-agent at time of acceptance, truncated to 512 chars for audit purposes.';
