import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppSettings,
  BallEvent,
  BatterStats,
  BowlerStats,
  DismissalType,
  ExtraType,
  FallOfWicket,
  InningsState,
  MatchRecord,
  MatchRules,
  PublicUser,
  Team,
  Tournament,
  UserRecord,
  UserRole,
} from './types.ts';
import { toPublicUser } from './middleware/rbac.ts';

interface DatabaseState {
  users: UserRecord[];
  settings: AppSettings;
  tournaments: Tournament[];
  teams: Team[];
  matches: MatchRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'creaseradar-db.json');

function formatOvers(legalBalls: number): string {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function buildInningsFromBalls(
  inningsNumber: 1 | 2,
  battingTeam: Team,
  bowlingTeam: Team,
  balls: BallEvent[],
  oversLimit: number,
  targetRuns: number | null,
  initialStrikerId?: string,
  initialNonStrikerId?: string,
  initialBowlerId?: string
): InningsState {
  const maxWickets = Math.max(1, battingTeam.players.length - 1);
  let strikerId = initialStrikerId || battingTeam.players[0]?.id || 'p1';
  let nonStrikerId = initialNonStrikerId || battingTeam.players[1]?.id || 'p2';
  let currentBowlerId = initialBowlerId || bowlingTeam.players[0]?.id || 'b1';

  const batterMap = new Map<string, BatterStats>();
  for (const p of battingTeam.players) {
    batterMap.set(p.id, {
      playerId: p.id,
      name: p.name,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      strikeRate: 0,
      isOut: false,
      dismissalText: 'not out',
    });
  }

  const bowlerMap = new Map<string, BowlerStats>();
  for (const p of bowlingTeam.players) {
    bowlerMap.set(p.id, {
      playerId: p.id,
      name: p.name,
      overs: '0.0',
      legalBalls: 0,
      runsConceded: 0,
      wickets: 0,
      economy: 0,
      fastestSpeedKmh: null,
    });
  }

  let totalRuns = 0;
  let wicketsLost = 0;
  let legalBallsBowled = 0;
  const fallOfWickets: FallOfWicket[] = [];
  const nextBatterQueue = battingTeam.players
    .map((p) => p.id)
    .filter((id) => id !== strikerId && id !== nonStrikerId);

  for (const b of balls) {
    strikerId = b.strikerId;
    nonStrikerId = b.nonStrikerId;
    currentBowlerId = b.bowlerId;

    const totalBallRuns = b.runsOffBat + b.extraRuns;
    totalRuns += totalBallRuns;
    if (b.isLegalDelivery) {
      legalBallsBowled += 1;
    }

    const batter = batterMap.get(b.strikerId);
    if (batter) {
      batter.runs += b.runsOffBat;
      if (b.extraType !== 'WIDE') {
        batter.balls += 1;
      }
      if (b.runsOffBat === 4) batter.fours += 1;
      if (b.runsOffBat === 6) batter.sixes += 1;
      batter.strikeRate = batter.balls > 0 ? Number(((batter.runs / batter.balls) * 100).toFixed(1)) : 0;
    }

    const bowler = bowlerMap.get(b.bowlerId);
    if (bowler) {
      if (b.isLegalDelivery) bowler.legalBalls += 1;
      if (b.extraType !== 'BYE' && b.extraType !== 'LEG_BYE') {
        bowler.runsConceded += totalBallRuns;
      }
      if (b.isWicket && b.dismissalType !== 'RUN_OUT') {
        bowler.wickets += 1;
      }
      if (b.speedKmh !== null) {
        bowler.fastestSpeedKmh =
          bowler.fastestSpeedKmh === null ? b.speedKmh : Math.max(bowler.fastestSpeedKmh, b.speedKmh);
      }
      bowler.overs = formatOvers(bowler.legalBalls);
      bowler.economy =
        bowler.legalBalls > 0 ? Number(((bowler.runsConceded / bowler.legalBalls) * 6).toFixed(2)) : 0;
    }

    if (b.isWicket) {
      wicketsLost += 1;
      const outId = b.dismissedPlayerId || b.strikerId;
      const outBatter = batterMap.get(outId);
      if (outBatter) {
        outBatter.isOut = true;
        outBatter.dismissalText = b.dismissalType.toLowerCase().replace('_', ' ');
      }
      fallOfWickets.push({
        wicketNumber: wicketsLost,
        scoreAtFall: totalRuns,
        overDisplay: formatOvers(legalBallsBowled),
        batterName: outBatter?.name || 'Batter',
        dismissalType: b.dismissalType,
      });

      const replacement = nextBatterQueue.shift();
      if (replacement) {
        if (outId === strikerId) strikerId = replacement;
        else nonStrikerId = replacement;
      }
    }

    // Strike rotation on odd runs (unless wicket just ended innings)
    const ranOdd = (b.runsOffBat + (b.extraType === 'BYE' || b.extraType === 'LEG_BYE' ? b.extraRuns : 0)) % 2 === 1;
    if (ranOdd) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }

    // End of over strike swap & auto-rotate bowler if next bowler available
    if (b.isLegalDelivery && legalBallsBowled % 6 === 0) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
      const bowlers = bowlingTeam.players.filter((p) => p.bowlingStyle !== 'NONE');
      if (bowlers.length > 1) {
        const idx = bowlers.findIndex((p) => p.id === currentBowlerId);
        currentBowlerId = bowlers[(idx + 1) % bowlers.length].id;
      }
    }
  }

  const oversCompleted = legalBallsBowled >= oversLimit * 6;
  const allOut = wicketsLost >= maxWickets;
  const targetChased = targetRuns !== null && totalRuns >= targetRuns;

  return {
    inningsNumber,
    battingTeamId: battingTeam.id,
    bowlingTeamId: bowlingTeam.id,
    totalRuns,
    wicketsLost,
    legalBallsBowled,
    targetRuns,
    isCompleted: oversCompleted || allOut || targetChased,
    strikerId,
    nonStrikerId,
    currentBowlerId,
    balls,
    battingCard: Array.from(batterMap.values()).filter((b) => b.balls > 0 || b.isOut || b.playerId === strikerId || b.playerId === nonStrikerId),
    bowlingCard: Array.from(bowlerMap.values()).filter((bw) => bw.legalBalls > 0 || bw.runsConceded > 0 || bw.playerId === currentBowlerId),
    fallOfWickets,
  };
}

