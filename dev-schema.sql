
-- ============================================================
-- cannedIQ_dev — clean reset of public schema, then full load.
-- Safe to run repeatedly: drops all public tables/views/functions
-- first, then recreates everything from the production schema.
-- ============================================================
DO $reset$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
  FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public' LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
  END LOOP;
END
$reset$;


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_team_invite"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."accept_team_invite"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_category"("p_cat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_member(c.team_id))
      )
  );
$$;


ALTER FUNCTION "public"."can_read_category"("p_cat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_category"("p_cat_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_cat_id
      AND (
        c.user_id = auth.uid()
        OR (c.team_id IS NOT NULL AND public.is_team_admin(c.team_id))
      )
  );
$$;


ALTER FUNCTION "public"."can_write_category"("p_cat_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_increment_ai_usage"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_plan      text;
  v_used      integer;
  v_reset_at  timestamptz;
  v_quota     integer;
BEGIN
  SELECT plan, ai_requests_this_month, ai_requests_reset_at
    INTO v_plan, v_used, v_reset_at
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  -- Plan gate: pro, ai, and team get AI access
  IF v_plan NOT IN ('pro', 'ai', 'team') THEN
    RAISE EXCEPTION 'AI commands require a Pro, Pro+AI, or Team plan.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Monthly reset
  IF now() >= date_trunc('month', v_reset_at) + interval '1 month' THEN
    v_used     := 0;
    v_reset_at := date_trunc('month', now()) + interval '1 month';
  END IF;

  -- Quota by plan
  v_quota := CASE v_plan
    WHEN 'ai'   THEN 500    -- Pro+AI: 500/month
    WHEN 'pro'  THEN 100    -- Pro: 100/month
    WHEN 'team' THEN 100    -- Team: 100/month
    ELSE 0
  END;

  IF v_used >= v_quota THEN
    RAISE EXCEPTION 'Monthly AI quota of % requests reached.', v_quota
      USING ERRCODE = 'P0003';
  END IF;

  UPDATE public.profiles
     SET ai_requests_this_month = v_used + 1,
         ai_requests_reset_at   = v_reset_at
   WHERE id = p_user_id;

  RETURN v_used + 1;
END;
$$;


ALTER FUNCTION "public"."check_and_increment_ai_usage"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_free_tier_limits"("p_user_id" "uuid", "p_type" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_tier      TEXT;
  v_cat_count INT;
  v_res_count INT;
BEGIN
  SELECT tier INTO v_tier FROM public.profiles WHERE id = p_user_id;

  IF v_tier IS NULL OR v_tier != 'free' THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;

  IF p_type = 'category' THEN
    SELECT COUNT(*) INTO v_cat_count
    FROM public.categories WHERE user_id = p_user_id;
    IF v_cat_count >= 3 THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        'Free plan is limited to 3 categories. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  IF p_type = 'response' THEN
    SELECT COUNT(*) INTO v_res_count
    FROM public.responses r
    JOIN public.categories c ON c.id = r.category_id
    WHERE c.user_id = p_user_id;
    IF v_res_count >= 15 THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        'Free plan is limited to 15 responses. Upgrade to Pro for unlimited.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;


ALTER FUNCTION "public"."check_free_tier_limits"("p_user_id" "uuid", "p_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_team_seat_available"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."check_team_seat_available"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") RETURNS TABLE("invite_id" "uuid", "token" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_preview"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."get_invite_preview"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_invites"("p_team_id" "uuid") RETURNS TABLE("id" "uuid", "email" "text", "status" "text", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_team_invites"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_team_member_details"("p_team_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."get_team_member_details"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_response_use_count"("p_response_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.responses
  SET use_count = COALESCE(use_count, 0) + 1
  WHERE id = p_response_id
    AND public.can_read_category(category_id);  -- safety: caller must be able to read it
END;
$$;


ALTER FUNCTION "public"."increment_response_use_count"("p_response_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_team_member"("p_team_id" "uuid", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invitee_id UUID;
  v_is_owner   BOOLEAN;
BEGIN
  -- Verify caller owns the team
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only the team owner can invite members.');
  END IF;

  -- Look up user by email
  SELECT id INTO v_invitee_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_invitee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No account found with that email. Ask them to sign up for Canned Response Launcher first.');
  END IF;

  IF v_invitee_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You are already the team owner.');
  END IF;

  -- Insert (idempotent — ignore if already a member)
  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (p_team_id, v_invitee_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."invite_team_member"("p_team_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_admin"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = p_team_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_team_admin"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = p_team_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.teams
      WHERE id = p_team_id AND owner_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."is_team_member"("p_team_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND owner_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Only the team owner can remove other members.');
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_team_invite"("p_invite_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."revoke_team_invite"("p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_demographics"("p_full_name" "text" DEFAULT NULL::"text", "p_job_title" "text" DEFAULT NULL::"text", "p_company_name" "text" DEFAULT NULL::"text", "p_company_size" "text" DEFAULT NULL::"text", "p_use_case" "text" DEFAULT NULL::"text", "p_referral_source" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name        = COALESCE(p_full_name,       full_name),
    job_title        = COALESCE(p_job_title,       job_title),
    company_name     = COALESCE(p_company_name,    company_name),
    company_size     = COALESCE(p_company_size,    company_size),
    use_case         = COALESCE(p_use_case,        use_case),
    referral_source  = COALESCE(p_referral_source, referral_source),
    onboarded_at     = COALESCE(onboarded_at, now())
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."save_demographics"("p_full_name" "text", "p_job_title" "text", "p_company_name" "text", "p_company_size" "text", "p_use_case" "text", "p_referral_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_upgrade_reason"("p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.profiles
  SET upgrade_reason = p_reason
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."save_upgrade_reason"("p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_password_changed"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."set_member_password_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_plan_to_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.tier := CASE NEW.plan
    WHEN 'pro'  THEN 'pro'
    WHEN 'ai'   THEN 'pro'    -- Pro+AI also counts as 'pro' tier for AI quota
    WHEN 'team' THEN 'team'
    ELSE 'free'
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_plan_to_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_seen"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE profiles
  SET last_seen_at = now()
  WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."update_last_seen"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_team_commands_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_team_commands_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_billing"("p_user_id" "uuid", "p_plan" "text", "p_stripe_customer_id" "text", "p_stripe_sub_id" "text", "p_status" "text", "p_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_ai_credits" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
     SET plan                   = p_plan,
         stripe_customer_id     = p_stripe_customer_id,
         stripe_subscription_id = p_stripe_sub_id,
         subscription_status    = p_status,
         current_period_end     = p_period_end,
         cancel_at_period_end   = p_cancel_at_period_end,
         ai_credits_remaining   = COALESCE(p_ai_credits, ai_credits_remaining),
         -- Reset AI credits on renewal if plan is ai
         ai_credits_reset_at    = CASE
           WHEN p_plan = 'ai' AND p_ai_credits IS NOT NULL THEN now()
           ELSE ai_credits_reset_at
         END
   WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."upsert_billing"("p_user_id" "uuid", "p_plan" "text", "p_stripe_customer_id" "text", "p_stripe_sub_id" "text", "p_status" "text", "p_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_ai_credits" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_team_commands"("p_team_id" "uuid", "p_commands" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."upsert_team_commands"("p_team_id" "uuid", "p_commands" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "ai_calls_this_month" integer DEFAULT 0 NOT NULL,
    "ai_reset_at" timestamp with time zone DEFAULT ("date_trunc"('month'::"text", "now"()) + '1 mon'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_status" "text" DEFAULT 'inactive'::"text",
    "ai_requests_this_month" integer DEFAULT 0 NOT NULL,
    "ai_requests_reset_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "ai_credits_remaining" integer DEFAULT 0 NOT NULL,
    "ai_credits_reset_at" timestamp with time zone,
    "plan" "text" GENERATED ALWAYS AS ("tier") STORED,
    "must_change_password" boolean DEFAULT false,
    "provisioned_team_id" "uuid",
    "full_name" "text",
    "job_title" "text",
    "company_name" "text",
    "company_size" "text",
    "use_case" "text",
    "referral_source" "text",
    "upgrade_reason" "text",
    "onboarded_at" timestamp with time zone,
    "is_admin" boolean DEFAULT false NOT NULL,
    "suspended" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone,
    CONSTRAINT "profiles_tier_check" CHECK (("tier" = ANY (ARRAY['free'::"text", 'pro'::"text", 'ai'::"text", 'team'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_admin" IS 'Grants access to cannediq.com/admin dashboard.';



COMMENT ON COLUMN "public"."profiles"."suspended" IS 'When true, API calls return 403 and extension shows suspension notice.';



COMMENT ON COLUMN "public"."profiles"."last_seen_at" IS 'Updated by the extension on each successful API call.';



CREATE OR REPLACE VIEW "public"."ai_usage" WITH ("security_invoker"='true') AS
 SELECT "id" AS "user_id",
    "tier",
    "ai_requests_this_month" AS "used",
        CASE "tier"
            WHEN 'ai'::"text" THEN 500
            WHEN 'pro'::"text" THEN 100
            WHEN 'team'::"text" THEN 100
            ELSE 0
        END AS "quota",
    "ai_requests_reset_at" AS "resets_at"
   FROM "public"."profiles";




COMMENT ON VIEW "public"."ai_usage" IS 'Per-user AI request quota. RLS on profiles ensures users only see their own row via ?id=eq.{uid}.';



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "team_id" "uuid",
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "category_owner_xor" CHECK (((("user_id" IS NOT NULL) AND ("team_id" IS NULL)) OR (("user_id" IS NULL) AND ("team_id" IS NOT NULL))))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eula_acceptances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "eula_version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_agent" "text"
);


ALTER TABLE "public"."eula_acceptances" OWNER TO "postgres";


COMMENT ON TABLE "public"."eula_acceptances" IS 'Tracks which version of the EULA each user has accepted and when.';



COMMENT ON COLUMN "public"."eula_acceptances"."eula_version" IS 'Semantic version string matching EULA_VERSION in eula-modal.js (e.g. "1.0").';



COMMENT ON COLUMN "public"."eula_acceptances"."user_agent" IS 'Browser user-agent at time of acceptance, truncated to 512 chars for audit purposes.';



CREATE TABLE IF NOT EXISTS "public"."maintenance_config" (
    "id" integer DEFAULT 1 NOT NULL,
    "banner_message" "text",
    "maintenance_mode" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "maintenance_config_id_check" CHECK (("id" = 1))
);


ALTER TABLE "public"."maintenance_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."maintenance_config" IS 'Single-row table. banner_message non-null shows a bar in the extension. maintenance_mode = true blocks all commands.';



CREATE TABLE IF NOT EXISTS "public"."responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_commands" (
    "id" "text" NOT NULL,
    "team_id" "uuid" NOT NULL,
    "stack_id" "text" DEFAULT 'general'::"text" NOT NULL,
    "stack_name" "text" DEFAULT 'Shared'::"text" NOT NULL,
    "stack_color" "text" DEFAULT '#7c3aed'::"text" NOT NULL,
    "stack_icon" "text" DEFAULT '🏢'::"text" NOT NULL,
    "command_data" "jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."team_commands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "accepted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone
);


ALTER TABLE "public"."team_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "team_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provisioned_by" "uuid",
    "provisioned_at" timestamp with time zone DEFAULT "now"(),
    "temp_password" boolean DEFAULT false,
    CONSTRAINT "team_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "seats_purchased" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."team_seat_usage" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "team_id",
    "t"."seats_purchased",
    ((1 + COALESCE("m"."member_count", 0)) + COALESCE("i"."pending_count", 0)) AS "seats_used"
   FROM (("public"."teams" "t"
     LEFT JOIN ( SELECT "team_members"."team_id",
            ("count"(*))::integer AS "member_count"
           FROM "public"."team_members"
          GROUP BY "team_members"."team_id") "m" ON (("m"."team_id" = "t"."id")))
     LEFT JOIN ( SELECT "team_invites"."team_id",
            ("count"(*))::integer AS "pending_count"
           FROM "public"."team_invites"
          WHERE (("team_invites"."status" = 'pending'::"text") AND ("team_invites"."expires_at" > "now"()))
          GROUP BY "team_invites"."team_id") "i" ON (("i"."team_id" = "t"."id")));


ALTER VIEW "public"."team_seat_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_commands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pack_id" "uuid" NOT NULL,
    "command_data" "jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."template_commands" OWNER TO "postgres";


COMMENT ON TABLE "public"."template_commands" IS 'Individual commands belonging to a template pack. command_data matches the extension storage format.';



CREATE TABLE IF NOT EXISTS "public"."template_packs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    "icon" "text" DEFAULT '📦'::"text" NOT NULL,
    "price_cents" integer DEFAULT 0 NOT NULL,
    "stripe_price_id" "text",
    "command_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "preview_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."template_packs" OWNER TO "postgres";


COMMENT ON TABLE "public"."template_packs" IS 'Purchasable command template packs available in the template store.';



COMMENT ON COLUMN "public"."template_packs"."price_cents" IS '0 = free. Positive = USD cents (e.g. 499 = $4.99).';



CREATE OR REPLACE VIEW "public"."user_plan" WITH ("security_invoker"='true') AS
 SELECT "id",
    "plan",
    "subscription_status",
    "current_period_end",
    "cancel_at_period_end",
    "ai_credits_remaining",
    "ai_credits_reset_at",
        CASE "tier"
            WHEN 'free'::"text" THEN 25
            ELSE NULL::integer
        END AS "max_commands",
        CASE "tier"
            WHEN 'free'::"text" THEN 3
            ELSE NULL::integer
        END AS "max_stacks"
   FROM "public"."profiles"
  WHERE ("id" = "auth"."uid"());


ALTER VIEW "public"."user_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_template_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pack_id" "uuid" NOT NULL,
    "purchased_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_payment_intent_id" "text",
    "applied_at" timestamp with time zone
);


ALTER TABLE "public"."user_template_purchases" OWNER TO "postgres";


ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eula_acceptances"
    ADD CONSTRAINT "eula_acceptances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eula_acceptances"
    ADD CONSTRAINT "eula_acceptances_user_id_eula_version_key" UNIQUE ("user_id", "eula_version");



ALTER TABLE ONLY "public"."maintenance_config"
    ADD CONSTRAINT "maintenance_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."responses"
    ADD CONSTRAINT "responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_commands"
    ADD CONSTRAINT "team_commands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id", "user_id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_user_id_key" UNIQUE ("team_id", "user_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_commands"
    ADD CONSTRAINT "template_commands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_packs"
    ADD CONSTRAINT "template_packs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_template_purchases"
    ADD CONSTRAINT "user_template_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_template_purchases"
    ADD CONSTRAINT "user_template_purchases_user_id_pack_id_key" UNIQUE ("user_id", "pack_id");



CREATE INDEX "categories_team_id_idx" ON "public"."categories" USING "btree" ("team_id");



CREATE INDEX "categories_user_id_idx" ON "public"."categories" USING "btree" ("user_id");



CREATE INDEX "idx_eula_acceptances_user_id" ON "public"."eula_acceptances" USING "btree" ("user_id");



CREATE INDEX "idx_template_commands_pack_id" ON "public"."template_commands" USING "btree" ("pack_id");



CREATE INDEX "idx_user_template_purchases_user" ON "public"."user_template_purchases" USING "btree" ("user_id");



CREATE UNIQUE INDEX "profiles_stripe_customer_id_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "responses_category_id_idx" ON "public"."responses" USING "btree" ("category_id");



CREATE INDEX "team_commands_team_id_idx" ON "public"."team_commands" USING "btree" ("team_id");



CREATE UNIQUE INDEX "team_invites_team_email_pending_idx" ON "public"."team_invites" USING "btree" ("team_id", "email") WHERE ("status" = 'pending'::"text");



CREATE OR REPLACE TRIGGER "categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "responses_updated_at" BEFORE UPDATE ON "public"."responses" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "teams_updated_at" BEFORE UPDATE ON "public"."teams" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "trg_team_commands_updated_at" BEFORE UPDATE ON "public"."team_commands" FOR EACH ROW EXECUTE FUNCTION "public"."update_team_commands_updated_at"();



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eula_acceptances"
    ADD CONSTRAINT "eula_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."maintenance_config"
    ADD CONSTRAINT "maintenance_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_provisioned_team_id_fkey" FOREIGN KEY ("provisioned_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."responses"
    ADD CONSTRAINT "responses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_commands"
    ADD CONSTRAINT "team_commands_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."team_commands"
    ADD CONSTRAINT "team_commands_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_invites"
    ADD CONSTRAINT "team_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_provisioned_by_fkey" FOREIGN KEY ("provisioned_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_commands"
    ADD CONSTRAINT "template_commands_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."template_packs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_template_purchases"
    ADD CONSTRAINT "user_template_purchases_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."template_packs"("id");



ALTER TABLE ONLY "public"."user_template_purchases"
    ADD CONSTRAINT "user_template_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Public read active template packs" ON "public"."template_packs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public read maintenance config" ON "public"."maintenance_config" FOR SELECT USING (true);



CREATE POLICY "Purchased users can read template commands" ON "public"."template_commands" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."template_packs" "tp"
  WHERE (("tp"."id" = "template_commands"."pack_id") AND ("tp"."price_cents" = 0)))) OR (EXISTS ( SELECT 1
   FROM "public"."user_template_purchases" "utp"
  WHERE (("utp"."pack_id" = "utp"."pack_id") AND ("utp"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Users can insert own purchases" ON "public"."user_template_purchases" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own purchases" ON "public"."user_template_purchases" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own purchases" ON "public"."user_template_purchases" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete" ON "public"."categories" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND "public"."is_team_admin"("team_id"))));



CREATE POLICY "categories_insert" ON "public"."categories" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND "public"."is_team_admin"("team_id"))));



CREATE POLICY "categories_select" ON "public"."categories" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND "public"."is_team_member"("team_id"))));



CREATE POLICY "categories_update" ON "public"."categories" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND "public"."is_team_admin"("team_id")))) WITH CHECK ((("user_id" = "auth"."uid"()) OR (("team_id" IS NOT NULL) AND "public"."is_team_admin"("team_id"))));



ALTER TABLE "public"."eula_acceptances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eula_insert" ON "public"."eula_acceptances" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "eula_select" ON "public"."eula_acceptances" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "invites_delete" ON "public"."team_invites" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_invites"."team_id") AND ("t"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "invites_insert" ON "public"."team_invites" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_invites"."team_id") AND ("t"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "invites_select" ON "public"."team_invites" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_invites"."team_id") AND ("t"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "invites_update" ON "public"."team_invites" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teams" "t"
  WHERE (("t"."id" = "team_invites"."team_id") AND ("t"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."maintenance_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."responses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "responses_delete" ON "public"."responses" FOR DELETE USING ("public"."can_write_category"("category_id"));



CREATE POLICY "responses_insert" ON "public"."responses" FOR INSERT WITH CHECK ("public"."can_write_category"("category_id"));



CREATE POLICY "responses_select" ON "public"."responses" FOR SELECT USING ("public"."can_read_category"("category_id"));



CREATE POLICY "responses_update" ON "public"."responses" FOR UPDATE USING ("public"."can_write_category"("category_id"));



ALTER TABLE "public"."team_commands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_commands_delete" ON "public"."team_commands" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_commands"."team_id") AND ("team_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("team_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "team_commands_insert" ON "public"."team_commands" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_commands"."team_id") AND ("team_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("team_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "team_commands_select" ON "public"."team_commands" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_commands"."team_id") AND ("team_members"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "team_commands_update" ON "public"."team_commands" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "team_commands"."team_id") AND ("team_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("team_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."team_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "team_members_can_read_commands" ON "public"."team_commands" FOR SELECT USING ((("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."user_id" = "auth"."uid"()))) OR ("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."owner_id" = "auth"."uid"())))));



CREATE POLICY "team_members_delete" ON "public"."team_members" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "team_members_insert" ON "public"."team_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "team_members_own" ON "public"."team_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "team_members_select" ON "public"."team_members" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."team_members" "tm2"
  WHERE (("tm2"."team_id" = "tm2"."team_id") AND ("tm2"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "team_members_update" ON "public"."team_members" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "team_owners_can_delete_commands" ON "public"."team_commands" FOR DELETE USING ((("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."owner_id" = "auth"."uid"()))) OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE (("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"text"))))));



CREATE POLICY "team_owners_can_insert_commands" ON "public"."team_commands" FOR INSERT WITH CHECK ((("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."owner_id" = "auth"."uid"()))) OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE (("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"text"))))));



CREATE POLICY "team_owners_can_update_commands" ON "public"."team_commands" FOR UPDATE USING ((("team_id" IN ( SELECT "teams"."id"
   FROM "public"."teams"
  WHERE ("teams"."owner_id" = "auth"."uid"()))) OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE (("team_members"."user_id" = "auth"."uid"()) AND ("team_members"."role" = 'admin'::"text"))))));



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_delete" ON "public"."teams" FOR DELETE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "teams_insert" ON "public"."teams" FOR INSERT WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "teams_select" ON "public"."teams" FOR SELECT USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."team_members"
  WHERE (("team_members"."team_id" = "teams"."id") AND ("team_members"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "teams_update" ON "public"."teams" FOR UPDATE USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."template_commands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_packs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_template_purchases" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT ALL ON SCHEMA "public" TO "postgres";
GRANT ALL ON SCHEMA "public" TO "anon";
GRANT ALL ON SCHEMA "public" TO "authenticated";
GRANT ALL ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."accept_team_invite"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_team_invite"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_team_invite"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_read_category"("p_cat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_category"("p_cat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_category"("p_cat_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_write_category"("p_cat_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_category"("p_cat_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_category"("p_cat_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_team_invite"("p_team_id" "uuid", "p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_increment_ai_usage"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_increment_ai_usage"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_increment_ai_usage"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_free_tier_limits"("p_user_id" "uuid", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_free_tier_limits"("p_user_id" "uuid", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_free_tier_limits"("p_user_id" "uuid", "p_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_team_seat_available"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_team_seat_available"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_team_seat_available"("p_team_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_team_invite"("p_team_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_preview"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_preview"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_preview"("p_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_invites"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_invites"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_invites"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_team_member_details"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_team_member_details"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_team_member_details"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_response_use_count"("p_response_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_response_use_count"("p_response_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_response_use_count"("p_response_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_team_member"("p_team_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_team_member"("p_team_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_team_member"("p_team_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_admin"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_admin"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_admin"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_team_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_team_invite"("p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_team_invite"("p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_team_invite"("p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_demographics"("p_full_name" "text", "p_job_title" "text", "p_company_name" "text", "p_company_size" "text", "p_use_case" "text", "p_referral_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_demographics"("p_full_name" "text", "p_job_title" "text", "p_company_name" "text", "p_company_size" "text", "p_use_case" "text", "p_referral_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_demographics"("p_full_name" "text", "p_job_title" "text", "p_company_name" "text", "p_company_size" "text", "p_use_case" "text", "p_referral_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_upgrade_reason"("p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_upgrade_reason"("p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_upgrade_reason"("p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_member_password_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_member_password_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_password_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_plan_to_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_plan_to_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_plan_to_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_seen"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_role"("p_team_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_team_commands_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_team_commands_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_team_commands_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_billing"("p_user_id" "uuid", "p_plan" "text", "p_stripe_customer_id" "text", "p_stripe_sub_id" "text", "p_status" "text", "p_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_ai_credits" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_billing"("p_user_id" "uuid", "p_plan" "text", "p_stripe_customer_id" "text", "p_stripe_sub_id" "text", "p_status" "text", "p_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_ai_credits" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_billing"("p_user_id" "uuid", "p_plan" "text", "p_stripe_customer_id" "text", "p_stripe_sub_id" "text", "p_status" "text", "p_period_end" timestamp with time zone, "p_cancel_at_period_end" boolean, "p_ai_credits" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_team_commands"("p_team_id" "uuid", "p_commands" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_team_commands"("p_team_id" "uuid", "p_commands" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_team_commands"("p_team_id" "uuid", "p_commands" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."eula_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."eula_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."eula_acceptances" TO "service_role";



GRANT ALL ON TABLE "public"."maintenance_config" TO "anon";
GRANT ALL ON TABLE "public"."maintenance_config" TO "authenticated";
GRANT ALL ON TABLE "public"."maintenance_config" TO "service_role";



GRANT ALL ON TABLE "public"."responses" TO "anon";
GRANT ALL ON TABLE "public"."responses" TO "authenticated";
GRANT ALL ON TABLE "public"."responses" TO "service_role";



GRANT ALL ON TABLE "public"."team_commands" TO "anon";
GRANT ALL ON TABLE "public"."team_commands" TO "authenticated";
GRANT ALL ON TABLE "public"."team_commands" TO "service_role";



GRANT ALL ON TABLE "public"."team_invites" TO "anon";
GRANT ALL ON TABLE "public"."team_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."team_invites" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."team_seat_usage" TO "anon";
GRANT ALL ON TABLE "public"."team_seat_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."team_seat_usage" TO "service_role";



GRANT ALL ON TABLE "public"."template_commands" TO "anon";
GRANT ALL ON TABLE "public"."template_commands" TO "authenticated";
GRANT ALL ON TABLE "public"."template_commands" TO "service_role";



GRANT ALL ON TABLE "public"."template_packs" TO "anon";
GRANT ALL ON TABLE "public"."template_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."template_packs" TO "service_role";



GRANT ALL ON TABLE "public"."user_plan" TO "anon";
GRANT ALL ON TABLE "public"."user_plan" TO "authenticated";
GRANT ALL ON TABLE "public"."user_plan" TO "service_role";



GRANT ALL ON TABLE "public"."user_template_purchases" TO "anon";
GRANT ALL ON TABLE "public"."user_template_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."user_template_purchases" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































