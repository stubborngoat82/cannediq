-- ============================================================
-- Canned Response Launcher — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query)
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
-- gen_random_uuid() is built-in; moddatetime needs pgcrypto
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;


-- ── 1. Profiles ─────────────────────────────────────────────
-- One row per Supabase Auth user. Created automatically via trigger.

CREATE TABLE public.profiles (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  tier                  TEXT        NOT NULL DEFAULT 'free'   -- 'free' | 'pro' | 'ai' | 'team'
                          CHECK (tier IN ('free', 'pro', 'ai', 'team')),
  stripe_customer_id    TEXT        UNIQUE,
  stripe_subscription_id TEXT,
  ai_calls_this_month   INT         NOT NULL DEFAULT 0,
  ai_reset_at           TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);


-- ── 2. Teams ────────────────────────────────────────────────

CREATE TABLE public.teams (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  owner_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);


-- ── 3. Team Members ─────────────────────────────────────────

CREATE TABLE public.team_members (
  team_id    UUID NOT NULL REFERENCES public.teams(id)    ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);


-- ── 4. Categories ───────────────────────────────────────────
-- Either owned by a user (user_id set, team_id null)
-- or owned by a team  (team_id set, user_id null).

CREATE TABLE public.categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id    UUID        REFERENCES public.teams(id)    ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one of user_id / team_id must be set
  CONSTRAINT category_owner_xor CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL     AND team_id IS NOT NULL)
  )
);

CREATE INDEX categories_user_id_idx ON public.categories(user_id);
CREATE INDEX categories_team_id_idx ON public.categories(team_id);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);


-- ── 5. Responses ────────────────────────────────────────────

CREATE TABLE public.responses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,   -- named 'body' to avoid SQL keyword collision
  sort_order  INT         NOT NULL DEFAULT 0,
  use_count   INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX responses_category_id_idx ON public.responses(category_id);

CREATE TRIGGER responses_updated_at
  BEFORE UPDATE ON public.responses
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);


-- ── 6. Row Level Security ────────────────────────────────────

ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses    ENABLE ROW LEVEL SECURITY;


-- profiles: users can only see and edit their own row
CREATE POLICY "profiles: own row" ON public.profiles
  FOR ALL USING (auth.uid() = id);


-- teams: owner or member can read; only owner can modify
CREATE POLICY "teams: member can read" ON public.teams
  FOR SELECT USING (
    auth.uid() = owner_id OR
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "teams: owner can modify" ON public.teams
  FOR ALL USING (auth.uid() = owner_id);


-- team_members: members can read their own team roster
CREATE POLICY "team_members: member can read" ON public.team_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
  );

CREATE POLICY "team_members: owner can manage" ON public.team_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = team_members.team_id AND owner_id = auth.uid()
    )
  );


-- Helper: returns true if the calling user can read a given category
CREATE OR REPLACE FUNCTION public.can_read_category(cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = cat_id AND (
      c.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = c.team_id AND tm.user_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = c.team_id AND t.owner_id = auth.uid()
      )
    )
  );
$$;

-- Helper: returns true if the calling user can write to a given category
CREATE OR REPLACE FUNCTION public.can_write_category(cat_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = cat_id AND (
      c.user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.team_id = c.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      ) OR
      EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id = c.team_id AND t.owner_id = auth.uid()
      )
    )
  );
$$;


-- categories: user owns it, or user is a team member
CREATE POLICY "categories: owner or team member can read" ON public.categories
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = categories.team_id AND tm.user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = categories.team_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "categories: owner or team admin can write" ON public.categories
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = categories.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    ) OR
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = categories.team_id AND t.owner_id = auth.uid()
    )
  );


-- responses: inherit access from their parent category
CREATE POLICY "responses: can read if category readable" ON public.responses
  FOR SELECT USING (public.can_read_category(category_id));

CREATE POLICY "responses: can write if category writable" ON public.responses
  FOR ALL USING (public.can_write_category(category_id));


-- ── 7. Free-tier limits ──────────────────────────────────────
-- Enforce the 3 category / 15 response cap for free users via a function.
-- Call this from your API layer before inserting.

CREATE OR REPLACE FUNCTION public.check_free_tier_limits(p_user_id UUID, p_type TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier      TEXT;
  v_cat_count INT;
  v_res_count INT;
BEGIN
  SELECT tier INTO v_tier FROM public.profiles WHERE id = p_user_id;

  IF v_tier != 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF p_type = 'category' THEN
    SELECT COUNT(*) INTO v_cat_count
    FROM public.categories WHERE user_id = p_user_id;
    IF v_cat_count >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Free plan is limited to 3 categories. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  IF p_type = 'response' THEN
    SELECT COUNT(*) INTO v_res_count
    FROM public.responses r
    JOIN public.categories c ON c.id = r.category_id
    WHERE c.user_id = p_user_id;
    IF v_res_count >= 15 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Free plan is limited to 15 responses. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;


-- ── 8. AI usage tracking ─────────────────────────────────────
-- Increment AI call counter; reset automatically when the monthly window rolls over.

CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier  TEXT;
  v_count INT;
  v_limit INT;
BEGIN
  -- Reset counter if we've passed the reset date
  UPDATE public.profiles
  SET ai_calls_this_month = 0,
      ai_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
  WHERE id = p_user_id AND NOW() >= ai_reset_at;

  SELECT tier, ai_calls_this_month INTO v_tier, v_count
  FROM public.profiles WHERE id = p_user_id;

  -- Limits per tier
  v_limit := CASE v_tier
    WHEN 'free' THEN 0        -- no AI on free
    WHEN 'pro'  THEN 100
    WHEN 'ai'   THEN 500
    WHEN 'team' THEN 500
    ELSE 0
  END;

  IF v_tier = 'free' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'AI features require a Pro plan.');
  END IF;

  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Monthly AI call limit reached. Resets at the start of next month.');
  END IF;

  UPDATE public.profiles
  SET ai_calls_this_month = ai_calls_this_month + 1
  WHERE id = p_user_id;

  RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - v_count - 1);
END;
$$;
