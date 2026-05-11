import type { Handler } from '@netlify/functions';
import { clientFor } from '../lib/supabase';

// GET  /api/courses  -> public list
// POST /api/courses  -> admin create (RLS enforces this)

export const handler: Handler = async (event) => {
  const supabase = clientFor(event);

  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, video_url, chapters, created_at')
      .order('created_at', { ascending: false });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    // camelCase rename for client compatibility with the old shape.
    const out = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      videoUrl: r.video_url,
      chapters: r.chapters,
      createdAt: r.created_at,
    }));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) };
  }

  if (event.httpMethod === 'POST') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }
    if (!body.title) return { statusCode: 400, body: JSON.stringify({ error: 'title required' }) };

    const { data, error } = await supabase
      .from('courses')
      .insert({
        title: body.title,
        video_url: body.videoUrl || null,
        chapters: body.chapters || [],
      })
      .select('id, title, video_url, chapters, created_at')
      .single();
    if (error) {
      // RLS will yield "new row violates row-level security policy"; surface as 403.
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data!.id, title: data!.title, videoUrl: data!.video_url,
        chapters: data!.chapters, createdAt: data!.created_at,
      }),
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
