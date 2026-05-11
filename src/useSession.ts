import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { SessionUser } from './api';

const ADMIN_EMAILS = new Set([
  'ahmed0ibrahim@gmail.com',
  'ahmedzeroibrahim@gmail.com',
  'karm92000@gmail.com',
]);

function toAppUser(u: import('@supabase/supabase-js').User | undefined | null): SessionUser | null {
  if (!u || !u.email) return null;
  const email = u.email.toLowerCase();
  return {
    uid: u.id,
    email,
    name: (u.user_metadata?.full_name as string)
      ?? (u.user_metadata?.name as string)
      ?? null,
    photo: (u.user_metadata?.avatar_url as string)
      ?? (u.user_metadata?.picture as string)
      ?? null,
    isAdmin: ADMIN_EMAILS.has(email),
  };
}

export function useSession(): [SessionUser | null, boolean] {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(toAppUser(data.session?.user));
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(toAppUser(session?.user));
      setLoading(false);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return [user, loading];
}
