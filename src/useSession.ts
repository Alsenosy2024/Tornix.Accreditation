import { useEffect, useState, useCallback } from 'react';
import type { SessionUser } from './api';

const KEY = 'tornix.jwt';

/** Decoded JWT payload fields we care about. */
export interface Session {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  exp: number;
}

function decodeBase64Url(s: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

function decodeToken(token: string): Session | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return {
      userId: String(payload.sub),
      email: String(payload.email),
      name: payload.name ?? null,
      picture: payload.picture ?? null,
      isAdmin: !!payload.is_admin,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** Map JWT Session → legacy SessionUser shape (used by the rest of App.tsx). */
function toSessionUser(s: Session): SessionUser {
  return {
    uid: s.userId,
    email: s.email,
    name: s.name,
    photo: s.picture,
    isAdmin: s.isAdmin,
  };
}

function loadUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem(KEY);
  if (!t) return null;
  const s = decodeToken(t);
  if (!s) { localStorage.removeItem(KEY); return null; }
  return toSessionUser(s);
}

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(loadUser);

  useEffect(() => {
    if (location.hash.startsWith('#token=')) {
      const t = location.hash.slice(7);
      localStorage.setItem(KEY, t);
      history.replaceState(null, '', location.pathname + location.search);
      const s = decodeToken(t);
      if (s) setUser(toSessionUser(s));
      else { localStorage.removeItem(KEY); setUser(null); }
    }
  }, []);

  const signIn = useCallback((next: string = location.pathname) => {
    location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY);
    setUser(null);
  }, []);

  return { user, signIn, signOut };
}

export function getStoredToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
}
