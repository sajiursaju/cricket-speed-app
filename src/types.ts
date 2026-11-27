export type UserRole = 'SUPER_ADMIN' | 'MANAGING_ADMIN' | 'SCORER';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type SubscriptionTier = 'COMMUNITY' | 'CLUB_PRO' | 'LEAGUE_ENTERPRISE';
export type PitchMode = 'SHORT_PITCH' | 'LONG_PITCH';
export type BallType = 'TAPE_GREEN' | 'TENNIS_YELLOW' | 'LEATHER_RED' | 'LEATHER_WHITE';
export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'VERIFIED';
export type ExtraType = 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
export type DismissalType = 'NONE' | 'BOWLED' | 'CAUGHT' | 'RUN_OUT' | 'LBW' | 'STUMPED';

export interface PublicUser {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  status: UserStatus;
  subscriptionTier: SubscriptionTier;
  createdAt: string;
}

export interface AppSettings {
  shortPitchPresetsYards: number[];
  longPitchDefaultYards: number;
  enabledTiers: SubscriptionTier[];
  maxFpsTarget: 60 | 120;
  allowPublicSpectatorRadar: boolean;
}

export interface Player {
  id: string;
  name: string;
  battingStyle: 'RHB' | 'LHB';
  bowlingStyle: 'PACE' | 'MEDIUM' | 'SPIN' | 'NONE';
}

export interface Team {
  id: string;
  tournamentId: string | null;
  name: string;
  shortCode: string;
  players: Player[];
}

export interface Tournament {
  id: string;
  name: string;
  city: string;
  formatCategory: PitchMode;
  defaultPitchYards: number;
  defaultOvers: number;
  ballType: BallType;
  managedBy: string;
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
  createdAt: string;
}

export interface BallEvent {
  id: string;
  inningsNumber: 1 | 2;
  sequenceIndex: number;
  overNumber: number;
  ballInOver: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsOffBat: number;
  extraRuns: number;
  extraType: ExtraType;
  isLegalDelivery: boolean;
  isWicket: boolean;
  dismissalType: DismissalType;
  dismissedPlayerId: string | null;
  speedKmh: number | null;
  speedMph: number | null;
  releaseTsMs: number | null;
  reachTsMs: number | null;
  pitchDistanceYards: number | null;
  cameraFps: number | null;
  createdAt: string;
}

export interface BatterStats {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissalText: string;
}

export interface BowlerStats {
  playerId: string;
  name: string;
  overs: string;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  economy: number;
  fastestSpeedKmh: number | null;
}

export interface FallOfWicket {
  wicketNumber: number;
  scoreAtFall: number;
  overDisplay: string;
  batterName: string;
  dismissalType: DismissalType;
}

export interface InningsState {
  inningsNumber: 1 | 2;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  wicketsLost: number;
  legalBallsBowled: number;
  targetRuns: number | null;
  isCompleted: boolean;
  strikerId: string;
  nonStrikerId: string;
  currentBowlerId: string;
  balls: BallEvent[];
  battingCard: BatterStats[];
  bowlingCard: BowlerStats[];
  fallOfWickets: FallOfWicket[];
}

export interface MatchRules {
  pitchMode: PitchMode;
  pitchDistanceYards: number;
  oversLimit: number;
  ballType: BallType;
  singleRunAllowed: boolean;
  boundaryOnlyMode: boolean;
}

export interface MatchRecord {
  id: string;
  tournamentId: string | null;
  title: string;
  teamAId: string;
  teamBId: string;
  assignedScorerId: string | null;
  rules: MatchRules;
  status: MatchStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  winnerText: string | null;
  activeInningsNumber: 1 | 2;
  innings1: InningsState;
  innings2: InningsState | null;
  createdAt: string;
}

export interface AnalyticsData {
  globalSummary: {
    totalMatches: number;
    activeTournaments: number;
    totalUsers: number;
    totalBallsTracked: number;
    fastestDeliveryKmh: number;
  };
  topRunScorers: Array<{ playerId: string; name: string; teamName: string; runs: number; balls: number }>;
  topWicketTakers: Array<{ playerId: string; name: string; teamName: string; wickets: number; economy: number }>;
  fastestBowlers: Array<{ playerId: string; name: string; teamName: string; speedKmh: number; speedMph: number; pitchYards: number }>;
}

export interface PendingSpeed {
  speedKmh: number;
  speedMph: number;
  releaseTsMs: number;
  reachTsMs: number;
  cameraFps: number;
}

export type AppTab = 'scorer' | 'radar' | 'spectator' | 'admin' | 'blueprint';
