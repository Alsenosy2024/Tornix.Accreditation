import type { Request, Response, NextFunction } from 'express';
import { verifySession, type SessionPayload } from './auth';

declare module 'express-serve-static-core' {
  interface Request { user?: SessionPayload }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).end();
  try {
    req.user = await verifySession(h.slice(7));
    next();
  } catch {
    res.status(401).end();
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) return res.status(403).end();
  next();
}
