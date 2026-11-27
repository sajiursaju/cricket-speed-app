import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  createAuthMiddleware,
  hashPassword,
  signSessionToken,
  toPublicUser,
  verifyPassword,
} from './server/middleware/rbac.ts';
import { store } from './server/store.ts';
import type { AuthenticatedRequest } from './server/middleware/rbac.ts';
import type { BallType, DismissalType, ExtraType, PitchMode, SubscriptionTier, UserRole } from './server/types.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const matchRoomClients = new Map<string, Set<WebSocket>>();

function broadcastMatchUpdate(matchId: string) {
  const match = store.getMatch(matchId);
  if (!match) return;
  const payload = JSON.stringify({ type: 'match:updated', match });

  const room = matchRoomClients.get(matchId);
  if (room) {
    for (const ws of room) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
  const allRoom = matchRoomClients.get('*');
  if (allRoom) {
    for (const ws of allRoom) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  let subscribedRoom = '*';
  if (!matchRoomClients.has('*')) matchRoomClients.set('*', new Set());
  matchRoomClients.get('*')!.add(ws);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && typeof msg.matchId === 'string') {
        matchRoomClients.get(subscribedRoom)?.delete(ws);
        subscribedRoom = msg.matchId;
        if (!matchRoomClients.has(subscribedRoom)) {
          matchRoomClients.set(subscribedRoom, new Set());
        }
        matchRoomClients.get(subscribedRoom)!.add(ws);
      }
    } catch {
      // Ignore malformed client frames
    }
  });

  ws.on('close', () => {
    matchRoomClients.get(subscribedRoom)?.delete(ws);
  });
});

const { requireAuth, requireRole } = createAuthMiddleware((id) => store.getUserById(id));

// --- Health & Auth Bootstrap Status ---
app.get('/api/auth/status', (_req, res) => {
  res.json({
    hasSuperAdmin: store.hasSuperAdmin(),
    passcodeConfigured: Boolean(process.env.ADMIN_PASSCODE),
  });
});

// First-run Super Admin (MD / CEO) claim endpoint
app.post('/api/auth/bootstrap', (req, res) => {
  if (store.hasSuperAdmin()) {
    return res.status(409).json({ error: 'Workspace Super Admin already claimed. Please sign in.' });
  }
  const { fullName, email, password, provisionSampleTeam, adminPasscode } = req.body ?? {};
  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Optional ADMIN_PASSCODE enforcement if configured in server environment
  if (process.env.ADMIN_PASSCODE) {
    const provided = Buffer.from(String(adminPasscode || ''), 'utf8');
    const expected = Buffer.from(process.env.ADMIN_PASSCODE, 'utf8');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(403).json({ error: 'Invalid server admin passcode.' });
    }
  }

  const superAdmin = store.createUser({
    role: 'SUPER_ADMIN',
    fullName,
    email,
    passwordHash: hashPassword(password),
    createdBy: null,
    subscriptionTier: 'LEAGUE_ENTERPRISE',
  });

  // Optionally create Managing Admin & Scorer workspace accounts using the same claimed password
  const createdAccounts = [toPublicUser(superAdmin)];
  if (provisionSampleTeam) {
    if (!store.getUserByEmail('organizer@creaseradar.local')) {
      const ma = store.createUser({
        role: 'MANAGING_ADMIN',
        fullName: 'Tariq Mehmood (Tournament Admin)',
        email: 'organizer@creaseradar.local',
        passwordHash: hashPassword(password),
        createdBy: superAdmin.id,
        subscriptionTier: 'CLUB_PRO',
      });
      createdAccounts.push(toPublicUser(ma));
    }
    if (!store.getUserByEmail('scorer@creaseradar.local')) {
      const sc = store.createUser({
        role: 'SCORER',
        fullName: 'Asadullah (Match Umpire)',
        email: 'scorer@creaseradar.local',
        passwordHash: hashPassword(password),
        createdBy: superAdmin.id,
        subscriptionTier: 'COMMUNITY',
      });
      createdAccounts.push(toPublicUser(sc));
    }
  }

  const pub = toPublicUser(superAdmin);
  const token = signSessionToken(pub);
  res.status(201).json({ user: pub, token, provisionedAccounts: createdAccounts });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = store.getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Account is suspended by Super Admin.' });
  }
  const pub = toPublicUser(user);
  const token = signSessionToken(pub);
  res.json({ user: pub, token });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

