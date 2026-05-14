/**
 * Canned Response Launcher — API Client
 *
 * Thin wrapper around Supabase PostgREST and Edge Functions.
 * All calls require a valid JWT (obtained from Auth.getValidSession()).
 *
 * Dependencies: config.js, auth.js must be loaded first.
 */

const Api = (() => {

  // ── Core fetch ────────────────────────────────────────────────────────────────

  async function apiFetch(path, options = {}) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');

    const url = `${REST_URL}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
        'Prefer':        options.prefer ?? 'return=representation',
        ...(options.headers ?? {}),
      },
    });

    if (res.status === 204) return null;

    const data = await res.json();
    if (!res.ok) {
      throw new ApiError(data.message ?? data.error ?? 'API error', res.status, data);
    }
    return data;
  }

  /** Call a Supabase Edge Function (under /functions/v1/). */
  async function fnFetch(fnName, body) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');

    const url = `${SUPABASE_URL}/functions/v1/${fnName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new ApiError(data.error ?? 'Function error', res.status, data);
    }
    return data;
  }

  // ── Error types ───────────────────────────────────────────────────────────────

  class AuthError extends Error { constructor(msg) { super(msg); this.name = 'AuthError'; } }
  class ApiError extends Error {
    constructor(msg, status, raw) {
      super(msg);
      this.name   = 'ApiError';
      this.status = status;
      this.raw    = raw;
    }
  }

  // ── Profile / entitlement ─────────────────────────────────────────────────────

  async function getProfile() {
    const rows = await apiFetch(
      '/profiles?select=id,email,tier,ai_calls_this_month,ai_reset_at,' +
      'stripe_customer_id,stripe_subscription_id,subscription_status,' +
      'must_change_password,onboarded_at,full_name,job_title,company_name,' +
      'company_size,use_case,referral_source'
    );
    return rows?.[0] ?? null;
  }

  /**
   * Save onboarding demographics (called once after the first-login form).
   */
  async function saveDemographics({ fullName, userType, jobTitle, companyName, companySize, useCase, referralSource }) {
    await apiFetch('/rpc/save_demographics', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        p_full_name:       fullName       ?? null,
        p_user_type:       userType       ?? null,
        p_job_title:       jobTitle       ?? null,
        p_company_name:    companyName    ?? null,
        p_company_size:    companySize    ?? null,
        p_use_case:        useCase        ?? null,
        p_referral_source: referralSource ?? null,
      }),
    });
  }

  /**
   * Save why the user is upgrading (called on upgrade modal submit,
   * before redirecting to Stripe Checkout).
   */
  async function saveUpgradeReason(reason) {
    if (!reason?.trim()) return;
    await apiFetch('/rpc/save_upgrade_reason', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ p_reason: reason }),
    }).catch(() => {}); // non-blocking
  }

  // ── Categories ────────────────────────────────────────────────────────────────

  /**
   * Fetch all personal categories for the current user,
   * with their responses nested inline.
   */
  async function getCategories() {
    const rows = await apiFetch(
      `/categories` +
      `?team_id=is.null` +
      `&select=id,name,sort_order,responses(id,title,body,sort_order,use_count)` +
      `&order=sort_order.asc`
    );

    return (rows ?? []).map(normalizeCategory);
  }

  async function createCategory(name) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');
    const userId = session.user?.id;
    if (!userId) throw new AuthError('User ID unavailable — please sign out and sign in again');

    const check = await apiFetch('/rpc/check_free_tier_limits', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: userId, p_type: 'category' }),
    });
    if (!check.allowed) throw new ApiError(check.reason, 403, check);

    const rows = await apiFetch('/categories', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, name }),
    });
    return rows?.[0];
  }

  async function updateCategory(id, patch) {
    const rows = await apiFetch(`/categories?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return rows?.[0];
  }

  async function deleteCategory(id) {
    await apiFetch(`/categories?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  }

  // ── Responses ─────────────────────────────────────────────────────────────────

  async function createResponse(categoryId, title, text) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');
    const userId = session.user?.id;
    if (!userId) throw new AuthError('User ID unavailable — please sign out and sign in again');

    const check = await apiFetch('/rpc/check_free_tier_limits', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: userId, p_type: 'response' }),
    });
    if (!check.allowed) throw new ApiError(check.reason, 403, check);

    const rows = await apiFetch('/responses', {
      method: 'POST',
      body: JSON.stringify({ category_id: categoryId, title, body: text }),
    });
    return rows?.[0];
  }

  async function updateResponse(id, patch) {
    const dbPatch = { ...patch };
    if ('text' in dbPatch) { dbPatch.body = dbPatch.text; delete dbPatch.text; }

    const rows = await apiFetch(`/responses?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dbPatch),
    });
    return rows?.[0];
  }

  async function deleteResponse(id) {
    await apiFetch(`/responses?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  }

  /**
   * Atomically increment use_count for a response.
   * Fire-and-forget — does not block response insertion.
   */
  function incrementUseCount(id) {
    apiFetch('/rpc/increment_response_use_count', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ p_response_id: id }),
    }).catch(() => {});
  }

  // ── Teams ─────────────────────────────────────────────────────────────────────

  /**
   * Returns all teams the current user owns or is a member of.
   * Each entry includes: { id, name, ownerId, isOwner, role, createdAt }
   */
  async function getTeams() {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');
    const userId = session.user?.id;

    const [teams, memberships] = await Promise.all([
      // RLS (teams_select) returns only teams this user can see
      apiFetch('/teams?select=id,name,owner_id,created_at').catch(() => []),
      // Their membership rows (for role info on non-owned teams)
      apiFetch(`/team_members?user_id=eq.${userId}&select=team_id,role`).catch(() => []),
    ]);

    const membershipMap = {};
    (memberships ?? []).forEach((m) => { membershipMap[m.team_id] = m.role; });

    return (teams ?? []).map((t) => ({
      id:        t.id,
      name:      t.name,
      ownerId:   t.owner_id,
      isOwner:   t.owner_id === userId,
      role:      t.owner_id === userId ? 'owner' : (membershipMap[t.id] ?? 'member'),
      createdAt: t.created_at,
    }));
  }

  async function createTeam(name) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');
    const userId = session.user?.id;
    if (!userId) throw new AuthError('User ID unavailable');

    const rows = await apiFetch('/teams', {
      method: 'POST',
      body: JSON.stringify({ name, owner_id: userId }),
    });
    return rows?.[0];
  }

  async function deleteTeam(teamId) {
    await apiFetch(`/teams?id=eq.${teamId}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  }

  async function renameTeam(teamId, name) {
    const rows = await apiFetch(`/teams?id=eq.${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    return rows?.[0];
  }

  // ── Team members ──────────────────────────────────────────────────────────────

  /**
   * Returns the member list for a team.
   * Each entry: { id, userId, role }
   */
  async function getTeamMembers(teamId) {
    const rows = await apiFetch(
      `/team_members?team_id=eq.${teamId}&select=user_id,role`
    );
    return (rows ?? []).map((m) => ({
      userId: m.user_id,
      role:   m.role,
    }));
  }

  /**
   * Send a token-based invite link to the given email via the Edge Function.
   * The recipient clicks the link, signs up or signs in, and is automatically
   * added to the team — no lookup by email required.
   *
   * Returns { invite_id, link } — link can be copied as a fallback.
   */
  async function sendTeamInvite(teamId, email) {
    return fnFetch('send-team-invite', { team_id: teamId, email });
  }

  /**
   * Fetch pending invites for a team (visible to the team owner).
   * Each entry: { id, email, createdAt, expiresAt }
   */
  async function getPendingInvites(teamId) {
    const rows = await apiFetch(
      `/team_invites?team_id=eq.${teamId}&status=eq.pending` +
      `&select=id,email,created_at,expires_at&order=created_at.desc`
    );
    return (rows ?? []).map((r) => ({
      id:        r.id,
      email:     r.email,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  }

  /**
   * Revoke a pending invite before it is accepted.
   */
  async function revokeInvite(inviteId) {
    const result = await apiFetch('/rpc/revoke_team_invite', {
      method: 'POST',
      body: JSON.stringify({ p_invite_id: inviteId }),
    });
    if (result && !result.success) throw new ApiError(result.error, 400, result);
    return result;
  }

  /**
   * Remove a team member. Owner can remove anyone; members can remove themselves.
   */
  async function removeTeamMember(teamId, userId) {
    const result = await apiFetch('/rpc/remove_team_member', {
      method: 'POST',
      body: JSON.stringify({ p_team_id: teamId, p_user_id: userId }),
    });
    if (result && !result.success) throw new ApiError(result.error, 400, result);
    return result;
  }

  // ── Team categories ───────────────────────────────────────────────────────────

  /**
   * Fetch all team-owned categories visible to the current user,
   * with responses nested. Returns same shape as getCategories().
   */
  async function getTeamCategories() {
    const rows = await apiFetch(
      `/categories` +
      `?team_id=not.is.null` +
      `&select=id,name,sort_order,team_id,teams(name),responses(id,title,body,sort_order)` +
      `&order=sort_order.asc`
    );
    return (rows ?? []).map((cat) => ({
      ...normalizeCategory(cat),
      teamId:   cat.team_id,
      teamName: cat.teams?.name ?? 'Team',
      isTeam:   true,
    }));
  }

  /**
   * Create a category belonging to a team (team admins/owners only).
   */
  async function createTeamCategory(teamId, name) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');

    const rows = await apiFetch('/categories', {
      method: 'POST',
      body: JSON.stringify({ team_id: teamId, name }),
    });
    return rows?.[0];
  }

  // ── Team provisioning ─────────────────────────────────────────────────────────

  /**
   * Owner creates a CannedIQ account for a team member and enrolls them
   * immediately. Member receives an email with login credentials.
   *
   * @param {string} teamId
   * @param {string} email
   * @param {string} [fullName]
   * @returns {{ user_id, email, is_new }}
   */
  async function provisionTeamMember(teamId, email, fullName = '') {
    return fnFetch('provision-team-member', {
      team_id:   teamId,
      email,
      full_name: fullName,
    });
  }

  /**
   * Owner resets a member's password, generating a new temporary one
   * and emailing it to the member.
   */
  async function resetMemberPassword(teamId, userId) {
    return fnFetch('reset-member-password', { team_id: teamId, user_id: userId });
  }

  /**
   * Fetch rich member details for a team (owner only).
   * Returns [{ userId, email, role, provisionedAt, tempPassword, lastSignInAt }]
   */
  async function getTeamMemberDetails(teamId) {
    const result = await apiFetch('/rpc/get_team_member_details', {
      method: 'POST',
      body: JSON.stringify({ p_team_id: teamId }),
    });
    // RPC returns a JSONB array directly (or an error object)
    if (result?.error) throw new ApiError(result.error, 403, result);
    return (Array.isArray(result) ? result : []).map((m) => ({
      userId:        m.user_id,
      email:         m.email,
      role:          m.role,
      provisionedAt: m.provisioned_at,
      tempPassword:  m.temp_password,
      lastSignInAt:  m.last_sign_in_at,
    }));
  }

  /**
   * Member calls this after successfully changing their temporary password.
   * Clears must_change_password and temp_password flags.
   */
  async function clearTempPasswordFlag() {
    await apiFetch('/rpc/set_member_password_changed', {
      method: 'POST',
      prefer: 'return=minimal',
      body: '{}',
    });
  }

  // ── Team seat usage ───────────────────────────────────────────────────────────

  /**
   * Returns seat usage for a team via the check_team_seat_available RPC.
   * Shape: { available, seatsUsed, seatsPurchased, seatsAvailable }
   */
  async function getTeamSeatUsage(teamId) {
    const result = await apiFetch('/rpc/check_team_seat_available', {
      method: 'POST',
      body: JSON.stringify({ p_team_id: teamId }),
    });
    if (!result) return null;
    return {
      available:       result.available,
      seatsUsed:       result.seats_used,
      seatsPurchased:  result.seats_purchased,
      seatsAvailable:  result.seats_available,
    };
  }

  // ── Team Commands (shared library) ───────────────────────────────────────────

  /**
   * Fetch all commands shared with teams the current user belongs to.
   * Returns an array of CRL command objects, each with a `_teamId` and
   * `_teamName` property so the UI can label them.
   *
   * @param {string} [teamId] — if provided, only fetch for that team
   */
  async function getTeamCommands(teamId) {
    const session = await Auth.getValidSession();
    if (!session) return [];

    let url = `/team_commands?select=id,team_id,stack_id,stack_name,stack_color,stack_icon,command_data,teams(name)`;
    if (teamId) url += `&team_id=eq.${encodeURIComponent(teamId)}`;
    url += `&order=created_at.asc`;

    const rows = await apiFetch(url);
    return (rows ?? []).map((row) => ({
      ...row.command_data,
      id:         row.id,
      _teamId:    row.team_id,
      _teamName:  row.teams?.name ?? 'Team',
      _stackId:   row.stack_id,
      _stackName: row.stack_name,
      _stackColor: row.stack_color,
      _stackIcon:  row.stack_icon,
      _isTeam:    true,
    }));
  }

  /**
   * Push a batch of commands to a team's shared library.
   * Caller must be team owner or admin.
   *
   * @param {string}   teamId
   * @param {object[]} commands  — CRL command objects
   * @param {object[]} stacks    — CRL stack objects (used for stack metadata)
   * @returns {number} count of rows upserted
   */
  async function upsertTeamCommands(teamId, commands, stacks = []) {
    const session = await Auth.getValidSession();
    if (!session) throw new AuthError('Not authenticated');

    const stackMap = Object.fromEntries((stacks ?? []).map((s) => [s.id, s]));

    const payload = commands.map((cmd) => {
      const stack = stackMap[cmd.stackId] ?? {};
      return {
        id:           cmd.id,
        stack_id:     cmd.stackId   ?? stack.id    ?? 'general',
        stack_name:   stack.name    ?? 'Shared',
        stack_color:  stack.color   ?? '#7c3aed',
        stack_icon:   stack.icon    ?? '🏢',
        command_data: cmd,
      };
    });

    const { data, error } = await apiFetch('/rpc/upsert_team_commands', {
      method: 'POST',
      body: JSON.stringify({ p_team_id: teamId, p_commands: payload }),
    });

    if (error) throw new Error(error.message ?? 'upsert_team_commands failed');
    return data ?? payload.length;
  }

  /**
   * Delete a command from a team's shared library.
   */
  async function deleteTeamCommand(commandId) {
    return apiFetch(`/team_commands?id=eq.${encodeURIComponent(commandId)}`, {
      method: 'DELETE',
    });
  }

  // ── Billing / Stripe ──────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout session for the given plan.
   * Returns { url } — open this URL in a new tab to complete payment.
   *
   * @param {'pro'|'team'} plan
   * @param {number} [seats] — only used for the team plan
   */
  async function createCheckoutSession(plan, seats = 1) {
    return fnFetch('create-checkout-session', { plan, seats });
  }

  // ── Normalise helpers ─────────────────────────────────────────────────────────

  function normalizeCategory(cat) {
    return {
      id:        cat.id,
      name:      cat.name,
      sortOrder: cat.sort_order,
      responses: (cat.responses ?? []).map((r) => ({
        id:        r.id,
        title:     r.title,
        text:      r.body,       // rename body → text for internal consistency
        sortOrder: r.sort_order,
        useCount:  r.use_count,
      })),
    };
  }

  // ── Public surface ────────────────────────────────────────────────────────────

  return {
    // Profile
    getProfile,
    saveDemographics,
    saveUpgradeReason,

    // Personal categories + responses
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    createResponse,
    updateResponse,
    deleteResponse,
    incrementUseCount,

    // Teams
    getTeams,
    createTeam,
    deleteTeam,
    renameTeam,

    // Team members
    getTeamMembers,
    getTeamMemberDetails,
    sendTeamInvite,
    getPendingInvites,
    revokeInvite,
    removeTeamMember,

    // Team provisioning
    provisionTeamMember,
    resetMemberPassword,
    clearTempPasswordFlag,

    // Team seats
    getTeamSeatUsage,

    // Team categories (legacy)
    getTeamCategories,
    createTeamCategory,

    // Team commands (shared library)
    getTeamCommands,
    upsertTeamCommands,
    deleteTeamCommand,

    // Billing
    createCheckoutSession,

    // Error types (for instanceof checks)
    AuthError,
    ApiError,
  };
})();
