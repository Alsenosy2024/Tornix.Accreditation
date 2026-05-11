import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { HandlerEvent } from '@netlify/functions';
import WebSocket from 'ws';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !ANON) {
  // Throwing here keeps the function from running with a half-initialised client.
  throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY env vars are required');
}

// Supabase JS eagerly constructs a RealtimeClient that needs a WebSocket impl.
// Node < 22 has no native WebSocket, so we hand it `ws`.
const realtimeOpts = { transport: WebSocket as unknown as typeof globalThis.WebSocket };

// Build a Supabase client scoped to the caller's JWT (so RLS applies as that
// user).  For unauthenticated requests this is just the anon-role client.
export function clientFor(event: HandlerEvent): SupabaseClient {
  const auth = event.headers.authorization || event.headers.Authorization;
  return createClient(URL!, ANON!, {
    global: auth ? { headers: { Authorization: auth } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: realtimeOpts,
  });
}

export interface Session {
  userId: string;        // auth.users.id (UUID)
  email: string;
  isAdmin: boolean;
  name: string | null;
  photo: string | null;
}

const ADMIN_EMAILS = new Set([
  'ahmed0ibrahim@gmail.com',
  'ahmedzeroibrahim@gmail.com',
  'karm92000@gmail.com',
]);

export async function getSession(event: HandlerEvent): Promise<Session | null> {
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  // Verify the JWT by calling Supabase's auth endpoint (works with anon key).
  const client = createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: realtimeOpts,
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;

  const u = data.user;
  const email = (u.email || '').toLowerCase();
  return {
    userId: u.id,
    email,
    isAdmin: ADMIN_EMAILS.has(email),
    name:
      (u.user_metadata?.full_name as string) ||
      (u.user_metadata?.name as string) ||
      null,
    photo:
      (u.user_metadata?.avatar_url as string) ||
      (u.user_metadata?.picture as string) ||
      null,
  };
}
