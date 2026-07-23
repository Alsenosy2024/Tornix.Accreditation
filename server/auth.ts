import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';
import type { Db } from './db.js';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

function secret() {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function signSession(s: SessionPayload, ttl: string = '7d'): Promise<string> {
  return new SignJWT({
    email: s.email, name: s.name, picture: s.picture, is_admin: s.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret());
  return {
    userId: payload.sub!,
    email: payload.email as string,
    name: (payload.name as string | null) ?? null,
    picture: (payload.picture as string | null) ?? null,
    isAdmin: !!payload.is_admin,
  };
}

export interface AuthCtx {
  db: Db;
  publicBaseUrl: string;
  clientId?: string;       // injectable for tests
  clientSecret?: string;
}

export function googleClient(ctx: AuthCtx) {
  return new OAuth2Client({
    clientId: ctx.clientId ?? process.env.GOOGLE_CLIENT_ID!,
    clientSecret: ctx.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: `${ctx.publicBaseUrl}/api/auth/google/callback`,
  });
}

export async function startGoogleAuth(ctx: AuthCtx, opts: { state: string; next: string }) {
  await ctx.db.q(
    `INSERT INTO oauth_state (state, payload) VALUES ($1, $2)`,
    [opts.state, JSON.stringify({ next: opts.next })],
  );
  return googleClient(ctx).generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state: opts.state,
    prompt: 'select_account',
    access_type: 'online',
  });
}

export async function consumeGoogleCallback(ctx: AuthCtx, opts: { code: string; state: string }) {
  const { rows } = await ctx.db.q<{ payload: { next?: string } }>(
    `DELETE FROM oauth_state
     WHERE state = $1 AND created_at > now() - interval '10 minutes'
     RETURNING payload`,
    [opts.state],
  );
  if (!rows.length) throw new Error('invalid or expired state');
  const next = rows[0].payload.next || '/';

  const client = googleClient(ctx);
  const { tokens } = await client.getToken(opts.code);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token!,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload()!;
  const email = (p.email ?? '').toLowerCase();
  if (!email || !p.email_verified) throw new Error('unverified google email');

  const upsert = await ctx.db.q<{ id: number; email: string; name: string | null; photo_url: string | null; is_admin: boolean }>(
    `INSERT INTO users (email, google_sub, name, photo_url, last_login_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO UPDATE
       SET google_sub = EXCLUDED.google_sub,
           name = COALESCE(users.name, EXCLUDED.name),
           photo_url = EXCLUDED.photo_url,
           last_login_at = now()
     RETURNING id, email, name, photo_url, is_admin`,
    [email, p.sub, p.name ?? null, p.picture ?? null],
  );
  const u = upsert.rows[0];
  const jwt = await signSession({
    userId: String(u.id),
    email: u.email,
    name: u.name,
    picture: u.photo_url,
    isAdmin: u.is_admin,
  });
  return { next, jwt };
}
