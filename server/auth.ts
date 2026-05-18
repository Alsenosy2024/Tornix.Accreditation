import { SignJWT, jwtVerify } from 'jose';

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
