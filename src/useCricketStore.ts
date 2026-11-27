import { create } from 'zustand';
import {
  DeliveryRecord,
  ExtraType,
  MatchConfig,
  PitchFormat,
  UserRole,
} from '../types/cricket';

interface CricketState {
  currentRole: UserRole;
  managingAdminsCount: number;
  matchConfig: MatchConfig;
  deliveries: DeliveryRecord[];
  latestMeasuredSpeed: { speedKmh: number; speedMph: number } | null;

  setRole: (role: UserRole) => void;
  addManagingAdmin: () => void;
  setPitchFormat: (format: PitchFormat) => void;
  updateMatchConfig: (partial: Partial<MatchConfig>) => void;
  setLatestMeasuredSpeed: (speed: { speedKmh: number; speedMph: number } | null) => void;
  recordDelivery: (input: {
    runs: number;
    extraType: ExtraType;
    isWicket: boolean;
  }) => void;
  attachSpeedToLastDelivery: (speedKmh: number, speedMph: number) => void;
  undoLastDelivery: () => void;
  resetMatch: () => void;
}

const DEFAULT_MATCH: MatchConfig = {
  title: 'Local Cup Match',
  format: 'SHORT_PITCH',
  pitchYards: 14,
  totalOvers: 6,
  teamA: 'Crease XI',
  teamB: 'Pitch Strikers',
};

export const useCricketStore = create<CricketState>((set, get) => ({
  currentRole: 'SCORER',
  managingAdminsCount: 2,
  matchConfig: DEFAULT_MATCH,
  deliveries: [],
  latestMeasuredSpeed: null,

  setRole: (role) => set({ currentRole: role }),

  addManagingAdmin: () =>
    set((state) => ({ managingAdminsCount: state.managingAdminsCount + 1 })),

  setPitchFormat: (format) =>
    set((state) => ({
      matchConfig: {
        ...state.matchConfig,
        format,
        pitchYards: format === 'LONG_PITCH' ? 22 : 14,
        totalOvers: format === 'LONG_PITCH' ? 20 : 6,
      },
    })),

  updateMatchConfig: (partial) =>
    set((state) => ({
      matchConfig: { ...state.matchConfig, ...partial },
    })),

  setLatestMeasuredSpeed: (speed) => set({ latestMeasuredSpeed: speed }),

  recordDelivery: ({ runs, extraType, isWicket }) => {
    const { deliveries, latestMeasuredSpeed } = get();
    const legalBallsSoFar = deliveries.filter((d) => d.isLegalDelivery).length;

    const isLegalDelivery = extraType !== 'WIDE' && extraType !== 'NO_BALL';
    const overNumber = Math.floor(legalBallsSoFar / 6) + 1;
    const ballInOver = isLegalDelivery
      ? (legalBallsSoFar % 6) + 1
      : (legalBallsSoFar % 6);

    const extraRun = extraType === 'WIDE' || extraType === 'NO_BALL' ? 1 : 0;
    const totalRuns = runs + extraRun;

    const newDelivery: DeliveryRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      overNumber,
      ballInOver,
      runs: totalRuns,
      extraType,
      isLegalDelivery,
      isWicket,
      speedKmh: latestMeasuredSpeed?.speedKmh,
      speedMph: latestMeasuredSpeed?.speedMph,
      timestamp: Date.now(),
    };

    set({
      deliveries: [...deliveries, newDelivery],
      latestMeasuredSpeed: null,
    });
  },

  attachSpeedToLastDelivery: (speedKmh, speedMph) =>
    set((state) => {
      if (state.deliveries.length === 0) {
        return { latestMeasuredSpeed: { speedKmh, speedMph } };
      }
      const updated = [...state.deliveries];
      const lastIndex = updated.length - 1;
      updated[lastIndex] = {
        ...updated[lastIndex],
        speedKmh,
        speedMph,
      };
      return {
        deliveries: updated,
        latestMeasuredSpeed: null,
      };
    }),

  undoLastDelivery: () =>
    set((state) => ({
      deliveries: state.deliveries.slice(0, -1),
    })),

  resetMatch: () =>
    set({
      deliveries: [],
      latestMeasuredSpeed: null,
    }),
}));