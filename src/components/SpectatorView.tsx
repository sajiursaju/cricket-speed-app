import { useState } from 'react';
import { Radio } from 'lucide-react';
import type { AnalyticsData, MatchRecord, Team, Tournament } from '../types';

interface SpectatorViewProps {
  matches: MatchRecord[];
  activeMatch: MatchRecord | null;
  teams: Team[];
  tournaments: Tournament[];
  analytics: AnalyticsData | null;
  wsConnected: boolean;
  onSelectMatch: (id: string) => void;
}

export function SpectatorView({
  matches,
  activeMatch,
  teams,
  tournaments,
  analytics,
  wsConnected,
  onSelectMatch,
}: SpectatorViewProps) {
  const [imgError, setImgError] = useState(false);
  const innings = activeMatch
    ? activeMatch.activeInningsNumber === 1
      ? activeMatch.innings1
      : activeMatch.innings2 || activeMatch.innings1
    : null;
  const batTeam = innings ? teams.find((t) => t.id === innings.battingTeamId) : null;
  const bowlTeam = innings ? teams.find((t) => t.id === innings.bowlingTeamId) : null;
  const tournament = activeMatch?.tournamentId
    ? tournaments.find((t) => t.id === activeMatch.tournamentId)
    : null;

  const overs = innings ? `${Math.floor(innings.legalBallsBowled / 6)}.${innings.legalBallsBowled % 6}` : '0.0';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-8 space-y-6">
      {/* Match Selector + WebSocket Stream Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMatch(m.id)}
              className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 border cursor-pointer ${
                m.id === activeMatch?.id
                  ? 'bg-[#0B1410] text-white border-[#0B1410]'
                  : 'bg-white text-slate-700 border-[#DDE3DE]'
              }`}
            >
              {m.title}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 shrink-0">
          <Radio className={`w-4 h-4 ${wsConnected ? 'text-[#0E7A49]' : 'text-slate-400'}`} />
          <span>{wsConnected ? 'WebSocket Live Sync Active' : 'Connecting Live Feed'}</span>
        </div>
      </div>

      {/* Daylight Ground Broadcast Hero */}
      {activeMatch && innings && (
        <section className="relative rounded-2xl overflow-hidden border border-[#DDE3DE] bg-[#0B1410] text-white">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <p className="text-xs text-emerald-300 font-semibold">
                  {tournament ? tournament.name : 'Local Match'} ·{' '}
                  {activeMatch.rules.pitchMode === 'SHORT_PITCH' ? 'Short Pitch' : 'Long Pitch'} ·{' '}
                  {activeMatch.rules.pitchDistanceYards} yd
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold mt-2 text-balance">
                  {activeMatch.title}
                </h1>
              </div>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-xs text-slate-300">{batTeam?.name} Batting</p>
                  <div className="font-mono tabular-nums text-5xl font-bold mt-1">
                    {innings.totalRuns}/{innings.wicketsLost}
                  </div>
                </div>
                <div className="font-mono tabular-nums text-right">
                  <p className="text-xl font-bold">
                    {overs} / {activeMatch.rules.oversLimit} ov
                  </p>
                  <p className="text-xs text-slate-300 mt-1">vs {bowlTeam?.name}</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[200px] bg-emerald-950">
              {!imgError ? (
                <img
                  src="/src/assets/images/local_cricket_ground_banner_1795684062237.jpg"
                  alt="Community cricket oval during live match"
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-6 text-xs text-emerald-200">
                  Community Cricket Broadcast Feed
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1410]/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-[#0B1410] lg:via-transparent lg:to-transparent" />
            </div>
          </div>
        </section>
      )}

      {/* Ball-by-Ball Speed & Commentary + Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DDE3DE] flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#0B1410]">Live Ball-by-Ball &amp; Speed Feed</h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {innings ? `${innings.balls.length} deliveries` : '0 deliveries'}
            </span>
          </div>
          {!innings || innings.balls.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Waiting for the first delivery to be bowled.</p>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {[...innings.balls].reverse().map((b) => {
                const bowler = bowlTeam?.players.find((p) => p.id === b.bowlerId);
                const batter = batTeam?.players.find((p) => p.id === b.strikerId);
                const outcome = b.isWicket
                  ? `WICKET (${b.dismissalType})`
                  : b.extraType !== 'NONE'
                  ? `${b.runsOffBat + b.extraRuns} (${b.extraType.replace('_', ' ')})`
                  : b.runsOffBat === 4
                  ? 'FOUR (4)'
                  : b.runsOffBat === 6
                  ? 'SIX (6)'
                  : `${b.runsOffBat} run${b.runsOffBat === 1 ? '' : 's'}`;
                return (
                  <div key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#0B1410]">
                        <span className="font-mono tabular-nums text-slate-500 mr-2">
                          {b.overNumber}.{b.ballInOver}
                        </span>
                        {bowler?.name || 'Bowler'} to {batter?.name || 'Batter'} — {outcome}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {b.pitchDistanceYards ? `Calibrated ${b.pitchDistanceYards} yd pitch` : 'Standard delivery'}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      {b.speedKmh ? (
                        <>
                          <span className="text-sm font-bold text-[#0E7A49]">{b.speedKmh.toFixed(1)} km/h</span>
                          <span className="block text-[11px] text-slate-500">{b.speedMph?.toFixed(1)} mph</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">No radar</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white border border-[#DDE3DE] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DDE3DE]">
            <h2 className="font-display text-base font-bold text-[#0B1410]">Fastest Bowlers Leaderboard</h2>
          </div>
          {!analytics || analytics.fastestBowlers.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No speed radar deliveries logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {analytics.fastestBowlers.map((entry, i) => (
                <div key={`${entry.playerId}-${i}`} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs text-slate-400 mr-2">0{i + 1}</span>
                    <span className="font-semibold text-[#0B1410]">{entry.name}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {entry.teamName} · {entry.pitchYards} yd
                    </span>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-[#0E7A49]">
                    {entry.speedKmh.toFixed(1)} km/h
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
