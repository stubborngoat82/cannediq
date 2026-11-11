'use client';

/**
 * /admin — cannedIQ Admin Dashboard
 * Requires is_admin = true on the user's profile.
 * Calls: /api/admin/stats, /api/admin/users, /api/admin/teams, /api/admin/maintenance
 */

import { useState, useCallback, useEffect } from 'react';
import Logo from '@/components/Logo';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number;
  newThisMonth: number;
  suspendedCount: number;
  adminCount: number;
  pastDueCount: number;
  mrr: number;
  planCounts: Record<string, number>;
  totalTeamSeats: number;
  eulaCompliance: { accepted: number; total: number; pct: number };
}

interface AdminUser {
  id: string; email: string; full_name?: string; tier: string;
  is_admin?: boolean; suspended?: boolean; eula_version_accepted?: string;
  created_at: string; last_seen_at?: string;
}

interface TeamMember {
  id: string; email: string; full_name?: string; team_role: string;
  suspended?: boolean; eula_version_accepted?: string; joined_at?: string; created_at: string; tier?: string;
}

interface Team {
  id: string; name: string; created_at: string;
  owner: TeamMember; members: TeamMember[];
  seats_purchased: number; seats_used: number;
}

interface MaintenanceConfig { banner_message?: string; maintenance_mode?: boolean; updated_at?: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelative(iso?: string) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return fmtDate(iso);
}

const PLAN_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro', ai: 'Pro+AI', team: 'Team' };
const PLAN_COLORS: Record<string, string> = {
  free: 'bg-white/[0.06] text-[#888]',
  pro:  'bg-[#6c63ff]/20 text-[#a89fff]',
  ai:   'bg-emerald-500/15 text-emerald-400',
  team: 'bg-yellow-500/15 text-yellow-400',
};

