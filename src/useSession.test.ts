import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from './useSession';

function makeJwt(claims: object) {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.`;
}

describe('useSession', () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('returns null user when no token stored', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.user).toBeNull();
  });

  it('parses #token=… on mount, stores it, cleans URL', () => {
    const t = makeJwt({ sub: '1', email: 'k@example.com', name: 'K', is_admin: false });
    history.replaceState(null, '', `/dashboard#token=${t}`);
    const { result } = renderHook(() => useSession());
    expect(result.current.user?.email).toBe('k@example.com');
    expect(localStorage.getItem('tornix.jwt')).toBe(t);
    expect(location.hash).toBe('');
  });

  it('clears state on signOut()', () => {
    localStorage.setItem('tornix.jwt', makeJwt({ sub: '1', email: 'k@example.com' }));
    const { result } = renderHook(() => useSession());
    expect(result.current.user).not.toBeNull();
    act(() => result.current.signOut());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('tornix.jwt')).toBeNull();
  });

  it('ignores expired tokens', () => {
    const expired = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ exp: 1, email: 'old@x' })).toString('base64url')}.`;
    localStorage.setItem('tornix.jwt', expired);
    const { result } = renderHook(() => useSession());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('tornix.jwt')).toBeNull();
  });
});
