import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../auth';

const fakeSecret = 'a'.repeat(64);
process.env.JWT_SECRET = fakeSecret;

describe('JWT session', () => {
  it('round-trips a session payload', async () => {
    const jwt = await signSession({
      userId: '42', email: 'k@example.com', name: 'K', picture: null, isAdmin: false,
    });
    const got = await verifySession(jwt);
    expect(got.userId).toBe('42');
    expect(got.email).toBe('k@example.com');
    expect(got.isAdmin).toBe(false);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const orig = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'b'.repeat(64);
    const jwt = await signSession({
      userId: '1', email: 'x@x', name: null, picture: null, isAdmin: false,
    });
    process.env.JWT_SECRET = orig;
    await expect(verifySession(jwt)).rejects.toThrow();
  });
});