function PlanBadge({ tier }: { tier: string }) {
  return <span className={`inline-flex items-center px-2 py-px rounded-full text-[11px] font-bold uppercase tracking-wide ${PLAN_COLORS[tier] ?? PLAN_COLORS.free}`}>{PLAN_LABELS[tier] ?? tier}</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = 'users' | 'teams' | 'billing' | 'eula' | 'maintenance';

export default function AdminPage() {
  const [token, setToken]       = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [authErr, setAuthErr]   = useState('');
  const [signing, setSigning]   = useState(false);

  const [authed, setAuthed]     = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [tab, setTab]           = useState<Tab>('users');
  const [stats, setStats]       = useState<AdminStats | null>(null);

  // ── Users tab state ──
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage]   = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userPlan, setUserPlan]     = useState('');
  const [userSusp, setUserSusp]     = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // ── Teams tab state ──
  const [teams, setTeams]       = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // ── EULA tab state ──
  const [eulaUsers, setEulaUsers] = useState<AdminUser[]>([]);

  // ── Maintenance tab state ──
  const [maint, setMaint]       = useState<MaintenanceConfig>({});
  const [banner, setBanner]     = useState('');
  const [maintMode, setMaintMode] = useState(false);
  const [maintSaving, setMaintSaving] = useState(false);
  const [maintMsg, setMaintMsg] = useState('');
  const [maintMsgOk, setMaintMsgOk] = useState(true);

  const LIMIT = 50;

  // ── Auth ──

  async function signIn() {
    setAuthErr(''); setSigning(true);
    try {
      const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res  = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.error || !data.access_token) { setAuthErr(data.error_description || data.error || 'Sign in failed.'); return; }

      // Verify admin via stats endpoint
      const statsRes  = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${data.access_token}` } });
      const statsData = await statsRes.json() as AdminStats & { error?: string };
      if (statsData.error) { setAuthErr(statsData.error === 'Admin access required' ? 'This account does not have admin access.' : statsData.error); return; }

      setToken(data.access_token);
      setAdminEmail(email);
      setStats(statsData);
      setAuthed(true);
    } catch { setAuthErr('Network error. Check your connection.'); }
    finally { setSigning(false); }
  }

  function signOut() { setAuthed(false); setToken(''); setPassword(''); setStats(null); }

  // ── Data loaders ──

  const loadUsers = useCallback(async (page = 0) => {
    setUsersLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (userSearch) params.set('search', userSearch);
    if (userPlan)   params.set('plan', userPlan);
    if (userSusp)   params.set('suspended', userSusp);
    const res  = await fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as { users?: AdminUser[]; total?: number; error?: string };
    if (!data.error) { setUsers(data.users ?? []); setUsersTotal(data.total ?? 0); setUsersPage(page); }
    setUsersLoading(false);
  }, [token, userSearch, userPlan, userSusp]);

  const loadTeams = useCallback(async () => {
    setTeamsLoading(true);
    const res  = await fetch('/api/admin/teams', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as { teams?: Team[]; error?: string };
    if (!data.error) { setTeams(data.teams ?? []); setExpandedTeams(new Set((data.teams ?? []).map(t => t.id))); }
    setTeamsLoading(false);
  }, [token]);

  const loadEula = useCallback(async () => {
    const res  = await fetch(`/api/admin/users?limit=200&page=0`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as { users?: AdminUser[] };
    setEulaUsers((data.users ?? []).filter(u => !u.eula_version_accepted));
  }, [token]);

  const loadMaint = useCallback(async () => {
    const res  = await fetch('/api/admin/maintenance', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as MaintenanceConfig;
    setMaint(data); setBanner(data.banner_message ?? ''); setMaintMode(!!data.maintenance_mode);
  }, [token]);

  // Init after sign-in
  useEffect(() => {
    if (!authed) return;
    loadUsers(0); loadTeams(); loadEula(); loadMaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  async function userAction(userId: string, action: string, value?: string | boolean) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, action, value }),
    });
    loadUsers(usersPage);
  }

  async function saveMaint() {
    setMaintSaving(true); setMaintMsg('');
    const res  = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ banner_message: banner.trim() || null, maintenance_mode: maintMode }),
    });
    const data = await res.json() as { config?: MaintenanceConfig; error?: string };
    setMaintSaving(false);
    if (data.error) { setMaintMsgOk(false); setMaintMsg(data.error); }
    else { setMaintMsgOk(true); setMaintMsg('✓ Saved — extension will pick up changes within 30 minutes.'); if (data.config) setMaint(data.config); setTimeout(() => setMaintMsg(''), 5000); }
  }

  function exportEulaCsv() {
    const csv = ['Email,Plan,Joined,EULA', ...eulaUsers.map(u => [u.email, u.tier, u.created_at?.split('T')[0] ?? '', 'Not accepted'].join(','))].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `cannediq-eula-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  }

  // ── Styles ──

  const surface  = 'bg-[#1a1d23]';
  const border   = 'border-white/[0.08]';
  const inputCls = `w-full px-3 py-2.5 ${surface} border ${border} rounded-lg text-[#e8e8f0] text-sm outline-none focus:border-[#6c63ff]`;
  const btnPrimary = 'px-4 py-1.5 bg-[#6c63ff] hover:bg-[#7d75ff] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 cursor-pointer';
  const btnGhost   = 'px-4 py-1.5 border border-white/[0.08] text-[#888] hover:text-[#e8e8f0] hover:bg-white/[0.05] text-sm font-medium rounded-lg transition-colors cursor-pointer';
  const btnDanger  = 'px-3 py-1 bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 text-xs font-medium rounded-lg transition-colors cursor-pointer';
  const thCls = 'px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-[#888] bg-[#21242c] border-b border-white/[0.08]';
  const tdCls = 'px-3.5 py-2.5 text-sm border-b border-white/[0.05] align-middle';

  // ── Auth screen ──

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0f1117' }}>
      <div className={`w-full max-w-sm ${surface} border ${border} rounded-2xl p-9`}>
        <div className="mb-5">
          <Logo showWordmark iconSize={28} />
        </div>
        <h1 className="text-lg font-bold text-[#e8e8f0] mb-1">Admin Portal</h1>
        <p className="text-sm text-[#888] mb-6">Sign in with your admin account to continue.</p>
        <input type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email address"    autoComplete="email"            className={inputCls + ' mb-2.5'} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"         autoComplete="current-password" className={inputCls + ' mb-2'}
          onKeyDown={e => e.key === 'Enter' && signIn()} />
        {authErr && <p className="text-xs text-red-400 mb-3">{authErr}</p>}
        <button onClick={signIn} disabled={signing} className={btnPrimary + ' w-full mt-2'}>
          {signing ? 'Signing in…' : 'Sign In'}
        </button>
      </div>
    </div>
  );

  // ── App shell ──

  const TABS: { id: Tab; label: string }[] = [
    { id: 'users',       label: '👥 Users' },
    { id: 'teams',       label: '🏢 Teams' },
    { id: 'billing',     label: '💰 Billing' },
    { id: 'eula',        label: '📋 EULA' },
    { id: 'maintenance', label: '🔧 Maintenance' },
  ];

  return (
    <div style={{ background: '#0f1117', minHeight: '100vh', color: '#e8e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: '14px' }}>

      {/* Topbar */}
      <div className={`sticky top-0 z-50 flex items-center justify-between px-6 h-[52px] ${surface} border-b ${border}`}>
        <div className="flex items-center gap-3">
          <Logo showWordmark iconSize={24} />
          <span className="text-[10px] font-bold px-2 py-0.5 bg-[#6c63ff]/20 text-[#6c63ff] rounded-full uppercase tracking-wide">Admin</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#888]">
          <span>{adminEmail}</span>
          <button onClick={signOut} className="px-2 py-1 hover:text-[#e8e8f0] hover:bg-white/[0.05] rounded transition-colors">Sign out</button>
        </div>
      </div>

      {/* Tab nav */}
      <div className={`flex gap-0.5 px-6 ${surface} border-b ${border}`}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'text-[#6c63ff] border-[#6c63ff]' : 'text-[#888] border-transparent hover:text-[#e8e8f0]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-7">

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <div>
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 mb-7">
                {[
                  { label: 'Total Users',    value: stats.totalUsers.toLocaleString(), color: '' },
                  { label: 'New This Month', value: String(stats.newThisMonth),        color: 'text-emerald-400' },
                  { label: 'Suspended',      value: String(stats.suspendedCount),      color: stats.suspendedCount > 0 ? 'text-red-400' : '' },
                  { label: 'Admins',         value: String(stats.adminCount),          color: '' },
                  { label: 'Past Due',       value: String(stats.pastDueCount),        color: stats.pastDueCount > 0 ? 'text-yellow-400' : '' },
                ].map(s => (
                  <div key={s.label} className={`${surface} border ${border} rounded-xl p-4`}>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-2">{s.label}</div>
                    <div className={`text-2xl font-bold ${s.color || 'text-[#e8e8f0]'}`}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-2 mb-3.5 flex-wrap">
              <input value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers(0)}
                placeholder="Search email or name…" className={`flex-1 min-w-[180px] px-3 py-2 ${surface} border ${border} rounded-lg text-sm text-[#e8e8f0] outline-none focus:border-[#6c63ff]`} />
              <select value={userPlan} onChange={e => setUserPlan(e.target.value)} className={`px-3 py-2 ${surface} border ${border} rounded-lg text-sm text-[#e8e8f0] outline-none`}>
                <option value="">All plans</option>
                <option value="free">Free</option><option value="pro">Pro</option><option value="ai">Pro+AI</option><option value="team">Team</option>
              </select>
              <select value={userSusp} onChange={e => setUserSusp(e.target.value)} className={`px-3 py-2 ${surface} border ${border} rounded-lg text-sm text-[#e8e8f0] outline-none`}>
                <option value="">All statuses</option><option value="false">Active</option><option value="true">Suspended</option>
              </select>
              <button onClick={() => loadUsers(0)} className={btnGhost}>Search</button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-[15px] font-semibold">All Users</span>
              <span className="text-xs text-[#888]">{usersTotal.toLocaleString()} users</span>
            </div>

            <div className={`${surface} border ${border} rounded-xl overflow-hidden`}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Email','Name','Plan','EULA','Joined','Last seen','Actions'].map(h => <th key={h} className={thCls}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {usersLoading
                    ? <tr><td colSpan={7} className="text-center py-12 text-[#888] text-sm">Loading…</td></tr>
                    : users.length === 0
                      ? <tr><td colSpan={7} className="text-center py-12 text-[#888] text-sm">No users found</td></tr>
                      : users.map(u => (
                        <tr key={u.id} className="hover:bg-white/[0.025]">
                          <td className={tdCls}>
                            <span className="font-mono text-xs">{u.email || '—'}</span>
                            {u.is_admin && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-px bg-[#6c63ff]/25 text-[#6c63ff] rounded-full uppercase">admin</span>}
                          </td>
                          <td className={tdCls}>{u.full_name || <span className="text-[#888]">—</span>}</td>
                          <td className={tdCls}>
                            <PlanBadge tier={u.tier} />
                            {u.suspended && <span className="ml-1 text-[10px] font-bold px-1.5 py-px bg-red-500/15 text-red-400 rounded-full uppercase">suspended</span>}
                          </td>
                          <td className={tdCls}>
                            {u.eula_version_accepted
                              ? <span className="text-[10px] font-bold px-1.5 py-px bg-emerald-500/15 text-emerald-400 rounded-full">v{u.eula_version_accepted}</span>
                              : <span className="text-[10px] font-bold px-1.5 py-px bg-white/[0.06] text-[#888] rounded-full">No</span>}
                          </td>
                          <td className={tdCls + ' text-[#888] text-xs'}>{fmtDate(u.created_at)}</td>
                          <td className={tdCls + ' text-[#888] text-xs'}>{fmtRelative(u.last_seen_at)}</td>
                          <td className={tdCls}>
                            <div className="flex gap-1.5 flex-wrap">
                              <select defaultValue="" onChange={e => { if (e.target.value) { userAction(u.id, 'set_plan', e.target.value); e.target.value = ''; } }}
                                className={`px-2 py-1 bg-[#21242c] border ${border} rounded-md text-xs text-[#e8e8f0] outline-none`}>
                                <option value="">Set plan…</option>
                                <option value="free">Free</option><option value="pro">Pro</option><option value="ai">Pro+AI</option><option value="team">Team</option>
                              </select>
                              <button onClick={() => userAction(u.id, u.suspended ? 'unsuspend' : 'suspend')}
                                className={u.suspended ? btnGhost + ' text-xs px-2 py-1' : btnDanger}>
                                {u.suspended ? 'Unsuspend' : 'Suspend'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
              {/* Pagination */}
              <div className={`flex items-center justify-between px-4 py-3 border-t ${border} text-xs text-[#888]`}>
                <span>{usersTotal > 0 ? `${usersPage * LIMIT + 1}–${Math.min((usersPage + 1) * LIMIT, usersTotal)} of ${usersTotal.toLocaleString()}` : ''}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => loadUsers(usersPage - 1)} disabled={usersPage === 0} className={btnGhost + ' text-xs px-3 py-1 disabled:opacity-30'}>← Prev</button>
                  <button onClick={() => loadUsers(usersPage + 1)} disabled={(usersPage + 1) * LIMIT >= usersTotal} className={btnGhost + ' text-xs px-3 py-1 disabled:opacity-30'}>Next →</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Teams tab ── */}
        {tab === 'teams' && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[15px] font-semibold">Teams</span>
              <span className="text-xs text-[#888]">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            </div>
            {teamsLoading
              ? <p className="text-center py-12 text-[#888] text-sm">Loading…</p>
              : teams.length === 0
                ? <p className="text-center py-12 text-[#888] text-sm">No teams yet.</p>
                : teams.map(team => {
                    const isOpen = expandedTeams.has(team.id);
                    const seatPct = team.seats_purchased > 0 ? Math.round(team.seats_used / team.seats_purchased * 100) : 0;
                    const allMembers = [{ ...team.owner, team_role: 'owner' }, ...team.members];
                    return (
                      <div key={team.id} className={`${surface} border ${border} rounded-xl mb-3 overflow-hidden`}>
                        <div className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-white/[0.03]"
                          onClick={() => setExpandedTeams(prev => { const next = new Set(prev); isOpen ? next.delete(team.id) : next.add(team.id); return next; })}>
                          <span className="text-[11px] text-[#888] w-4 text-center transition-transform" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : '' }}>▶</span>
                          <div className="flex-[0_0_180px]">
                            <div className="font-semibold text-sm">{team.name}</div>
                            <div className="text-[11px] text-[#888]">{fmtDate(team.created_at)}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-xs text-[#e8e8f0]">{team.owner?.email || '—'}</div>
                            <div className="text-[11px] text-[#888]">{team.owner?.full_name || ''}</div>
                          </div>
                          <div className="flex-[0_0_110px] text-right">
                            <div className="text-xs text-[#888]">{team.seats_used} / {team.seats_purchased} seats</div>
                            <div className="mt-1 h-1 bg-[#21242c] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${seatPct}%`, background: seatPct > 90 ? '#ef4444' : '#6c63ff' }} />
                            </div>
                          </div>
                          <div className="flex-[0_0_100px] text-right text-xs text-[#888]">{team.members.length + 1} member{team.members.length !== 0 ? 's' : ''}</div>
                        </div>
                        {isOpen && (
                          <div className={`border-t ${border}`}>
                            <div className={`grid px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-[#888] border-b ${border}`} style={{ gridTemplateColumns: '46px 100px 1fr 140px 80px 100px 140px' }}>
                              <div /><div>Role</div><div>Email</div><div>Name</div><div>EULA</div><div>Joined</div><div>Actions</div>
                            </div>
                            {allMembers.map(m => (
                              <div key={m.id} className={`grid items-center px-4 py-2.5 border-b ${border} last:border-0 hover:bg-white/[0.02] text-xs`} style={{ gridTemplateColumns: '46px 100px 1fr 140px 80px 100px 140px' }}>
                                <div />
                                <div>
                                  <span className={`text-[10px] font-bold px-1.5 py-px rounded uppercase ${m.team_role === 'owner' ? 'bg-[#6c63ff]/20 text-[#a89fff]' : m.team_role === 'admin' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-white/[0.06] text-[#888]'}`}>{m.team_role || 'member'}</span>
                                </div>
                                <div className="font-mono text-xs truncate text-[#e8e8f0]">{m.email || '—'} {m.suspended && '🚫'}</div>
                                <div className="truncate text-[#888]">{m.full_name || '—'}</div>
                                <div>
                                  {m.eula_version_accepted
                                    ? <span className="text-[10px] font-bold px-1.5 py-px bg-emerald-500/15 text-emerald-400 rounded-full">v{m.eula_version_accepted}</span>
                                    : <span className="text-[10px] font-bold px-1.5 py-px bg-white/[0.06] text-[#888] rounded-full">No</span>}
                                </div>
                                <div className="text-[#888]">{fmtDate(m.joined_at || m.created_at)}</div>
                                <div className="flex gap-1.5">
                                  <select defaultValue={m.tier || ''} onChange={async e => { if (e.target.value) { await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: m.id, action: 'set_plan', value: e.target.value }) }); loadTeams(); } }}
                                    className={`px-1.5 py-1 bg-[#21242c] border ${border} rounded text-[11px] text-[#e8e8f0] outline-none`}>
                                    <option value="">Plan…</option>
                                    <option value="free">Free</option><option value="pro">Pro</option><option value="ai">AI</option><option value="team">Team</option>
                                  </select>
                                  <button onClick={async () => { await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: m.id, action: m.suspended ? 'unsuspend' : 'suspend' }) }); loadTeams(); }}
                                    className={m.suspended ? btnGhost + ' text-[11px] px-2 py-0.5' : btnDanger + ' text-[11px] px-2 py-0.5'}>
                                    {m.suspended ? 'Unsuspend' : 'Suspend'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
            }
          </div>
        )}

        {/* ── Billing tab ── */}
        {tab === 'billing' && stats && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-7">
              {[
                { label: 'Est. MRR',   value: `$${stats.mrr.toLocaleString()}`, sub: 'Monthly recurring revenue', color: 'text-emerald-400' },
                { label: 'Paid Users', value: String((stats.planCounts.pro || 0) + (stats.planCounts.ai || 0) + (stats.planCounts.team || 0)), color: '' },
                { label: 'Team Seats', value: String(stats.totalTeamSeats), sub: 'Across all teams', color: '' },
                { label: 'Past Due',   value: String(stats.pastDueCount), sub: 'Failed payment', color: stats.pastDueCount > 0 ? 'text-red-400' : '' },
              ].map(s => (
                <div key={s.label} className={`${surface} border ${border} rounded-xl p-4`}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-2">{s.label}</div>
                  <div className={`text-2xl font-bold ${s.color || 'text-[#e8e8f0]'}`}>{s.value}</div>
                  {s.sub && <div className="text-[11px] text-[#888] mt-1">{s.sub}</div>}
                </div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className={`${surface} border ${border} rounded-xl p-5`}>
                <div className="text-[15px] font-semibold mb-4">Plan Distribution</div>
                <div className="flex flex-col gap-2.5">
                  {(['free','pro','ai','team'] as string[]).map(p => {
                    const count = stats.planCounts[p] || 0;
                    const pct   = stats.totalUsers ? Math.round(count / stats.totalUsers * 100) : 0;
                    const color = { free:'#444', pro:'#6c63ff', ai:'#22c55e', team:'#f59e0b' }[p] ?? '#444';
                    return (
                      <div key={p} className="flex items-center gap-2.5">
                        <div className="w-14 text-right text-[12px] text-[#888]">{PLAN_LABELS[p]}</div>
                        <div className="flex-1 h-2 bg-[#21242c] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
                        <div className="w-8 text-right text-[12px] text-[#888]">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={`${surface} border ${border} rounded-xl p-5`}>
                <div className="text-[15px] font-semibold mb-4">Revenue Breakdown</div>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Pro ($10/mo)',    (stats.planCounts.pro || 0) * 10],
                      ['Pro+AI ($20/mo)', (stats.planCounts.ai  || 0) * 20],
                      ['Team ($12/seat)', stats.totalTeamSeats * 12],
                    ].map(([label, val]) => (
                      <tr key={label as string}>
                        <td className="py-1.5 text-[#888]">{label as string}</td>
                        <td className="py-1.5 text-right text-[#e8e8f0]">${(val as number).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-white/[0.08]">
                      <td className="pt-3 pb-1 font-semibold text-[#e8e8f0]">Total MRR</td>
                      <td className="pt-3 pb-1 text-right font-bold text-lg text-emerald-400">${stats.mrr.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── EULA tab ── */}
        {tab === 'eula' && stats && (
          <div>
            <div className="grid grid-cols-3 gap-3.5 mb-7">
              <div className={`${surface} border ${border} rounded-xl p-4`}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-2">Accepted</div>
                <div className="text-2xl font-bold text-emerald-400">{stats.eulaCompliance.accepted}</div>
              </div>
              <div className={`${surface} border ${border} rounded-xl p-4`}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-2">Compliance Rate</div>
                <div className={`text-2xl font-bold ${stats.eulaCompliance.pct < 80 ? 'text-yellow-400' : 'text-[#e8e8f0]'}`}>{stats.eulaCompliance.pct}%</div>
                <div className="mt-2 h-1.5 bg-[#21242c] rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.eulaCompliance.pct}%` }} /></div>
              </div>
              <div className={`${surface} border ${border} rounded-xl p-4`}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#888] mb-2">Not Accepted</div>
                <div className={`text-2xl font-bold ${stats.eulaCompliance.total - stats.eulaCompliance.accepted > 0 ? 'text-red-400' : 'text-[#e8e8f0]'}`}>{stats.eulaCompliance.total - stats.eulaCompliance.accepted}</div>
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[15px] font-semibold">Users Without EULA Acceptance</span>
              <button onClick={exportEulaCsv} className={btnGhost + ' text-xs'}>⬇ Export CSV</button>
            </div>
            <div className={`${surface} border ${border} rounded-xl overflow-hidden`}>
              <table className="w-full border-collapse">
                <thead><tr>{['Email','Plan','Joined','EULA Status'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {eulaUsers.length === 0
                    ? <tr><td colSpan={4} className="text-center py-8 text-[#888] text-sm">🎉 All users have accepted the EULA</td></tr>
                    : eulaUsers.map(u => (
                        <tr key={u.id} className="hover:bg-white/[0.025]">
                          <td className={tdCls + ' font-mono text-xs'}>{u.email}</td>
                          <td className={tdCls}><PlanBadge tier={u.tier} /></td>
                          <td className={tdCls + ' text-[#888] text-xs'}>{fmtDate(u.created_at)}</td>
                          <td className={tdCls}><span className="text-[10px] font-bold px-1.5 py-px bg-white/[0.06] text-[#888] rounded-full">Not accepted</span></td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Maintenance tab ── */}
        {tab === 'maintenance' && (
          <div>
            <div className={`${surface} border ${border} rounded-xl p-6 mb-5`}>
              <h3 className="text-sm font-semibold mb-4">🔔 Extension Banner</h3>
              <label className="block text-xs text-[#888] mb-1.5">Banner message — shown to all active extension users</label>
              <textarea value={banner} onChange={e => setBanner(e.target.value)} rows={3}
                placeholder="e.g. We're performing maintenance tonight from 10pm–midnight PT."
                className={`w-full px-3 py-2.5 bg-[#21242c] border ${border} rounded-lg text-sm text-[#e8e8f0] outline-none focus:border-[#6c63ff] resize-y min-h-[80px]`} />
              <p className="text-[11px] text-[#888] mt-1.5">Leave blank to clear the banner.</p>

              <div className={`flex items-center justify-between py-4 border-t ${border} mt-4`}>
                <div>
                  <div className="text-sm font-medium">🚨 Maintenance Mode</div>
                  <div className="text-xs text-[#888] mt-1">Disables command execution in the extension. Users see a maintenance message instead.</div>
                </div>
                <label className="relative inline-block w-10 h-6 shrink-0 cursor-pointer">
                  <input type="checkbox" checked={maintMode} onChange={e => setMaintMode(e.target.checked)} className="sr-only peer" />
                  <span className="absolute inset-0 rounded-full border border-white/[0.08] bg-[#21242c] peer-checked:bg-[#6c63ff] peer-checked:border-[#6c63ff] transition-all" />
                  <span className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-[#888] peer-checked:bg-white peer-checked:translate-x-[18px] transition-all" />
                </label>
              </div>

              <div className="flex gap-2 mt-4">
                <button onClick={saveMaint} disabled={maintSaving} className={btnPrimary}>{maintSaving ? 'Saving…' : 'Save Changes'}</button>
                <button onClick={() => { setBanner(''); setMaintMode(false); saveMaint(); }} className={btnGhost}>Clear Banner</button>
              </div>
              {maintMsg && <p className={`text-xs mt-2 ${maintMsgOk ? 'text-emerald-400' : 'text-red-400'}`}>{maintMsg}</p>}
            </div>

            <div className={`${surface} border ${border} rounded-xl p-6`}>
              <h3 className="text-sm font-semibold mb-4">📡 Current Config (live)</h3>
              <div className="text-sm space-y-2">
                <div><strong className="text-[#e8e8f0]">Banner:</strong> {maint.banner_message ? <em className="text-yellow-400">&ldquo;{maint.banner_message}&rdquo;</em> : <span className="text-[#888]">None</span>}</div>
                <div><strong className="text-[#e8e8f0]">Maintenance mode:</strong> {maint.maintenance_mode ? <span className="text-red-400">🚨 ON</span> : <span className="text-emerald-400">✓ Off</span>}</div>
                {maint.updated_at && <div className="text-[11px] text-[#888]">Last updated {fmtRelative(maint.updated_at)}</div>}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
