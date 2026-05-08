/**
 * CRL — core/gates.js
 * Plan feature gating utilities.
 *
 * Usage:
 *   const user = await CRLGates.getUser();
 *   if (!CRLGates.canCreateCommand(user, currentCount)) {
 *     CRLUpgrade.show('command_limit');
 *     return;
 *   }
 *
 * The user object is loaded from chrome.storage.local (cached from Supabase).
 * Background.js is responsible for keeping it fresh after auth/billing events.
 */

const CRLGates = (() => {

  // ── Plan definitions ──────────────────────────────────────────────────────────

  const PLAN_LIMITS = {
    free: {
      maxCommands:        25,
      maxStacks:          3,
      ai:                 false,
      context:            false,
      advancedVariables:  false,
      team:               false,
      aiCredits:          0,
      label:              'Free',
    },
    pro: {
      maxCommands:        Infinity,
      maxStacks:          Infinity,
      ai:                 false,
      context:            true,
      advancedVariables:  true,
      team:               false,
      aiCredits:          0,
      label:              'Pro',
    },
    ai: {
      maxCommands:        Infinity,
      maxStacks:          Infinity,
      ai:                 true,
      context:            true,
      advancedVariables:  true,
      team:               false,
      aiCredits:          500,
      label:              'Pro+ AI',
    },
    team: {
      maxCommands:        Infinity,
      maxStacks:          Infinity,
      ai:                 false,    // configurable per implementation
      context:            true,
      advancedVariables:  true,
      team:               true,
      aiCredits:          100,
      label:              'Team',
    },
  };

  // ── User cache ────────────────────────────────────────────────────────────────

  let _cached = null;
  let _cacheTs = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the current user + plan from storage.
   * Returns a safe default (free plan, not signed in) if nothing stored.
   */
  async function getUser() {
    const now = Date.now();
    if (_cached && (now - _cacheTs) < CACHE_TTL) return _cached;

    return new Promise((resolve) => {
      chrome.storage.local.get(['crl_user_plan'], ({ crl_user_plan }) => {
        _cached = crl_user_plan ?? { plan: 'free', signedIn: false };
        _cacheTs = Date.now();
        resolve(_cached);
      });
    });
  }

  /** Force-clear the cache (call after billing events). */
  function invalidate() {
    _cached  = null;
    _cacheTs = 0;
  }

  // ── Limits accessor ───────────────────────────────────────────────────────────

  function getLimits(user) {
    const plan = user?.plan ?? 'free';
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  }

  // ── Gate functions ─────────────────────────────────────────────────────────────

  /**
   * Can the user create another command?
   * @param {object} user
   * @param {number} currentCommandCount
   */
  function canCreateCommand(user, currentCommandCount = 0) {
    const { maxCommands } = getLimits(user);
    return currentCommandCount < maxCommands;
  }

  /**
   * Can the user create another stack?
   * @param {object} user
   * @param {number} currentStackCount
   */
  function canCreateStack(user, currentStackCount = 0) {
    const { maxStacks } = getLimits(user);
    return currentStackCount < maxStacks;
  }

  /** Can the user use advanced variables ({{hostname}}, {{pageTitle}}, etc.)? */
  function canUseAdvancedVariables(user) {
    return getLimits(user).advancedVariables;
  }

  /** Can the user use context-aware commands (URL/domain conditions)? */
  function canUseContextCommands(user) {
    return getLimits(user).context;
  }

  /** Can the user run AI commands? */
  function canUseAICommands(user) {
    return getLimits(user).ai;
  }

  /** Can the user access shared team stacks? */
  function canUseTeamStacks(user) {
    return getLimits(user).team;
  }

  /** Does the user have AI credits remaining (for Pro+AI)? */
  function hasAICredits(user) {
    if (!canUseAICommands(user)) return false;
    const remaining = user?.aiCreditsRemaining ?? getLimits(user).aiCredits;
    return remaining > 0;
  }

  /** Human-readable plan label. */
  function planLabel(user) {
    return getLimits(user).label;
  }

  /** True if the user is on any paid plan. */
  function isPaid(user) {
    const plan = user?.plan ?? 'free';
    return plan !== 'free';
  }

  // ── Heavy-use counter ─────────────────────────────────────────────────────────
  // Tracks total command launches across sessions for the "10 uses" upsell nudge.

  const HEAVY_USE_KEY    = 'crl_launch_count';
  const HEAVY_USE_NUDGE  = 10;
  const HEAVY_USE_SHOWN  = 'crl_heavy_use_nudge_shown';

  async function recordLaunch() {
    return new Promise((resolve) => {
      chrome.storage.local.get([HEAVY_USE_KEY, HEAVY_USE_SHOWN], (data) => {
        const count  = (data[HEAVY_USE_KEY] ?? 0) + 1;
        const shown  = data[HEAVY_USE_SHOWN] ?? false;
        chrome.storage.local.set({ [HEAVY_USE_KEY]: count }, () => resolve({ count, shown }));
      });
    });
  }

  /**
   * Check if we should show the heavy-use upgrade nudge.
   * Returns true once, at the HEAVY_USE_NUDGE threshold, for free users.
   */
  async function shouldShowHeavyUseNudge(user) {
    if (isPaid(user)) return false;
    const { count, shown } = await recordLaunch();
    if (shown || count !== HEAVY_USE_NUDGE) return false;
    chrome.storage.local.set({ [HEAVY_USE_SHOWN]: true });
    return true;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    PLAN_LIMITS,
    getUser,
    invalidate,
    getLimits,
    canCreateCommand,
    canCreateStack,
    canUseAdvancedVariables,
    canUseContextCommands,
    canUseAICommands,
    canUseTeamStacks,
    hasAICredits,
    planLabel,
    isPaid,
    shouldShowHeavyUseNudge,
  };
})();
