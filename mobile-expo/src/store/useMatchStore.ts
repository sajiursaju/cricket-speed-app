import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

export type UserRole = 'SUPER_ADMIN' | 'MANAGING_ADMIN' | 'SCORER';
export type BallType = 'TAPE_GREEN' | 'TENNIS_YELLOW' | 'LEATHER_RED' | 'LEATHER_WHITE';
export type ExtraType = 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
export type DismissalType = 'NONE' | 'BOWLED' | 'CAUGHT' | 'RUN_OUT' | 'LBW' | 'STUMPED';

export interface BallTelemetry {
  id: string;
  overNumber: number;
  ballInOver: number;
  runsOffBat: number;
  extraRuns: number;
  extraType: ExtraType;
  isLegalDelivery: boolean;
  isWicket: boolean;
  dismissalType: DismissalType;
  speedKmh: number | null;
  speedMph: number | null;
  releaseTsMs?: number | null;
  reachTsMs?: number | null;
}

interface MatchState {
  apiBaseUrl: string;
  authToken: string | null;
  role: UserRole;
  activeMatchId: string | null;
  pitchMode: 'SHORT_PITCH' | 'LONG_PITCH';
  pitchDistanceYards: number;
  oversLimit: number;
  ballType: BallType;
  singleRunAllowed: boolean;
  boundaryOnlyMode: boolean;
  totalRuns: number;
  wickets: number;
  legalBalls: number;
  targetRuns: number | null;
  pendingSpeed: { kmh: number; mph: number; releaseTsMs: number; reachTsMs: number } | null;
  balls: BallTelemetry[];
  socket: Socket | null;
  connectSocket: (matchId: string) => void;
  setPendingSpeed: (speed: { kmh: number; mph: number; releaseTsMs: number; reachTsMs: number } | null) => void;
  scoreBall: (payload: {
    runsOffBat: number;
    extraType?: ExtraType;
    extraRuns?: number;
    isWicket?: boolean;
    dismissalType?: DismissalType;
  }) => Promise<void>;
  attachSpeedToLastBall: (speedKmh: number, speedMph: number, releaseTsMs: number, reachTsMs: number) => Promise<void>;
  undoLastBall: () => Promise<void>;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.creaseradar.local',
  authToken: null,
  role: 'SCORER',
  activeMatchId: null,
  pitchMode: 'SHORT_PITCH',
  pitchDistanceYards: 14,
  oversLimit: 6,
  ballType: 'TAPE_GREEN',
  singleRunAllowed: true,
  boundaryOnlyMode: false,
  totalRuns: 0,
  wickets: 0,
  legalBalls: 0,
  targetRuns: null,
  pendingSpeed: null,
  balls: [],
  socket: null,

  connectSocket: (matchId) => {
    const prev = get().socket;
    if (prev) prev.disconnect();
    const socket = io(get().apiBaseUrl, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('match:join', { matchId }));
    socket.on('match:state', (snapshot) => {
      set({
        totalRuns: snapshot.totalRuns,
        wickets: snapshot.wickets,
        legalBalls: snapshot.legalBalls,
        balls: snapshot.balls,
      });
    });
    set({ socket, activeMatchId: matchId });
  },

  setPendingSpeed: (pendingSpeed) => set({ pendingSpeed }),

  scoreBall: async (payload) => {
    const state = get();
    const extraType = payload.extraType ?? 'NONE';
    const isLegal = extraType !== 'WIDE' && extraType !== 'NO_BALL';
    const extraRuns = payload.extraRuns ?? (extraType === 'WIDE' || extraType === 'NO_BALL' ? 1 : 0);
    const totalBallRuns = payload.runsOffBat + extraRuns;
    const nextLegalBalls = state.legalBalls + (isLegal ? 1 : 0);

    const newBall: BallTelemetry = {
      id: `ball_${Date.now()}`,
      overNumber: Math.floor(state.legalBalls / 6),
      ballInOver: (state.legalBalls % 6) + (isLegal ? 1 : 0),
      runsOffBat: payload.runsOffBat,
      extraRuns,
      extraType,
      isLegalDelivery: isLegal,
      isWicket: Boolean(payload.isWicket),
      dismissalType: payload.dismissalType ?? 'NONE',
      speedKmh: state.pendingSpeed?.kmh ?? null,
      speedMph: state.pendingSpeed?.mph ?? null,
      releaseTsMs: state.pendingSpeed?.releaseTsMs ?? null,
      reachTsMs: state.pendingSpeed?.reachTsMs ?? null,
    };

    // Optimistic update on handset, then persist to Express API
    set({
      totalRuns: state.totalRuns + totalBallRuns,
      wickets: state.wickets + (payload.isWicket ? 1 : 0),
      legalBalls: nextLegalBalls,
      balls: [...state.balls, newBall],
      pendingSpeed: null,
    });

    if (state.activeMatchId && state.authToken) {
      await fetch(`${state.apiBaseUrl}/api/matches/${state.activeMatchId}/balls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.authToken}`,
        },
        body: JSON.stringify(newBall),
      });
    }
  },

  attachSpeedToLastBall: async (speedKmh, speedMph, releaseTsMs, reachTsMs) => {
    const state = get();
    if (state.balls.length === 0) {
      set({ pendingSpeed: { kmh: speedKmh, mph: speedMph, releaseTsMs, reachTsMs } });
      return;
    }
    const updated = [...state.balls];
    const last = updated[updated.length - 1];
    updated[updated.length - 1] = { ...last, speedKmh, speedMph, releaseTsMs, reachTsMs };
    set({ balls: updated });

    if (state.activeMatchId && state.authToken) {
      await fetch(`${state.apiBaseUrl}/api/matches/${state.activeMatchId}/balls/${last.id}/speed`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.authToken}`,
        },
        body: JSON.stringify({ speedKmh, speedMph, releaseTsMs, reachTsMs }),
      });
    }
  },

  undoLastBall: async () => {
    const state = get();
    if (state.balls.length === 0) return;
    const removed = state.balls[state.balls.length - 1];
    const remaining = state.balls.slice(0, -1);
    set({
      balls: remaining,
      totalRuns: Math.max(0, state.totalRuns - (removed.runsOffBat + removed.extraRuns)),
      wickets: Math.max(0, state.wickets - (removed.isWicket ? 1 : 0)),
      legalBalls: Math.max(0, state.legalBalls - (removed.isLegalDelivery ? 1 : 0)),
    });
  },
}));