// --- Public Read-Only Spectator & Match Data ---
app.get('/api/matches', (_req, res) => {
  res.json({
    matches: store.getMatches(),
    teams: store.getTeams(),
    tournaments: store.getTournaments(),
    settings: store.getSettings(),
  });
});

app.get('/api/matches/:id', (req, res) => {
  const match = store.getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  res.json({ match });
});

app.get('/api/analytics', (_req, res) => {
  res.json(store.getAnalyticsAndLeaderboards());
});

// --- Scorer / Umpire + Admin Match Scoring Endpoints ---
app.post(
  '/api/matches',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'),
  (req: AuthenticatedRequest, res) => {
    const { tournamentId, teamAId, teamBId, pitchMode, pitchDistanceYards, oversLimit, ballType, singleRunAllowed, boundaryOnlyMode } = req.body ?? {};
    const validModes: PitchMode[] = ['SHORT_PITCH', 'LONG_PITCH'];
    const validBalls: BallType[] = ['TAPE_GREEN', 'TENNIS_YELLOW', 'LEATHER_RED', 'LEATHER_WHITE'];

    if (!validModes.includes(pitchMode) || !validBalls.includes(ballType)) {
      return res.status(400).json({ error: 'Invalid pitch mode or ball type.' });
    }
    const yards = Number(pitchDistanceYards);
    const overs = Number(oversLimit);
    if (!Number.isFinite(yards) || yards < 8 || yards > 25) {
      return res.status(400).json({ error: 'Pitch distance must be between 8 and 25 yards.' });
    }
    if (!Number.isFinite(overs) || overs < 1 || overs > 50) {
      return res.status(400).json({ error: 'Overs must be between 1 and 50.' });
    }

    const created = store.createMatch({
      tournamentId: typeof tournamentId === 'string' ? tournamentId : null,
      teamAId: String(teamAId || ''),
      teamBId: String(teamBId || ''),
      assignedScorerId: req.user!.id,
      rules: {
        pitchMode,
        pitchDistanceYards: yards,
        oversLimit: Math.trunc(overs),
        ballType,
        singleRunAllowed: boundaryOnlyMode ? false : singleRunAllowed !== false,
        boundaryOnlyMode: Boolean(boundaryOnlyMode),
      },
    });

    if (!created) {
      return res.status(400).json({ error: 'Please select two distinct valid teams.' });
    }
    broadcastMatchUpdate(created.id);
    res.status(201).json({ match: created });
  }
);

app.post(
  '/api/matches/:id/balls',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'),
  (req: AuthenticatedRequest, res) => {
    const { runsOffBat, extraType, extraRuns, isWicket, dismissalType, speedKmh, speedMph, releaseTsMs, reachTsMs, cameraFps } = req.body ?? {};
    const validExtras: ExtraType[] = ['NONE', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'];
    const validDismissals: DismissalType[] = ['NONE', 'BOWLED', 'CAUGHT', 'RUN_OUT', 'LBW', 'STUMPED'];

    if (extraType && !validExtras.includes(extraType)) {
      return res.status(400).json({ error: 'Invalid extra type.' });
    }
    if (dismissalType && !validDismissals.includes(dismissalType)) {
      return res.status(400).json({ error: 'Invalid dismissal type.' });
    }

    const result = store.scoreBall(req.params.id, {
      runsOffBat: Number(runsOffBat ?? 0),
      extraType: extraType ?? 'NONE',
      extraRuns: extraRuns !== undefined ? Number(extraRuns) : undefined,
      isWicket: Boolean(isWicket),
      dismissalType: dismissalType ?? 'NONE',
      speedKmh: typeof speedKmh === 'number' ? speedKmh : null,
      speedMph: typeof speedMph === 'number' ? speedMph : null,
      releaseTsMs: typeof releaseTsMs === 'number' ? releaseTsMs : null,
      reachTsMs: typeof reachTsMs === 'number' ? reachTsMs : null,
      cameraFps: typeof cameraFps === 'number' ? cameraFps : null,
    });

    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }

    broadcastMatchUpdate(result.match.id);
    res.status(201).json(result);
  }
);

