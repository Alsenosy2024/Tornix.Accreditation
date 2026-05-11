import type { Handler } from '@netlify/functions';
import { getSession } from '../lib/supabase';

export const handler: Handler = async (event) => {
  const session = await getSession(event);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: session
        ? {
            uid: session.userId,
            email: session.email,
            name: session.name,
            photo: session.photo,
            isAdmin: session.isAdmin,
          }
        : null,
    }),
  };
};
