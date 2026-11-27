import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminWorkspaceView } from './components/AdminWorkspaceView';
import { AuthModal } from './components/AuthModal';
import { ExpoBlueprintView } from './components/ExpoBlueprintView';
import { LiveScorerView } from './components/LiveScorerView';
import { SpectatorView } from './components/SpectatorView';
import { SpeedRadarView } from './components/SpeedRadarView';
import { TopNav } from './components/TopNav';
import type {
  AnalyticsData,
  AppSettings,
  AppTab,
  MatchRecord,
  PendingSpeed,
  PublicUser,
  Team,
  Tournament,
} from './types';

const DEFAULT_SETTINGS: AppSettings = {
  shortPitchPresetsYards: [12, 14, 15, 16],
  longPitchDefaultYards: 22,
  enabledTiers: ['COMMUNITY', 'CLUB_PRO', 'LEAGUE_ENTERPRISE'],
  maxFpsTarget: 120,
  allowPublicSpectatorRadar: true,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('scorer');
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string>('');
  const [pendingSpeed, setPendingSpeed] = useState<PendingSpeed | null>(null);

  // Auth strictly in React memory (never localStorage)
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [hasSuperAdmin, setHasSuperAdmin] = useState<boolean>(false);
  const [passcodeConfigured, setPasscodeConfigured] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [authRes, matchRes, analyticsRes] = await Promise.all([
        fetch('/api/auth/status'),
        fetch('/api/matches'),
        fetch('/api/analytics'),
      ]);

      if (authRes.ok) {
        const authData = await authRes.json();
        setHasSuperAdmin(Boolean(authData.hasSuperAdmin));
        setPasscodeConfigured(Boolean(authData.passcodeConfigured));
      }
      if (matchRes.ok) {
        const mData = await matchRes.json();
        setMatches(mData.matches || []);
        setTeams(mData.teams || []);
        setTournaments(mData.tournaments || []);
        if (mData.settings) setSettings(mData.settings);
        setActiveMatchId((prev) => prev || mData.matches?.[0]?.id || '');
      }
      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
    } catch {
      // Handled gracefully by retry / UI state
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Real-time WebSocket live scoreboard sync with reconnect
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'match:updated' && msg.match) {
            const incoming: MatchRecord = msg.match;
            setMatches((prev) => {
              const exists = prev.some((m) => m.id === incoming.id);
              return exists ? prev.map((m) => (m.id === incoming.id ? incoming : m)) : [incoming, ...prev];
            });
            // Refresh analytics silently
            fetch('/api/analytics')
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => data && setAnalytics(data))
              .catch(() => {});
          }
        } catch {
          // Ignore invalid WS messages
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const handleMatchUpdated = (updated: MatchRecord) => {
    setMatches((prev) => {
      const exists = prev.some((m) => m.id === updated.id);
      return exists ? prev.map((m) => (m.id === updated.id ? updated : m)) : [updated, ...prev];
    });
    fetch('/api/analytics')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAnalytics(data))
      .catch(() => {});
  };

  const activeMatch = matches.find((m) => m.id === activeMatchId) || matches[0] || null;

  return (
    <div className="min-h-screen bg-[#F4F6F4] text-[#0B1410]">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUser={currentUser}
        hasSuperAdmin={hasSuperAdmin}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {initialLoading ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-4">
          <div className="h-32 bg-white border border-[#DDE3DE] rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-[#DDE3DE] rounded-xl animate-pulse" />
        </div>
      ) : (
        <main>
          {activeTab === 'scorer' && (
            <LiveScorerView
              matches={matches}
              activeMatch={activeMatch}
              teams={teams}
              tournaments={tournaments}
              settings={settings}
              currentUser={currentUser}
              authToken={authToken}
              pendingSpeed={pendingSpeed}
              onSelectMatch={setActiveMatchId}
              onMatchUpdated={handleMatchUpdated}
              onClearPendingSpeed={() => setPendingSpeed(null)}
              onOpenRadar={() => setActiveTab('radar')}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'radar' && (
            <SpeedRadarView
              activeMatch={activeMatch}
              currentUser={currentUser}
              authToken={authToken}
              onQueueSpeedForNextBall={setPendingSpeed}
              onMatchUpdated={handleMatchUpdated}
              onReturnToScorer={() => setActiveTab('scorer')}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'spectator' && (
            <SpectatorView
              matches={matches}
              activeMatch={activeMatch}
              teams={teams}
              tournaments={tournaments}
              analytics={analytics}
              wsConnected={wsConnected}
              onSelectMatch={setActiveMatchId}
            />
          )}

          {activeTab === 'admin' && (
            <AdminWorkspaceView
              currentUser={currentUser}
              authToken={authToken}
              matches={matches}
              teams={teams}
              tournaments={tournaments}
              settings={settings}
              analytics={analytics}
              onRefreshAll={refreshAll}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}

          {activeTab === 'blueprint' && <ExpoBlueprintView />}
        </main>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        hasSuperAdmin={hasSuperAdmin}
        passcodeConfigured={passcodeConfigured}
        currentUser={currentUser}
        onAuthenticated={(user, token) => {
          setCurrentUser(user);
          setAuthToken(token);
          setHasSuperAdmin(true);
          refreshAll();
        }}
        onSignOut={() => {
          setCurrentUser(null);
          setAuthToken(null);
        }}
      />
    </div>
  );
}
