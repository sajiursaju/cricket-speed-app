import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PublicUser, UserRecord, UserRole } from '../types.ts';

// Runtime-generated fallback ensures no hardcoded JWT/HMAC secret exists in source code.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

export function signSessionToken(user: PublicUser): string {
  const payload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): { sub: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    role: u.role,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    subscriptionTier: u.subscriptionTier,
    createdAt: u.createdAt,
  };
}

export function createAuthMiddleware(getUserById: (id: string) => UserRecord | undefined) {
  return {
    requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Please sign in.' });
      }
      const token = authHeader.slice('Bearer '.length).trim();
      const verified = verifySessionToken(token);
      if (!verified) {
        return res.status(401).json({ error: 'Session expired or invalid token.' });
      }
      const user = getUserById(verified.sub);
      if (!user || user.status !== 'ACTIVE') {
        return res.status(403).json({ error: 'Account is suspended or not found.' });
      }
      req.user = toPublicUser(user);
      next();
    },

    requireRole(...allowedRoles: UserRole[]) {
      return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
          return res.status(403).json({
            error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}.`,
          });
        }
        next();
      };
    },
  };
}