app.patch(
  '/api/matches/:id/balls/:ballId/speed',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'),
  (req, res) => {
    const speedKmh = Number(req.body?.speedKmh);
    const speedMph = Number(req.body?.speedMph);
    if (!Number.isFinite(speedKmh) || speedKmh <= 10 || speedKmh > 180) {
      return res.status(400).json({ error: 'Speed must be a valid measurement between 10 and 180 km/h.' });
    }

    const updated = store.attachSpeedToBall(req.params.id, req.params.ballId, {
      speedKmh: Number(speedKmh.toFixed(1)),
      speedMph: Number((Number.isFinite(speedMph) ? speedMph : speedKmh * 0.621371).toFixed(1)),
      releaseTsMs: typeof req.body?.releaseTsMs === 'number' ? req.body.releaseTsMs : null,
      reachTsMs: typeof req.body?.reachTsMs === 'number' ? req.body.reachTsMs : null,
      cameraFps: typeof req.body?.cameraFps === 'number' ? req.body.cameraFps : 60,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Match or ball not found.' });
    }
    broadcastMatchUpdate(updated.id);
    res.json({ match: updated });
  }
);

app.post(
  '/api/matches/:id/undo',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'),
  (req, res) => {
    const updated = store.undoLastBall(req.params.id);
    if (!updated) return res.status(400).json({ error: 'Nothing to undo in current innings.' });
    broadcastMatchUpdate(updated.id);
    res.json({ match: updated });
  }
);

app.post(
  '/api/matches/:id/second-innings',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'),
  (req, res) => {
    const updated = store.startSecondInnings(req.params.id);
    if (!updated) return res.status(400).json({ error: 'Unable to start 2nd innings.' });
    broadcastMatchUpdate(updated.id);
    res.json({ match: updated });
  }
);

// --- Managing Admin & Super Admin Tournament / Team / Verification Routes ---
app.post(
  '/api/tournaments',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN'),
  (req: AuthenticatedRequest, res) => {
    const { name, city, formatCategory, defaultPitchYards, defaultOvers, ballType } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 3) {
      return res.status(400).json({ error: 'Tournament name is required.' });
    }
    const created = store.createTournament({
      name: name.trim(),
      city: typeof city === 'string' && city.trim() ? city.trim() : 'Local Ground',
      formatCategory: formatCategory === 'LONG_PITCH' ? 'LONG_PITCH' : 'SHORT_PITCH',
      defaultPitchYards: Number(defaultPitchYards) || 14,
      defaultOvers: Number(defaultOvers) || 6,
      ballType: ballType || 'TAPE_GREEN',
      managedBy: req.user!.id,
      status: 'LIVE',
    });
    res.status(201).json({ tournament: created });
  }
);

app.post(
  '/api/teams',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN'),
  (req, res) => {
    const { tournamentId, name, shortCode, playerNames } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Team name is required.' });
    }
    const namesList: string[] = Array.isArray(playerNames)
      ? playerNames.map((n) => String(n).trim()).filter(Boolean)
      : ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'];

    if (namesList.length < 2) {
      return res.status(400).json({ error: 'At least 2 players are required per team.' });
    }

    const team = store.createTeam({
      tournamentId: typeof tournamentId === 'string' ? tournamentId : null,
      name,
      shortCode: typeof shortCode === 'string' && shortCode.trim() ? shortCode : name.slice(0, 3),
      players: namesList.map((pName, idx) => ({
        id: `pl_${crypto.randomUUID().slice(0, 8)}`,
        name: pName,
        battingStyle: idx % 3 === 1 ? 'LHB' : 'RHB',
        bowlingStyle: idx === 0 ? 'NONE' : idx % 2 === 0 ? 'PACE' : 'SPIN',
      })),
    });
    res.status(201).json({ team });
  }
);

app.patch(
  '/api/matches/:id/assign-scorer',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN'),
  (req, res) => {
    const scorerId = typeof req.body?.scorerId === 'string' ? req.body.scorerId : null;
    const updated = store.assignMatchScorer(req.params.id, scorerId);
    if (!updated) return res.status(404).json({ error: 'Match not found.' });
    broadcastMatchUpdate(updated.id);
    res.json({ match: updated });
  }
);