function createSeedState(): DatabaseState {
  const t1Id = 'tourn_short_pitch_cup';
  const t2Id = 'tourn_district_t20';

  const teamA: Team = {
    id: 'team_gulberg_chargers',
    tournamentId: t1Id,
    name: 'Gulberg Chargers',
    shortCode: 'GUL',
    players: [
      { id: 'p_gul_1', name: 'Hamza Tariq', battingStyle: 'RHB', bowlingStyle: 'NONE' },
      { id: 'p_gul_2', name: 'Bilal Aslam', battingStyle: 'LHB', bowlingStyle: 'SPIN' },
      { id: 'p_gul_3', name: 'Usman Raza', battingStyle: 'RHB', bowlingStyle: 'MEDIUM' },
      { id: 'p_gul_4', name: 'Saad Mahmood', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_gul_5', name: 'Zain Abbas', battingStyle: 'LHB', bowlingStyle: 'PACE' },
      { id: 'p_gul_6', name: 'Danish Ali', battingStyle: 'RHB', bowlingStyle: 'SPIN' },
    ],
  };

  const teamB: Team = {
    id: 'team_model_town_xi',
    tournamentId: t1Id,
    name: 'Model Town Strikers',
    shortCode: 'MTS',
    players: [
      { id: 'p_mts_1', name: 'Faisal Nadeem', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_mts_2', name: 'Kamran Qureshi', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_mts_3', name: 'Awais Javed', battingStyle: 'LHB', bowlingStyle: 'SPIN' },
      { id: 'p_mts_4', name: 'Taimoor Khan', battingStyle: 'RHB', bowlingStyle: 'MEDIUM' },
      { id: 'p_mts_5', name: 'Noman Sheikh', battingStyle: 'RHB', bowlingStyle: 'NONE' },
      { id: 'p_mts_6', name: 'Hassan Farooq', battingStyle: 'LHB', bowlingStyle: 'PACE' },
    ],
  };

  const teamC: Team = {
    id: 'team_victoria_united',
    tournamentId: t2Id,
    name: 'Victoria United',
    shortCode: 'VIC',
    players: [
      { id: 'p_vic_1', name: 'Arjun Patel', battingStyle: 'RHB', bowlingStyle: 'SPIN' },
      { id: 'p_vic_2', name: 'Liam Brooks', battingStyle: 'LHB', bowlingStyle: 'NONE' },
      { id: 'p_vic_3', name: 'Rohan Sharma', battingStyle: 'RHB', bowlingStyle: 'MEDIUM' },
      { id: 'p_vic_4', name: 'Noah Reid', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_vic_5', name: 'Karan Mehta', battingStyle: 'LHB', bowlingStyle: 'PACE' },
    ],
  };

  const teamD: Team = {
    id: 'team_harbour_kings',
    tournamentId: t2Id,
    name: 'Harbour Kings',
    shortCode: 'HBK',
    players: [
      { id: 'p_hbk_1', name: 'Devendra Singh', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_hbk_2', name: 'Samir Patel', battingStyle: 'LHB', bowlingStyle: 'SPIN' },
      { id: 'p_hbk_3', name: 'Callum Grant', battingStyle: 'RHB', bowlingStyle: 'PACE' },
      { id: 'p_hbk_4', name: 'Imran Siddiqui', battingStyle: 'RHB', bowlingStyle: 'MEDIUM' },
      { id: 'p_hbk_5', name: 'Tyler Mills', battingStyle: 'RHB', bowlingStyle: 'NONE' },
    ],
  };

  const now = new Date().toISOString();
  const shortPitchBalls: BallEvent[] = [
    {
      id: 'ball_seed_1',
      inningsNumber: 1,
      sequenceIndex: 1,
      overNumber: 0,
      ballInOver: 1,
      strikerId: 'p_gul_1',
      nonStrikerId: 'p_gul_2',
      bowlerId: 'p_mts_1',
      runsOffBat: 4,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: false,
      dismissalType: 'NONE',
      dismissedPlayerId: null,
      speedKmh: 112.4,
      speedMph: 69.8,
      releaseTsMs: 1000,
      reachTsMs: 1410,
      pitchDistanceYards: 14,
      cameraFps: 60,
      createdAt: now,
    },
    {
      id: 'ball_seed_2',
      inningsNumber: 1,
      sequenceIndex: 2,
      overNumber: 0,
      ballInOver: 2,
      strikerId: 'p_gul_1',
      nonStrikerId: 'p_gul_2',
      bowlerId: 'p_mts_1',
      runsOffBat: 1,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: false,
      dismissalType: 'NONE',
      dismissedPlayerId: null,
      speedKmh: 118.9,
      speedMph: 73.9,
      releaseTsMs: 2000,
      reachTsMs: 2387,
      pitchDistanceYards: 14,
      cameraFps: 60,
      createdAt: now,
    },
    {
      id: 'ball_seed_3',
      inningsNumber: 1,
      sequenceIndex: 3,
      overNumber: 0,
      ballInOver: 3,
      strikerId: 'p_gul_2',
      nonStrikerId: 'p_gul_1',
      bowlerId: 'p_mts_1',
      runsOffBat: 6,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: false,
      dismissalType: 'NONE',
      dismissedPlayerId: null,
      speedKmh: 108.2,
      speedMph: 67.2,
      releaseTsMs: 3000,
      reachTsMs: 3426,
      pitchDistanceYards: 14,
      cameraFps: 60,
      createdAt: now,
    },
    {
      id: 'ball_seed_4',
      inningsNumber: 1,
      sequenceIndex: 4,
      overNumber: 0,
      ballInOver: 4,
      strikerId: 'p_gul_2',
      nonStrikerId: 'p_gul_1',
      bowlerId: 'p_mts_1',
      runsOffBat: 0,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: true,
      dismissalType: 'BOWLED',
      dismissedPlayerId: 'p_gul_2',
      speedKmh: 124.6,
      speedMph: 77.4,
      releaseTsMs: 4000,
      reachTsMs: 4370,
      pitchDistanceYards: 14,
      cameraFps: 60,
      createdAt: now,
    },
  ];

  const longPitchBalls: BallEvent[] = [
    {
      id: 'ball_lp_1',
      inningsNumber: 1,
      sequenceIndex: 1,
      overNumber: 0,
      ballInOver: 1,
      strikerId: 'p_vic_1',
      nonStrikerId: 'p_vic_2',
      bowlerId: 'p_hbk_1',
      runsOffBat: 2,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: false,
      dismissalType: 'NONE',
      dismissedPlayerId: null,
      speedKmh: 131.5,
      speedMph: 81.7,
      releaseTsMs: 1000,
      reachTsMs: 1551,
      pitchDistanceYards: 22,
      cameraFps: 120,
      createdAt: now,
    },
    {
      id: 'ball_lp_2',
      inningsNumber: 1,
      sequenceIndex: 2,
      overNumber: 0,
      ballInOver: 2,
      strikerId: 'p_vic_1',
      nonStrikerId: 'p_vic_2',
      bowlerId: 'p_hbk_1',
      runsOffBat: 4,
      extraRuns: 0,
      extraType: 'NONE',
      isLegalDelivery: true,
      isWicket: false,
      dismissalType: 'NONE',
      dismissedPlayerId: null,
      speedKmh: 134.8,
      speedMph: 83.8,
      releaseTsMs: 2000,
      reachTsMs: 2537,
      pitchDistanceYards: 22,
      cameraFps: 120,
      createdAt: now,
    },
  ];

  const match1: MatchRecord = {
    id: 'match_short_qf1',
    tournamentId: t1Id,
    title: 'Gulberg Chargers vs Model Town Strikers',
    teamAId: teamA.id,
    teamBId: teamB.id,
    assignedScorerId: null,
    rules: {
      pitchMode: 'SHORT_PITCH',
      pitchDistanceYards: 14,
      oversLimit: 6,
      ballType: 'TAPE_GREEN',
      singleRunAllowed: true,
      boundaryOnlyMode: false,
    },
    status: 'LIVE',
    verifiedBy: null,
    verifiedAt: null,
    winnerText: null,
    activeInningsNumber: 1,
    innings1: buildInningsFromBalls(1, teamA, teamB, shortPitchBalls, 6, null),
    innings2: null,
    createdAt: now,
  };

  const match2: MatchRecord = {
    id: 'match_long_t10',
    tournamentId: t2Id,
    title: 'Victoria United vs Harbour Kings',
    teamAId: teamC.id,
    teamBId: teamD.id,
    assignedScorerId: null,
    rules: {
      pitchMode: 'LONG_PITCH',
      pitchDistanceYards: 22,
      oversLimit: 10,
      ballType: 'LEATHER_RED',
      singleRunAllowed: true,
      boundaryOnlyMode: false,
    },
    status: 'LIVE',
    verifiedBy: null,
    verifiedAt: null,
    winnerText: null,
    activeInningsNumber: 1,
    innings1: buildInningsFromBalls(1, teamC, teamD, longPitchBalls, 10, null),
    innings2: null,
    createdAt: now,
  };

  return {
    users: [],
    settings: {
      shortPitchPresetsYards: [12, 14, 15, 16],
      longPitchDefaultYards: 22,
      enabledTiers: ['COMMUNITY', 'CLUB_PRO', 'LEAGUE_ENTERPRISE'],
      maxFpsTarget: 120,
      allowPublicSpectatorRadar: true,
    },
    tournaments: [
      {
        id: t1Id,
        name: 'Lahore Night Tape-Ball Cup',
        city: 'Lahore',
        formatCategory: 'SHORT_PITCH',
        defaultPitchYards: 14,
        defaultOvers: 6,
        ballType: 'TAPE_GREEN',
        managedBy: 'system',
        status: 'LIVE',
        createdAt: now,
      },
      {
        id: t2Id,
        name: 'District Leather T10 Shield',
        city: 'Melbourne',
        formatCategory: 'LONG_PITCH',
        defaultPitchYards: 22,
        defaultOvers: 10,
        ballType: 'LEATHER_RED',
        managedBy: 'system',
        status: 'LIVE',
        createdAt: now,
      },
    ],
    teams: [teamA, teamB, teamC, teamD],
    matches: [match1, match2],
  };
}

class CricketStore {
  private state: DatabaseState;

  constructor() {
    this.state = this.load();
  }

  private load(): DatabaseState {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (parsed && Array.isArray(parsed.matches) && Array.isArray(parsed.users)) {
          return parsed;
        }
      }
    } catch {
      // Fallback to fresh seed if disk store is corrupted
    }
    const seed = createSeedState();
    this.saveState(seed);
    return seed;
  }

  private saveState(next: DatabaseState = this.state) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), 'utf8');
  }

  hasSuperAdmin(): boolean {
    return this.state.users.some((u) => u.role === 'SUPER_ADMIN');
  }

  getUsers(): PublicUser[] {
    return this.state.users.map(toPublicUser);
  }

  getUserById(id: string): UserRecord | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  createUser(input: {
    role: UserRole;
    fullName: string;
    email: string;
    passwordHash: string;
    createdBy: string | null;
    subscriptionTier?: 'COMMUNITY' | 'CLUB_PRO' | 'LEAGUE_ENTERPRISE';
  }): UserRecord {
    const user: UserRecord = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      role: input.role,
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      subscriptionTier: input.subscriptionTier || 'CLUB_PRO',
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    this.state.users.push(user);
    this.saveState();
    return user;
  }

  updateUser(
    id: string,
    patch: Partial<Pick<UserRecord, 'fullName' | 'role' | 'status' | 'subscriptionTier'>>
  ): PublicUser | null {
    const user = this.state.users.find((u) => u.id === id);
    if (!user) return null;
    if (patch.fullName !== undefined) user.fullName = patch.fullName.trim();
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.status !== undefined) user.status = patch.status;
    if (patch.subscriptionTier !== undefined) user.subscriptionTier = patch.subscriptionTier;
    this.saveState();
    return toPublicUser(user);
  }

  deleteUser(id: string): boolean {
    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx === -1) return false;
    this.state.users.splice(idx, 1);
    this.saveState();
    return true;
  }

  getSettings(): AppSettings {
    return this.state.settings;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.state.settings = { ...this.state.settings, ...patch };
    this.saveState();
    return this.state.settings;
  }

  getTournaments(): Tournament[] {
    return this.state.tournaments;
  }

  createTournament(input: Omit<Tournament, 'id' | 'createdAt'>): Tournament {
    const t: Tournament = {
      ...input,
      id: `tourn_${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.state.tournaments.unshift(t);
    this.saveState();
    return t;
  }

  getTeams(): Team[] {
    return this.state.teams;
  }

  createTeam(input: { tournamentId: string | null; name: string; shortCode: string; players: Team['players'] }): Team {
    const team: Team = {
      id: `team_${crypto.randomUUID().slice(0, 8)}`,
      tournamentId: input.tournamentId,
      name: input.name.trim(),
      shortCode: input.shortCode.trim().toUpperCase().slice(0, 4),
      players: input.players,
    };
    this.state.teams.push(team);
    this.saveState();
    return team;
  }

  getMatches(): MatchRecord[] {
    return this.state.matches;
  }

  getMatch(id: string): MatchRecord | undefined {
    return this.state.matches.find((m) => m.id === id);
  }

  createMatch(input: {
    tournamentId: string | null;
    teamAId: string;
    teamBId: string;
    assignedScorerId: string | null;
    rules: MatchRules;
  }): MatchRecord | null {
    const teamA = this.state.teams.find((t) => t.id === input.teamAId);
    const teamB = this.state.teams.find((t) => t.id === input.teamBId);
    if (!teamA || !teamB || teamA.id === teamB.id) return null;

    const match: MatchRecord = {
      id: `match_${crypto.randomUUID().slice(0, 8)}`,
      tournamentId: input.tournamentId,
      title: `${teamA.name} vs ${teamB.name}`,
      teamAId: teamA.id,
      teamBId: teamB.id,
      assignedScorerId: input.assignedScorerId,
      rules: input.rules,
      status: 'LIVE',
      verifiedBy: null,
      verifiedAt: null,
      winnerText: null,
      activeInningsNumber: 1,
      innings1: buildInningsFromBalls(1, teamA, teamB, [], input.rules.oversLimit, null),
      innings2: null,
      createdAt: new Date().toISOString(),
    };
    this.state.matches.unshift(match);
    this.saveState();
    return match;
  }

  assignMatchScorer(matchId: string, scorerId: string | null): MatchRecord | null {
    const match = this.getMatch(matchId);
    if (!match) return null;
    match.assignedScorerId = scorerId;
    this.saveState();
    return match;
  }

  verifyMatch(matchId: string, verifierId: string): MatchRecord | null {
    const match = this.getMatch(matchId);
    if (!match) return null;
    match.status = 'VERIFIED';
    match.verifiedBy = verifierId;
    match.verifiedAt = new Date().toISOString();
    this.saveState();
    return match;
  }

  startSecondInnings(matchId: string): MatchRecord | null {
    const match = this.getMatch(matchId);
    if (!match || match.innings2) return null;
    const teamA = this.state.teams.find((t) => t.id === match.teamAId)!;
    const teamB = this.state.teams.find((t) => t.id === match.teamBId)!;
    const target = match.innings1.totalRuns + 1;
    match.innings1.isCompleted = true;
    match.activeInningsNumber = 2;
    match.innings2 = buildInningsFromBalls(2, teamB, teamA, [], match.rules.oversLimit, target);
    this.saveState();
    return match;
  }

  scoreBall(
    matchId: string,
    payload: {
      runsOffBat: number;
      extraType?: ExtraType;
      extraRuns?: number;
      isWicket?: boolean;
      dismissalType?: DismissalType;
      speedKmh?: number | null;
      speedMph?: number | null;
      releaseTsMs?: number | null;
      reachTsMs?: number | null;
      cameraFps?: number | null;
    }
  ): { match: MatchRecord; ball: BallEvent } | { error: string } {
    const match = this.getMatch(matchId);
    if (!match) return { error: 'Match not found.' };
    if (match.status === 'COMPLETED' || match.status === 'VERIFIED') {
      return { error: 'Match is already completed.' };
    }

    const activeInnings = match.activeInningsNumber === 1 ? match.innings1 : match.innings2;
    if (!activeInnings) return { error: 'Active innings unavailable.' };
    if (activeInnings.isCompleted) {
      return { error: 'Current innings is completed. Start 2nd innings or finish match.' };
    }

    const extraType: ExtraType = payload.extraType ?? 'NONE';
    const runsOffBat = Math.max(0, Math.min(6, Math.trunc(payload.runsOffBat)));

    // Enforce Short Pitch local rules
    if (match.rules.boundaryOnlyMode && runsOffBat !== 0 && runsOffBat !== 4 && runsOffBat !== 6) {
      return { error: 'Boundary-Only local rule active: only 0, 4, or 6 runs off bat allowed.' };
    }
    if (!match.rules.singleRunAllowed && runsOffBat === 1) {
      return { error: 'Single-run disallowed by match rules.' };
    }

    const isLegalDelivery = extraType !== 'WIDE' && extraType !== 'NO_BALL';
    const defaultExtra = extraType === 'WIDE' || extraType === 'NO_BALL' ? 1 : 0;
    const extraRuns = payload.extraRuns !== undefined ? Math.max(0, Math.min(6, payload.extraRuns)) : defaultExtra;

    const ball: BallEvent = {
      id: `ball_${crypto.randomUUID().slice(0, 8)}`,
      inningsNumber: match.activeInningsNumber,
      sequenceIndex: activeInnings.balls.length + 1,
      overNumber: Math.floor(activeInnings.legalBallsBowled / 6),
      ballInOver: (activeInnings.legalBallsBowled % 6) + (isLegalDelivery ? 1 : 0),
      strikerId: activeInnings.strikerId,
      nonStrikerId: activeInnings.nonStrikerId,
      bowlerId: activeInnings.currentBowlerId,
      runsOffBat,
      extraRuns,
      extraType,
      isLegalDelivery,
      isWicket: Boolean(payload.isWicket),
      dismissalType: payload.isWicket ? (payload.dismissalType && payload.dismissalType !== 'NONE' ? payload.dismissalType : 'BOWLED') : 'NONE',
      dismissedPlayerId: payload.isWicket ? activeInnings.strikerId : null,
      speedKmh: payload.speedKmh ?? null,
      speedMph: payload.speedMph ?? null,
      releaseTsMs: payload.releaseTsMs ?? null,
      reachTsMs: payload.reachTsMs ?? null,
      pitchDistanceYards: payload.speedKmh ? match.rules.pitchDistanceYards : null,
      cameraFps: payload.cameraFps ?? null,
      createdAt: new Date().toISOString(),
    };

    const battingTeam = this.state.teams.find((t) => t.id === activeInnings.battingTeamId)!;
    const bowlingTeam = this.state.teams.find((t) => t.id === activeInnings.bowlingTeamId)!;
    const nextBalls = [...activeInnings.balls, ball];
    const rebuilt = buildInningsFromBalls(
      activeInnings.inningsNumber,
      battingTeam,
      bowlingTeam,
      nextBalls,
      match.rules.oversLimit,
      activeInnings.targetRuns
    );

    if (match.activeInningsNumber === 1) {
      match.innings1 = rebuilt;
    } else {
      match.innings2 = rebuilt;
      if (rebuilt.isCompleted) {
        match.status = 'COMPLETED';
        if (rebuilt.targetRuns !== null && rebuilt.totalRuns >= rebuilt.targetRuns) {
          const wicketsRemaining = Math.max(1, battingTeam.players.length - 1 - rebuilt.wicketsLost);
          match.winnerText = `${battingTeam.name} won by ${wicketsRemaining} wicket${wicketsRemaining === 1 ? '' : 's'}`;
        } else if (rebuilt.totalRuns === match.innings1.totalRuns) {
          match.winnerText = 'Match Tied';
        } else {
          const runMargin = match.innings1.totalRuns - rebuilt.totalRuns;
          match.winnerText = `${bowlingTeam.name} won by ${runMargin} run${runMargin === 1 ? '' : 's'}`;
        }
      }
    }

    this.saveState();
    return { match, ball };
  }

  attachSpeedToBall(
    matchId: string,
    ballId: string,
    speed: { speedKmh: number; speedMph: number; releaseTsMs?: number | null; reachTsMs?: number | null; cameraFps?: number | null }
  ): MatchRecord | null {
    const match = this.getMatch(matchId);
    if (!match) return null;
    const activeInnings = match.activeInningsNumber === 1 ? match.innings1 : match.innings2;
    if (!activeInnings) return null;

    const target = activeInnings.balls.find((b) => b.id === ballId);
    if (!target) return null;

    target.speedKmh = speed.speedKmh;
    target.speedMph = speed.speedMph;
    target.releaseTsMs = speed.releaseTsMs ?? null;
    target.reachTsMs = speed.reachTsMs ?? null;
    target.pitchDistanceYards = match.rules.pitchDistanceYards;
    target.cameraFps = speed.cameraFps ?? 60;

    const battingTeam = this.state.teams.find((t) => t.id === activeInnings.battingTeamId)!;
    const bowlingTeam = this.state.teams.find((t) => t.id === activeInnings.bowlingTeamId)!;
    const rebuilt = buildInningsFromBalls(
      activeInnings.inningsNumber,
      battingTeam,
      bowlingTeam,
      activeInnings.balls,
      match.rules.oversLimit,
      activeInnings.targetRuns
    );

    if (match.activeInningsNumber === 1) match.innings1 = rebuilt;
    else match.innings2 = rebuilt;

    this.saveState();
    return match;
  }

  undoLastBall(matchId: string): MatchRecord | null {
    const match = this.getMatch(matchId);
    if (!match) return null;
    const activeInnings = match.activeInningsNumber === 1 ? match.innings1 : match.innings2;
    if (!activeInnings || activeInnings.balls.length === 0) return null;

    const battingTeam = this.state.teams.find((t) => t.id === activeInnings.battingTeamId)!;
    const bowlingTeam = this.state.teams.find((t) => t.id === activeInnings.bowlingTeamId)!;
    const remaining = activeInnings.balls.slice(0, -1);
    const rebuilt = buildInningsFromBalls(
      activeInnings.inningsNumber,
      battingTeam,
      bowlingTeam,
      remaining,
      match.rules.oversLimit,
      activeInnings.targetRuns
    );

    if (match.activeInningsNumber === 1) match.innings1 = rebuilt;
    else {
      match.innings2 = rebuilt;
      if (match.status === 'COMPLETED') {
        match.status = 'LIVE';
        match.winnerText = null;
      }
    }

    this.saveState();
    return match;
  }

  getAnalyticsAndLeaderboards() {
    const runMap = new Map<string, { playerId: string; name: string; teamName: string; runs: number; balls: number }>();
    const wicketMap = new Map<string, { playerId: string; name: string; teamName: string; wickets: number; economy: number }>();
    const speedList: Array<{ playerId: string; name: string; teamName: string; speedKmh: number; speedMph: number; pitchYards: number }> = [];

    let totalBallsTracked = 0;
    let fastestDeliveryKmh = 0;

    for (const m of this.state.matches) {
      const teamA = this.state.teams.find((t) => t.id === m.teamAId);
      const teamB = this.state.teams.find((t) => t.id === m.teamBId);
      const inningsList = [m.innings1, m.innings2].filter((x): x is InningsState => x !== null);

      for (const inn of inningsList) {
        const batTeam = inn.battingTeamId === teamA?.id ? teamA : teamB;
        const bowlTeam = inn.bowlingTeamId === teamA?.id ? teamA : teamB;

        for (const b of inn.battingCard) {
          const prev = runMap.get(b.playerId) || {
            playerId: b.playerId,
            name: b.name,
            teamName: batTeam?.shortCode || 'TM',
            runs: 0,
            balls: 0,
          };
          prev.runs += b.runs;
          prev.balls += b.balls;
          runMap.set(b.playerId, prev);
        }

        for (const bw of inn.bowlingCard) {
          const prev = wicketMap.get(bw.playerId) || {
            playerId: bw.playerId,
            name: bw.name,
            teamName: bowlTeam?.shortCode || 'TM',
            wickets: 0,
            economy: bw.economy,
          };
          prev.wickets += bw.wickets;
          prev.economy = bw.economy;
          wicketMap.set(bw.playerId, prev);
        }

        for (const ball of inn.balls) {
          totalBallsTracked += 1;
          if (ball.speedKmh !== null) {
            if (ball.speedKmh > fastestDeliveryKmh) fastestDeliveryKmh = ball.speedKmh;
            const bowler = bowlTeam?.players.find((p) => p.id === ball.bowlerId);
            speedList.push({
              playerId: ball.bowlerId,
              name: bowler?.name || 'Bowler',
              teamName: bowlTeam?.shortCode || 'TM',
              speedKmh: ball.speedKmh,
              speedMph: ball.speedMph || Number((ball.speedKmh * 0.621371).toFixed(1)),
              pitchYards: ball.pitchDistanceYards || m.rules.pitchDistanceYards,
            });
          }
        }
      }
    }

    return {
      globalSummary: {
        totalMatches: this.state.matches.length,
        activeTournaments: this.state.tournaments.filter((t) => t.status === 'LIVE').length,
        totalUsers: this.state.users.length,
        totalBallsTracked,
        fastestDeliveryKmh,
      },
      topRunScorers: Array.from(runMap.values()).sort((a, b) => b.runs - a.runs).slice(0, 6),
      topWicketTakers: Array.from(wicketMap.values()).sort((a, b) => b.wickets - a.wickets).slice(0, 6),
      fastestBowlers: speedList.sort((a, b) => b.speedKmh - a.speedKmh).slice(0, 6),
    };
  }
}

export const store = new CricketStore();
