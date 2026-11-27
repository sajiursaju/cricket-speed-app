import React, { useState } from 'react';
import { Camera, Plus, RotateCcw, ShieldAlert, Trophy } from 'lucide-react';
import type {
  AppSettings,
  BallType,
  DismissalType,
  ExtraType,
  MatchRecord,
  PendingSpeed,
  PitchMode,
  PublicUser,
  Team,
  Tournament,
} from '../types';

interface LiveScorerViewProps {
  matches: MatchRecord[];
  activeMatch: MatchRecord | null;
  teams: Team[];
  tournaments: Tournament[];
  settings: AppSettings;
  currentUser: PublicUser | null;
  authToken: string | null;
  pendingSpeed: PendingSpeed | null;
  onSelectMatch: (matchId: string) => void;
  onMatchUpdated: (match: MatchRecord) => void;
  onClearPendingSpeed: () => void;
  onOpenRadar: () => void;
  onOpenAuth: () => void;
}

const BALL_TYPE_LABELS: Record<BallType, string> = {
  TAPE_GREEN: 'Tape Ball (Green)',
  TENNIS_YELLOW: 'Tennis Ball (Yellow)',
  LEATHER_RED: 'Leather Ball (Red)',
  LEATHER_WHITE: 'Leather Ball (White)',
};

