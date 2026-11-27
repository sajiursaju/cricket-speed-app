// CreaseRadar MongoDB (Mongoose) Schema Reference
// Equivalent document-model definitions for Node.js + Express + MongoDB deployments

export interface UserDoc {
  _id: string;
  role: 'SUPER_ADMIN' | 'MANAGING_ADMIN' | 'SCORER';
  fullName: string;
  email: string;
  passwordHash: string;
  status: 'ACTIVE' | 'SUSPENDED';
  subscriptionTier: 'COMMUNITY' | 'CLUB_PRO' | 'LEAGUE_ENTERPRISE';
  createdAt: Date;
}

export interface TournamentDoc {
  _id: string;
  name: string;
  city: string;
  formatCategory: 'SHORT_PITCH' | 'LONG_PITCH';
  defaultPitchYards: number;
  defaultOvers: number;
  ballType: 'TAPE_GREEN' | 'TENNIS_YELLOW' | 'LEATHER_RED' | 'LEATHER_WHITE';
  managedByUserId: string;
  status: 'UPCOMING' | 'LIVE' | 'COMPLETED';
}

export interface MatchDoc {
  _id: string;
  tournamentId?: string;
  teamA: { id: string; name: string; shortCode: string; players: PlayerSubdoc[] };
  teamB: { id: string; name: string; shortCode: string; players: PlayerSubdoc[] };
  assignedScorerId?: string;
  rules: {
    pitchMode: 'SHORT_PITCH' | 'LONG_PITCH';
    pitchDistanceYards: number;
    oversLimit: number;
    ballType: 'TAPE_GREEN' | 'TENNIS_YELLOW' | 'LEATHER_RED' | 'LEATHER_WHITE';
    singleRunAllowed: boolean;
    boundaryOnlyMode: boolean;
  };
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'VERIFIED';
  verifiedByUserId?: string;
  verifiedAt?: Date;
}

export interface PlayerSubdoc {
  id: string;
  fullName: string;
  battingStyle: 'RHB' | 'LHB';
  bowlingStyle: 'PACE' | 'MEDIUM' | 'SPIN' | 'NONE';
}

export interface BallEventDoc {
  _id: string;
  matchId: string;
  inningsNumber: 1 | 2;
  overNumber: number;
  ballInOver: number;
  sequenceIndex: number;
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsOffBat: number;
  extraRuns: number;
  extraType: 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
  isLegalDelivery: boolean;
  isWicket: boolean;
  dismissalType: 'NONE' | 'BOWLED' | 'CAUGHT' | 'RUN_OUT' | 'LBW' | 'STUMPED';
  speed_kmh: number | null;
  speed_mph: number | null;
  telemetry: {
    releaseTsMs: number | null;
    reachTsMs: number | null;
    pitchDistanceYards: number | null;
    cameraFps: number | null;
  };
  createdAt: Date;
}