app.post(
  '/api/matches/:id/verify',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MANAGING_ADMIN'),
  (req: AuthenticatedRequest, res) => {
    const updated = store.verifyMatch(req.params.id, req.user!.id);
    if (!updated) return res.status(404).json({ error: 'Match not found.' });
    broadcastMatchUpdate(updated.id);
    res.json({ match: updated });
  }
);

// --- Super Admin (MD / CEO) Only Routes ---
app.get('/api/admin/users', requireAuth, requireRole('SUPER_ADMIN', 'MANAGING_ADMIN'), (_req, res) => {
  res.json({ users: store.getUsers() });
});

app.post('/api/admin/users', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const { fullName, email, password, role, subscriptionTier } = req.body ?? {};
  const validRoles: UserRole[] = ['SUPER_ADMIN', 'MANAGING_ADMIN', 'SCORER'];
  const validTiers: SubscriptionTier[] = ['COMMUNITY', 'CLUB_PRO', 'LEAGUE_ENTERPRISE'];

  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role specified.' });
  }
  if (store.getUserByEmail(email)) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  const created = store.createUser({
    role,
    fullName,
    email,
    passwordHash: hashPassword(password),
    createdBy: req.user!.id,
    subscriptionTier: validTiers.includes(subscriptionTier) ? subscriptionTier : 'CLUB_PRO',
  });
  res.status(201).json({ user: toPublicUser(created) });
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  const { fullName, role, status, subscriptionTier } = req.body ?? {};
  if (req.params.id === req.user!.id && status === 'SUSPENDED') {
    return res.status(400).json({ error: 'Super Admin cannot suspend their own active session.' });
  }
  const updated = store.updateUser(req.params.id, { fullName, role, status, subscriptionTier });
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: updated });
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('SUPER_ADMIN'), (req: AuthenticatedRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'Super Admin cannot delete their own active account.' });
  }
  const deleted = store.deleteUser(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

app.patch('/api/admin/settings', requireAuth, requireRole('SUPER_ADMIN'), (req, res) => {
  const { shortPitchPresetsYards, longPitchDefaultYards, maxFpsTarget, allowPublicSpectatorRadar } = req.body ?? {};
  const next = store.updateSettings({
    ...(Array.isArray(shortPitchPresetsYards) ? { shortPitchPresetsYards: shortPitchPresetsYards.map(Number).filter((n) => n >= 8 && n <= 20) } : {}),
    ...(typeof longPitchDefaultYards === 'number' ? { longPitchDefaultYards } : {}),
    ...(maxFpsTarget === 60 || maxFpsTarget === 120 ? { maxFpsTarget } : {}),
    ...(typeof allowPublicSpectatorRadar === 'boolean' ? { allowPublicSpectatorRadar } : {}),
  });
  res.json({ settings: next });
});

// --- Read-Only Blueprint Code Files (Strict Allowlist + Path Confinement) ---
const BLUEPRINT_FILES = [
  'mobile-expo/App.tsx',
  'mobile-expo/package.json',
  'mobile-expo/app.json',
  'mobile-expo/src/vision/bowlingSpeedProcessor.ts',
  'mobile-expo/src/screens/SpeedTrackerScreen.tsx',
  'mobile-expo/src/screens/LiveScoringScreen.tsx',
  'mobile-expo/src/store/useMatchStore.ts',
  'db/schema.sql',
  'db/mongodb-schemas.ts',
  'server/middleware/rbac.ts',
];

app.get('/api/blueprints', (_req, res) => {
  const rootDir = path.resolve(process.cwd());
  const files = BLUEPRINT_FILES.map((relPath) => {
    const resolved = path.resolve(rootDir, relPath);
    if (!resolved.startsWith(rootDir + path.sep) || !fs.existsSync(resolved)) {
      return { path: relPath, content: '// File unavailable' };
    }
    return {
      path: relPath,
      content: fs.readFileSync(resolved, 'utf8'),
    };
  });
  res.json({ files });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CreaseRadar server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