export function LiveScorerView({
  matches,
  activeMatch,
  teams,
  tournaments,
  settings,
  currentUser,
  authToken,
  pendingSpeed,
  onSelectMatch,
  onMatchUpdated,
  onClearPendingSpeed,
  onOpenRadar,
  onOpenAuth,
}: LiveScorerViewProps) {
  const [showNewMatch, setShowNewMatch] = useState(false);
  const [showWicketPicker, setShowWicketPicker] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New Match Configuration State
  const [pitchMode, setPitchMode] = useState<PitchMode>('SHORT_PITCH');
  const [pitchYards, setPitchYards] = useState<number>(settings.shortPitchPresetsYards[1] || 14);
  const [oversLimit, setOversLimit] = useState<number>(6);
  const [ballType, setBallType] = useState<BallType>('TAPE_GREEN');
  const [singleRunAllowed, setSingleRunAllowed] = useState(true);
  const [boundaryOnlyMode, setBoundaryOnlyMode] = useState(false);
  const [tournamentId, setTournamentId] = useState<string>(tournaments[0]?.id || '');
  const [teamAId, setTeamAId] = useState<string>(teams[0]?.id || '');
  const [teamBId, setTeamBId] = useState<string>(teams[1]?.id || '');

  const requireSigner = (): boolean => {
    if (!currentUser || !authToken) {
      setActionError('Sign in as a Scorer, Managing Admin, or Super Admin to log live balls.');
      onOpenAuth();
      return false;
    }
    return true;
  };

  const handleModePreset = (mode: PitchMode) => {
    setPitchMode(mode);
    if (mode === 'SHORT_PITCH') {
      setPitchYards(14);
      setOversLimit(6);
      setBallType('TAPE_GREEN');
    } else {
      setPitchYards(settings.longPitchDefaultYards || 22);
      setOversLimit(20);
      setBallType('LEATHER_RED');
      setSingleRunAllowed(true);
      setBoundaryOnlyMode(false);
    }
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireSigner()) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          tournamentId: tournamentId || null,
          teamAId,
          teamBId,
          pitchMode,
          pitchDistanceYards: pitchYards,
          oversLimit,
          ballType,
          singleRunAllowed: boundaryOnlyMode ? false : singleRunAllowed,
          boundaryOnlyMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Could not create match.');
      } else {
        onMatchUpdated(data.match);
        onSelectMatch(data.match.id);
        setShowNewMatch(false);
      }
    } catch {
      setActionError('Network error creating match.');
    } finally {
      setBusy(false);
    }
  };

  const scoreBall = async (payload: {
    runsOffBat: number;
    extraType?: ExtraType;
    extraRuns?: number;
    isWicket?: boolean;
    dismissalType?: DismissalType;
  }) => {
    if (!activeMatch || !requireSigner()) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${activeMatch.id}/balls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ...payload,
          ...(pendingSpeed
            ? {
                speedKmh: pendingSpeed.speedKmh,
                speedMph: pendingSpeed.speedMph,
                releaseTsMs: pendingSpeed.releaseTsMs,
                reachTsMs: pendingSpeed.reachTsMs,
                cameraFps: pendingSpeed.cameraFps,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Unable to log delivery.');
      } else {
        onMatchUpdated(data.match);
        if (pendingSpeed) onClearPendingSpeed();
        setShowWicketPicker(false);
      }
    } catch {
      setActionError('Network error logging delivery.');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!activeMatch || !requireSigner()) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${activeMatch.id}/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) setActionError(data.error || 'Cannot undo.');
      else onMatchUpdated(data.match);
    } finally {
      setBusy(false);
    }
  };

  const handleStartSecondInnings = async () => {
    if (!activeMatch || !requireSigner()) return;
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${activeMatch.id}/second-innings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok) setActionError(data.error || 'Unable to start 2nd innings.');
      else onMatchUpdated(data.match);
    } finally {
      setBusy(false);
    }
  };

  const activeInnings = activeMatch
    ? activeMatch.activeInningsNumber === 1
      ? activeMatch.innings1
      : activeMatch.innings2 || activeMatch.innings1
    : null;

  const battingTeam = activeInnings ? teams.find((t) => t.id === activeInnings.battingTeamId) : null;
  const bowlingTeam = activeInnings ? teams.find((t) => t.id === activeInnings.bowlingTeamId) : null;

  const striker = activeInnings?.battingCard.find((b) => b.playerId === activeInnings.strikerId);
  const nonStriker = activeInnings?.battingCard.find((b) => b.playerId === activeInnings.nonStrikerId);
  const currentBowler = activeInnings?.bowlingCard.find((b) => b.playerId === activeInnings.currentBowlerId);

  const oversDisplay = activeInnings
    ? `${Math.floor(activeInnings.legalBallsBowled / 6)}.${activeInnings.legalBallsBowled % 6}`
    : '0.0';
  const crr =
    activeInnings && activeInnings.legalBallsBowled > 0
      ? ((activeInnings.totalRuns / activeInnings.legalBallsBowled) * 6).toFixed(2)
      : '0.00';

  const ballsRemaining =
    activeMatch && activeInnings
      ? Math.max(0, activeMatch.rules.oversLimit * 6 - activeInnings.legalBallsBowled)
      : 0;
  const runsNeeded =
    activeInnings && activeInnings.targetRuns !== null
      ? Math.max(0, activeInnings.targetRuns - activeInnings.totalRuns)
      : null;
  const rrr =
    runsNeeded !== null && ballsRemaining > 0 ? ((runsNeeded / ballsRemaining) * 6).toFixed(2) : null;

  const currentOverIndex = activeInnings ? Math.floor(activeInnings.legalBallsBowled / 6) : 0;
  const currentOverBalls = activeInnings
    ? activeInnings.balls.filter((b) => b.overNumber === currentOverIndex)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
      {/* Match Switcher & New Match Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {matches.map((m) => {
            const selected = m.id === activeMatch?.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMatch(m.id)}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  selected
                    ? 'bg-[#0B1410] text-white border-[#0B1410]'
                    : 'bg-white text-slate-700 border-[#DDE3DE] hover:border-slate-400'
                }`}
              >
                {m.title}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowNewMatch((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {showNewMatch ? 'Close Setup' : 'New Match'}
        </button>
      </div>

      {/* Match Preset & Rules Configurator */}
      {showNewMatch && (
        <form onSubmit={handleCreateMatch} className="bg-white border border-[#DDE3DE] rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDE3DE] pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0B1410]">Configure New Match</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Select Short Pitch tape-ball rules or standard 22-yard Long Pitch regulations.
              </p>
            </div>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => handleModePreset('SHORT_PITCH')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  pitchMode === 'SHORT_PITCH' ? 'bg-white text-[#0B1410] shadow-sm' : 'text-slate-600'
                }`}
              >
                Short Pitch (Tape / Tennis)
              </button>
              <button
                type="button"
                onClick={() => handleModePreset('LONG_PITCH')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  pitchMode === 'LONG_PITCH' ? 'bg-white text-[#0B1410] shadow-sm' : 'text-slate-600'
                }`}
              >
                Long Pitch (22 yd Standard)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batting First (Team A)</label>
              <select
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
                className="w-full h-11 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.shortCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Bowling First (Team B)</label>
              <select
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
                className="w-full h-11 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.shortCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pitch Length (Yards)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={8}
                  max={25}
                  step={0.5}
                  value={pitchYards}
                  onChange={(e) => setPitchYards(Number(e.target.value))}
                  className="w-24 h-11 px-3 text-sm font-mono tabular-nums border border-[#DDE3DE] rounded-lg"
                />
                {pitchMode === 'SHORT_PITCH' && (
                  <div className="flex gap-1">
                    {settings.shortPitchPresetsYards.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPitchYards(preset)}
                        className={`px-2 py-1.5 text-xs font-mono rounded border cursor-pointer ${
                          pitchYards === preset
                            ? 'bg-[#0E7A49] text-white border-[#0E7A49]'
                            : 'bg-white text-slate-700 border-[#DDE3DE]'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Overs Per Innings</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={oversLimit}
                  onChange={(e) => setOversLimit(Number(e.target.value))}
                  className="w-20 h-11 px-3 text-sm font-mono tabular-nums border border-[#DDE3DE] rounded-lg"
                />
                <div className="flex gap-1">
                  {(pitchMode === 'SHORT_PITCH' ? [4, 6, 8, 10] : [10, 20, 50]).map((ov) => (
                    <button
                      key={ov}
                      type="button"
                      onClick={() => setOversLimit(ov)}
                      className={`px-2 py-1.5 text-xs font-mono rounded border cursor-pointer ${
                        oversLimit === ov
                          ? 'bg-[#0B1410] text-white border-[#0B1410]'
                          : 'bg-white text-slate-700 border-[#DDE3DE]'
                      }`}
                    >
                      {ov}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ball Type & CV Color Profile</label>
              <select
                value={ballType}
                onChange={(e) => setBallType(e.target.value as BallType)}
                className="w-full h-11 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
              >
                {Object.entries(BALL_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tournament (Optional)</label>
              <select
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                className="w-full h-11 px-3 text-sm bg-white border border-[#DDE3DE] rounded-lg"
              >
                <option value="">Friendly / Practice Match</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {pitchMode === 'SHORT_PITCH' && (
              <div className="flex flex-col gap-2 pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={singleRunAllowed && !boundaryOnlyMode}
                    disabled={boundaryOnlyMode}
                    onChange={(e) => setSingleRunAllowed(e.target.checked)}
                  />
                  Allow Single Runs (1s)
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boundaryOnlyMode}
                    onChange={(e) => setBoundaryOnlyMode(e.target.checked)}
                  />
                  Boundary-Only Local Rule (0 / 4 / 6)
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowNewMatch(false)}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 border border-[#DDE3DE] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-[#0E7A49] hover:bg-[#0B633B] rounded-lg cursor-pointer"
            >
              Start Live Match
            </button>
          </div>
        </form>
      )}

      {actionError && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-[#C81E2B]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          {!currentUser && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-1.5 text-xs font-semibold bg-[#C81E2B] text-white rounded-md whitespace-nowrap cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      )}

      {!activeMatch || !activeInnings ? (
        <div className="bg-white border border-[#DDE3DE] rounded-xl p-8 text-center">
          <p className="text-slate-600 text-sm">No match selected. Create a match to start scoring.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: High-Contrast Outdoor Thumb Scorer */}
          <div className="lg:col-span-7 space-y-5">
            {/* Scoreboard Header */}
            <section className="bg-white border border-[#DDE3DE] rounded-xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-medium">
                <span>
                  {activeMatch.rules.pitchMode === 'SHORT_PITCH' ? 'Short Pitch' : 'Long Pitch'} ·{' '}
                  {activeMatch.rules.pitchDistanceYards} yd · {BALL_TYPE_LABELS[activeMatch.rules.ballType]} ·{' '}
                  {activeMatch.rules.oversLimit} Overs
                  {activeMatch.rules.boundaryOnlyMode ? ' · Boundary-Only' : !activeMatch.rules.singleRunAllowed ? ' · No Singles' : ''}
                </span>
                <span className="font-semibold text-[#0E7A49]">
                  {activeMatch.status === 'VERIFIED' ? 'Verified Result' : activeMatch.status === 'COMPLETED' ? 'Completed' : `Innings ${activeMatch.activeInningsNumber}`}
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-600">{battingTeam?.name}</p>
                  <div className="font-mono tabular-nums text-5xl font-bold text-[#0B1410] tracking-tight mt-1">
                    {activeInnings.totalRuns}/{activeInnings.wicketsLost}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <p className="text-2xl font-bold text-[#0B1410]">
                    {oversDisplay} <span className="text-sm font-normal text-slate-500">/ {activeMatch.rules.oversLimit} ov</span>
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    CRR {crr}
                    {rrr ? ` · RRR ${rrr}` : ''}
                  </p>
                  {activeInnings.targetRuns !== null && (
                    <p className="text-xs font-semibold text-[#0E7A49] mt-0.5">
                      Target {activeInnings.targetRuns} ({runsNeeded} off {ballsRemaining}b)
                    </p>
                  )}
                </div>
              </div>

              {activeMatch.winnerText && (
                <div className="mt-4 px-4 py-3 bg-[#0E7A49]/10 border border-[#0E7A49]/30 rounded-lg flex items-center gap-2 text-sm font-semibold text-[#0B1410]">
                  <Trophy className="w-4 h-4 text-[#0E7A49]" />
                  <span>{activeMatch.winnerText}</span>
                </div>
              )}

              {/* Active Crease Matchup */}
              <div className="mt-5 pt-4 border-t border-[#DDE3DE] grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Striker *</span>
                  <span className="font-semibold text-[#0B1410]">{striker?.name || '—'}</span>
                  <span className="ml-2 font-mono tabular-nums text-xs text-slate-600">
                    {striker ? `${striker.runs}(${striker.balls})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Non-Striker</span>
                  <span className="font-semibold text-[#0B1410]">{nonStriker?.name || '—'}</span>
                  <span className="ml-2 font-mono tabular-nums text-xs text-slate-600">
                    {nonStriker ? `${nonStriker.runs}(${nonStriker.balls})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Bowler ({bowlingTeam?.shortCode})</span>
                  <span className="font-semibold text-[#0B1410]">{currentBowler?.name || '—'}</span>
                  <span className="ml-2 font-mono tabular-nums text-xs text-slate-600">
                    {currentBowler ? `${currentBowler.wickets}-${currentBowler.runsConceded} (${currentBowler.overs})` : ''}
                  </span>
                </div>
              </div>
            </section>

            {/* Queued Radar Telemetry Banner */}
            {pendingSpeed && (
              <div className="bg-[#0B1410] text-white rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-emerald-300 font-semibold">Radar Speed Queued for Next Delivery</p>
                  <p className="font-mono tabular-nums text-lg font-bold">
                    {pendingSpeed.speedKmh.toFixed(1)} km/h · {pendingSpeed.speedMph.toFixed(1)} mph
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearPendingSpeed}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-lg cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Current Over Ball-by-Ball Strip */}
            <section className="bg-white border border-[#DDE3DE] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-600">
                  This Over (Over {currentOverIndex + 1})
                </span>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {activeInnings.balls.length} total balls logged
                </span>
              </div>
              {currentOverBalls.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">New over ready. Tap a run button below to log the first ball.</p>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {currentOverBalls.map((b) => {
                    const label = b.isWicket
                      ? 'W'
                      : b.extraType === 'WIDE'
                      ? `${b.extraRuns}WD`
                      : b.extraType === 'NO_BALL'
                      ? `${b.runsOffBat + b.extraRuns}NB`
                      : b.extraType === 'BYE'
                      ? `${b.extraRuns}B`
                      : b.extraType === 'LEG_BYE'
                      ? `${b.extraRuns}LB`
                      : String(b.runsOffBat);
                    return (
                      <div
                        key={b.id}
                        className={`rounded-lg border px-2 py-2 text-center ${
                          b.isWicket
                            ? 'bg-red-50 border-red-300 text-[#C81E2B]'
                            : b.runsOffBat >= 4
                            ? 'bg-emerald-50 border-emerald-300 text-[#0E7A49]'
                            : 'bg-slate-50 border-[#DDE3DE] text-[#0B1410]'
                        }`}
                      >
                        <div className="font-mono tabular-nums text-base font-bold">{label}</div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-600 mt-0.5">
                          {b.speedKmh ? `${b.speedKmh.toFixed(0)}k` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Thumb-Friendly Scoring Pad */}
            {activeInnings.isCompleted && activeMatch.activeInningsNumber === 1 ? (
              <div className="bg-white border border-[#DDE3DE] rounded-xl p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-[#0B1410]">
                  1st Innings Completed ({activeInnings.totalRuns}/{activeInnings.wicketsLost})
                </p>
                <button
                  type="button"
                  onClick={handleStartSecondInnings}
                  disabled={busy}
                  className="px-6 py-3 min-h-[48px] bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  Start 2nd Innings (Target {activeInnings.totalRuns + 1})
                </button>
              </div>
            ) : (
              <section className="bg-white border border-[#DDE3DE] rounded-xl p-4 sm:p-5 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2, 3, 4, 6].map((r) => {
                    const disallowed =
                      activeInnings.isCompleted ||
                      (activeMatch.rules.boundaryOnlyMode && r !== 0 && r !== 4 && r !== 6) ||
                      (!activeMatch.rules.singleRunAllowed && r === 1);
                    const isBoundary = r === 4 || r === 6;
                    return (
                      <button
                        key={r}
                        type="button"
                        disabled={busy || disallowed}
                        onClick={() => scoreBall({ runsOffBat: r })}
                        className={`h-16 rounded-xl font-mono tabular-nums text-2xl font-bold transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                          isBoundary
                            ? 'bg-[#0E7A49] hover:bg-[#0B633B] text-white'
                            : 'bg-slate-50 hover:bg-slate-100 text-[#0B1410] border border-[#DDE3DE]'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={busy || activeInnings.isCompleted}
                    onClick={() => scoreBall({ runsOffBat: 0, extraType: 'WIDE', extraRuns: 1 })}
                    className="h-13 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    Wide
                  </button>
                  <button
                    type="button"
                    disabled={busy || activeInnings.isCompleted}
                    onClick={() => scoreBall({ runsOffBat: 0, extraType: 'NO_BALL', extraRuns: 1 })}
                    className="h-13 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    No Ball
                  </button>
                  <button
                    type="button"
                    disabled={busy || activeInnings.isCompleted}
                    onClick={() => scoreBall({ runsOffBat: 0, extraType: 'BYE', extraRuns: 1 })}
                    className="h-13 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    Bye
                  </button>
                  <button
                    type="button"
                    disabled={busy || activeInnings.isCompleted}
                    onClick={() => scoreBall({ runsOffBat: 0, extraType: 'LEG_BYE', extraRuns: 1 })}
                    className="h-13 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    Leg Bye
                  </button>
                  <button
                    type="button"
                    disabled={busy || activeInnings.isCompleted}
                    onClick={() => setShowWicketPicker((v) => !v)}
                    className="col-span-2 sm:col-span-1 h-13 rounded-xl bg-[#C81E2B] hover:bg-[#A61722] text-white text-sm font-bold cursor-pointer disabled:opacity-40"
                  >
                    Wicket
                  </button>
                </div>

                {showWicketPicker && (
                  <div className="pt-3 border-t border-[#DDE3DE] space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Select Dismissal Type:</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {(['BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED'] as DismissalType[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => scoreBall({ runsOffBat: 0, isWicket: true, dismissalType: d })}
                          className="h-11 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-bold text-[#C81E2B] cursor-pointer"
                        >
                          {d.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onOpenRadar}
                    className="h-13 rounded-xl bg-[#0B1410] hover:bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Measure Bowling Speed
                  </button>
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={busy || activeInnings.balls.length === 0}
                    className="h-13 rounded-xl bg-white hover:bg-slate-50 border border-[#DDE3DE] text-slate-700 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Undo Last Ball
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Live Batting, Bowling, and Fall of Wickets */}
          <div className="lg:col-span-5 space-y-5">
            <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#DDE3DE] flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#0B1410]">Batting Scorecard</h3>
                <span className="text-xs text-slate-500">{battingTeam?.shortCode}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE3DE] text-xs text-slate-500">
                      <th className="text-left font-medium px-5 py-2.5">Batter</th>
                      <th className="text-right font-medium px-3 py-2.5">R</th>
                      <th className="text-right font-medium px-3 py-2.5">B</th>
                      <th className="text-right font-medium px-3 py-2.5">4s/6s</th>
                      <th className="text-right font-medium px-5 py-2.5">SR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeInnings.battingCard.map((b) => {
                      const onStrike = b.playerId === activeInnings.strikerId && !b.isOut;
                      return (
                        <tr key={b.playerId}>
                          <td className="px-5 py-2.5">
                            <p className="font-semibold text-[#0B1410]">
                              {b.name} {onStrike ? '*' : ''}
                            </p>
                            <p className="text-xs text-slate-500">{b.dismissalText}</p>
                          </td>
                          <td className="text-right font-mono tabular-nums font-bold px-3 py-2.5">{b.runs}</td>
                          <td className="text-right font-mono tabular-nums text-slate-600 px-3 py-2.5">{b.balls}</td>
                          <td className="text-right font-mono tabular-nums text-slate-600 px-3 py-2.5">
                            {b.fours}/{b.sixes}
                          </td>
                          <td className="text-right font-mono tabular-nums text-slate-600 px-5 py-2.5">
                            {b.strikeRate.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#DDE3DE] flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-[#0B1410]">Bowling & Speed Radar</h3>
                <span className="text-xs text-slate-500">{bowlingTeam?.shortCode}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE3DE] text-xs text-slate-500">
                      <th className="text-left font-medium px-5 py-2.5">Bowler</th>
                      <th className="text-right font-medium px-3 py-2.5">O</th>
                      <th className="text-right font-medium px-3 py-2.5">R</th>
                      <th className="text-right font-medium px-3 py-2.5">W</th>
                      <th className="text-right font-medium px-5 py-2.5">Top Speed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeInnings.bowlingCard.map((bw) => (
                      <tr key={bw.playerId}>
                        <td className="px-5 py-2.5 font-semibold text-[#0B1410]">{bw.name}</td>
                        <td className="text-right font-mono tabular-nums text-slate-600 px-3 py-2.5">{bw.overs}</td>
                        <td className="text-right font-mono tabular-nums text-slate-600 px-3 py-2.5">{bw.runsConceded}</td>
                        <td className="text-right font-mono tabular-nums font-bold px-3 py-2.5">{bw.wickets}</td>
                        <td className="text-right font-mono tabular-nums font-semibold text-[#0E7A49] px-5 py-2.5">
                          {bw.fastestSpeedKmh ? `${bw.fastestSpeedKmh.toFixed(1)} km/h` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {activeInnings.fallOfWickets.length > 0 && (
              <section className="bg-white border border-[#DDE3DE] rounded-xl p-5">
                <h3 className="font-display text-sm font-bold text-[#0B1410] mb-3">Fall of Wickets</h3>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-700 font-mono tabular-nums">
                  {activeInnings.fallOfWickets.map((f) => (
                    <span key={f.wicketNumber}>
                      {f.wicketNumber}-{f.scoreAtFall} ({f.batterName}, {f.overDisplay} ov)
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
