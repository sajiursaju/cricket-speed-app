import React, { useEffect, useState } from 'react';
import { CheckCircle, Plus, Shield, Trash2, UserPlus } from 'lucide-react';
import type {
  AnalyticsData,
  AppSettings,
  BallType,
  MatchRecord,
  PitchMode,
  PublicUser,
  SubscriptionTier,
  Team,
  Tournament,
  UserRole,
} from '../types';

interface AdminWorkspaceViewProps {
  currentUser: PublicUser | null;
  authToken: string | null;
  matches: MatchRecord[];
  teams: Team[];
  tournaments: Tournament[];
  settings: AppSettings;
  analytics: AnalyticsData | null;
  onRefreshAll: () => Promise<void>;
  onOpenAuth: () => void;
}

export function AdminWorkspaceView({
  currentUser,
  authToken,
  matches,
  teams,
  tournaments,
  settings,
  analytics,
  onRefreshAll,
  onOpenAuth,
}: AdminWorkspaceViewProps) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Super Admin: Create Managing Admin / Scorer form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('MANAGING_ADMIN');
  const [newUserTier, setNewUserTier] = useState<SubscriptionTier>('CLUB_PRO');

  // Super Admin: Global Settings
  const [presetsInput, setPresetsInput] = useState(settings.shortPitchPresetsYards.join(', '));
  const [maxFps, setMaxFps] = useState<60 | 120>(settings.maxFpsTarget);

  // Managing Admin: Create Tournament
  const [tournName, setTournName] = useState('');
  const [tournCity, setTournCity] = useState('');
  const [tournMode, setTournMode] = useState<PitchMode>('SHORT_PITCH');
  const [tournYards, setTournYards] = useState(14);
  const [tournOvers, setTournOvers] = useState(6);

  // Managing Admin: Create Team
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [teamPlayers, setTeamPlayers] = useState('Bilal Khan, Usman Ali, Tariq Shah, Hamza Malik, Zain Raza, Fahad Noor');

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isManagingOrAbove = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MANAGING_ADMIN';

  const loadUsers = async () => {
    if (!authToken || !isManagingOrAbove) return;
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch {
      // Ignore transient error
    }
  };

  useEffect(() => {
    loadUsers();
  }, [authToken, currentUser?.role]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        fullName: newUserName,
        email: newUserEmail,
        password: newUserPassword,
        role: newUserRole,
        subscriptionTier: newUserTier,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Failed to create user.');
    else {
      setFeedback(`Created ${data.user.role} account for ${data.user.fullName}.`);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      await loadUsers();
      await onRefreshAll();
    }
  };

  const handleToggleUserStatus = async (u: PublicUser) => {
    setError(null);
    const nextStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Could not update user.');
    else await loadUsers();
  };

  const handleDeleteUser = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Could not delete user.');
    else await loadUsers();
  };

  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = presetsInput
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 8 && n <= 20);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        shortPitchPresetsYards: parsed.length ? parsed : [12, 14, 15, 16],
        maxFpsTarget: maxFps,
      }),
    });
    if (res.ok) {
      setFeedback('Updated global pitch presets and camera FPS target.');
      await onRefreshAll();
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: tournName,
        city: tournCity,
        formatCategory: tournMode,
        defaultPitchYards: tournYards,
        defaultOvers: tournOvers,
        ballType: (tournMode === 'SHORT_PITCH' ? 'TAPE_GREEN' : 'LEATHER_RED') as BallType,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Could not create tournament.');
    else {
      setFeedback(`Tournament "${data.tournament.name}" created.`);
      setTournName('');
      setTournCity('');
      await onRefreshAll();
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        tournamentId: tournaments[0]?.id || null,
        name: teamName,
        shortCode: teamCode,
        playerNames: teamPlayers.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Could not create team.');
    else {
      setFeedback(`Team "${data.team.name}" added with ${data.team.players.length} players.`);
      setTeamName('');
      setTeamCode('');
      await onRefreshAll();
    }
  };

  const handleVerifyMatch = async (matchId: string) => {
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.ok) {
      setFeedback('Match result verified and locked.');
      await onRefreshAll();
    }
  };

  const handleAssignScorer = async (matchId: string, scorerId: string) => {
    setError(null);
    const res = await fetch(`/api/matches/${matchId}/assign-scorer`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ scorerId: scorerId || null }),
    });
    if (res.ok) {
      setFeedback('Assigned match scorer.');
      await onRefreshAll();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1410]">Role Hierarchy &amp; Tournament Admin</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Tiered access control: Super Admin (MD / CEO) · Managing Admin · Scorer / Umpire
          </p>
        </div>
        {!currentUser && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-4 py-2.5 min-h-[44px] bg-[#0E7A49] text-white text-sm font-semibold rounded-lg self-start cursor-pointer"
          >
            Sign In / Claim Super Admin
          </button>
        )}
      </div>

      {/* Global Analytics KPI Row */}
      {analytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#DDE3DE] rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Total Matches</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1410] mt-1">
              {analytics.globalSummary.totalMatches}
            </p>
          </div>
          <div className="bg-white border border-[#DDE3DE] rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Active Tournaments</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1410] mt-1">
              {analytics.globalSummary.activeTournaments}
            </p>
          </div>
          <div className="bg-white border border-[#DDE3DE] rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Deliveries Tracked</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1410] mt-1">
              {analytics.globalSummary.totalBallsTracked}
            </p>
          </div>
          <div className="bg-white border border-[#DDE3DE] rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">Peak Radar Speed</p>
            <p className="font-mono tabular-nums text-2xl font-bold text-[#0E7A49] mt-1">
              {analytics.globalSummary.fastestDeliveryKmh.toFixed(1)} km/h
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-[#0E7A49]">
          {feedback}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-[#C81E2B]">
          {error}
        </div>
      )}

      {!isManagingOrAbove ? (
        <section className="bg-white border border-[#DDE3DE] rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-[#0B1410]">
            <Shield className="w-5 h-5 text-[#0E7A49]" />
            <h2 className="font-display text-lg font-bold">Administrative Access Required</h2>
          </div>
          <p className="text-sm text-slate-600 max-w-2xl">
            {currentUser
              ? `You are signed in as ${currentUser.fullName} (${currentUser.role}). Only Super Admins and Managing Admins can manage tournaments, verify results, or administer staff accounts.`
              : 'Sign in or claim the Super Admin (MD / CEO) workspace account to create Managing Admins, configure global pitch presets, create tournaments, and verify match results.'}
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="px-4 py-2.5 bg-[#0B1410] text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            {currentUser ? 'Switch Role Account' : 'Sign In / Setup Workspace'}
          </button>
        </section>
      ) : (
        <div className="space-y-6">
          {/* Tier 1: Super Admin (MD / CEO) Controls */}
          {isSuperAdmin && (
            <section className="bg-white border border-[#DDE3DE] rounded-xl p-5 sm:p-6 space-y-6">
              <div className="border-b border-[#DDE3DE] pb-4">
                <h2 className="font-display text-lg font-bold text-[#0B1410]">Super Admin Console (MD / CEO)</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Manage Managing Admins, Scorers, subscription tiers, and global pitch presets.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Create User Form */}
                <form onSubmit={handleCreateUser} className="lg:col-span-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#0B1410] flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#0E7A49]" />
                    Provision Managing Admin or Scorer
                  </h3>
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email address"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Temporary password (min 6 chars)"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="h-10 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
                    >
                      <option value="MANAGING_ADMIN">Managing Admin</option>
                      <option value="SCORER">Scorer / Umpire</option>
                    </select>
                    <select
                      value={newUserTier}
                      onChange={(e) => setNewUserTier(e.target.value as SubscriptionTier)}
                      className="h-10 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
                    >
                      <option value="COMMUNITY">Community Free</option>
                      <option value="CLUB_PRO">Club Pro</option>
                      <option value="LEAGUE_ENTERPRISE">League Enterprise</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full h-11 bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Create Account
                  </button>
                </form>

                {/* Users Table + Global Pitch Settings */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="overflow-x-auto border border-[#DDE3DE] rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#DDE3DE] text-xs text-slate-500 bg-slate-50">
                          <th className="text-left font-medium px-4 py-2.5">User</th>
                          <th className="text-left font-medium px-3 py-2.5">Role / Tier</th>
                          <th className="text-left font-medium px-3 py-2.5">Status</th>
                          <th className="text-right font-medium px-4 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold text-[#0B1410]">{u.fullName}</p>
                              <p className="text-xs text-slate-500">{u.email}</p>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-slate-700">
                              {u.role} · {u.subscriptionTier}
                            </td>
                            <td className="px-3 py-2.5 text-xs font-semibold">
                              <span className={u.status === 'ACTIVE' ? 'text-[#0E7A49]' : 'text-[#C81E2B]'}>
                                {u.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {u.id !== currentUser?.id && (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleUserStatus(u)}
                                    className="px-2.5 py-1 text-xs font-semibold border border-[#DDE3DE] rounded hover:bg-slate-50 cursor-pointer"
                                  >
                                    {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="p-1.5 text-[#C81E2B] hover:bg-red-50 rounded cursor-pointer"
                                    aria-label={`Delete ${u.fullName}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <form onSubmit={handleSaveGlobalSettings} className="flex flex-col sm:flex-row items-end gap-3 pt-2">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Short Pitch Presets (yards, comma-separated)
                      </label>
                      <input
                        type="text"
                        value={presetsInput}
                        onChange={(e) => setPresetsInput(e.target.value)}
                        className="w-full h-10 px-3 text-sm font-mono border border-[#DDE3DE] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Camera FPS Target</label>
                      <select
                        value={maxFps}
                        onChange={(e) => setMaxFps(Number(e.target.value) as 60 | 120)}
                        className="h-10 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
                      >
                        <option value={60}>60 fps</option>
                        <option value={120}>120 fps</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="h-10 px-4 bg-[#0B1410] text-white text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      Save Presets
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}

          {/* Tier 2: Managing Admin Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleCreateTournament} className="bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-[#0B1410]">Create Tournament</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Tournament Name"
                  value={tournName}
                  onChange={(e) => setTournName(e.target.value)}
                  className="h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                />
                <input
                  type="text"
                  placeholder="City / Ground"
                  value={tournCity}
                  onChange={(e) => setTournCity(e.target.value)}
                  className="h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                />
                <select
                  value={tournMode}
                  onChange={(e) => {
                    const m = e.target.value as PitchMode;
                    setTournMode(m);
                    setTournYards(m === 'SHORT_PITCH' ? 14 : 22);
                    setTournOvers(m === 'SHORT_PITCH' ? 6 : 20);
                  }}
                  className="h-10 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
                >
                  <option value="SHORT_PITCH">Short Pitch (Tape Ball)</option>
                  <option value="LONG_PITCH">Long Pitch (Standard)</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={8}
                    max={25}
                    value={tournYards}
                    onChange={(e) => setTournYards(Number(e.target.value))}
                    className="w-1/2 h-10 px-3 text-sm font-mono border border-[#DDE3DE] rounded-lg"
                    title="Pitch Yards"
                  />
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={tournOvers}
                    onChange={(e) => setTournOvers(Number(e.target.value))}
                    className="w-1/2 h-10 px-3 text-sm font-mono border border-[#DDE3DE] rounded-lg"
                    title="Overs"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="h-10 px-4 bg-[#0E7A49] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Tournament
              </button>
            </form>

            <form onSubmit={handleCreateTeam} className="bg-white border border-[#DDE3DE] rounded-xl p-5 space-y-3">
              <h2 className="font-display text-base font-bold text-[#0B1410]">Register Team &amp; Roster</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Team Name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="sm:col-span-2 h-10 px-3 text-sm border border-[#DDE3DE] rounded-lg"
                />
                <input
                  type="text"
                  required
                  maxLength={4}
                  placeholder="Code (e.g. LHR)"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value)}
                  className="h-10 px-3 text-sm font-mono uppercase border border-[#DDE3DE] rounded-lg"
                />
              </div>
              <input
                type="text"
                value={teamPlayers}
                onChange={(e) => setTeamPlayers(e.target.value)}
                placeholder="Comma-separated player names"
                className="w-full h-10 px-3 text-xs border border-[#DDE3DE] rounded-lg"
              />
              <button
                type="submit"
                className="h-10 px-4 bg-[#0B1410] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Save Team Roster
              </button>
            </form>
          </div>

          {/* Match Verification & Scorer Assignment */}
          <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#DDE3DE]">
              <h2 className="font-display text-base font-bold text-[#0B1410]">Match Scorer Assignment &amp; Verification</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {matches.map((m) => (
                <div key={m.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-sm text-[#0B1410]">{m.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.rules.pitchMode === 'SHORT_PITCH' ? 'Short Pitch' : 'Long Pitch'} · {m.rules.pitchDistanceYards} yd ·{' '}
                      {m.status}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={m.assignedScorerId || ''}
                      onChange={(e) => handleAssignScorer(m.id, e.target.value)}
                      className="h-9 px-2.5 text-xs bg-white border border-[#DDE3DE] rounded-lg"
                    >
                      <option value="">Unassigned Scorer</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.role})
                        </option>
                      ))}
                    </select>

                    {m.status !== 'VERIFIED' ? (
                      <button
                        type="button"
                        onClick={() => handleVerifyMatch(m.id)}
                        className="h-9 px-3 bg-[#0E7A49] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve &amp; Verify
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-[#0E7A49]">Verified Result</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tournament Batting & Bowling Leaderboards */}
          {analytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#DDE3DE]">
                  <h3 className="font-display text-sm font-bold text-[#0B1410]">Top Run-Scorers</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {analytics.topRunScorers.map((p) => (
                    <div key={p.playerId} className="px-5 py-2.5 flex justify-between text-sm">
                      <span className="font-medium text-[#0B1410]">
                        {p.name} <span className="text-xs text-slate-500">({p.teamName})</span>
                      </span>
                      <span className="font-mono tabular-nums font-bold">
                        {p.runs} <span className="text-xs font-normal text-slate-500">({p.balls}b)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#DDE3DE]">
                  <h3 className="font-display text-sm font-bold text-[#0B1410]">Top Wicket-Takers</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {analytics.topWicketTakers.map((p) => (
                    <div key={p.playerId} className="px-5 py-2.5 flex justify-between text-sm">
                      <span className="font-medium text-[#0B1410]">
                        {p.name} <span className="text-xs text-slate-500">({p.teamName})</span>
                      </span>
                      <span className="font-mono tabular-nums font-bold">
                        {p.wickets} wkts <span className="text-xs font-normal text-slate-500">(Econ {p.economy})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
