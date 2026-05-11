import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';

// GET  /api/progress/:courseSlug  -> caller's progress for the course
// POST /api/progress              -> upsert one row {segmentId, clipKind, positionSec, completedAt?}
//
// POST supports two auth modes:
//   1) Authorization: Bearer <jwt>  (standard)
//   2) Body contains _token: <jwt>  (for navigator.sendBeacon, which can't set headers)

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const session = await getSession(event);
    if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

    const supabase = clientFor(event);
    const pathSlug = (event.path || '').match(/\/progress\/([^/?]+)/)?.[1];
    const slug = event.queryStringParameters?.courseSlug || pathSlug;
    if (!slug) return { statusCode: 400, body: JSON.stringify({ error: 'courseSlug required' }) };

    const { data: course, error: cErr } = await supabase
      .from('segmented_courses').select('id').eq('slug', slug).single();
    if (cErr || !course) return { statusCode: 404, body: JSON.stringify({ error: 'course not found' }) };

    const { data: segs, error: sErr } = await supabase
      .from('course_segments').select('id').eq('course_id', course.id);
    if (sErr) return { statusCode: 500, body: JSON.stringify({ error: sErr.message }) };

    const ids = (segs || []).map((r: any) => r.id);
    if (ids.length === 0) {
      return { statusCode: 200, body: JSON.stringify([]) };
    }

    const { data, error } = await supabase
      .from('segment_progress')
      .select('segment_id, clip_kind, position_sec, completed_at, updated_at')
      .in('segment_id', ids);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((data || []).map((r: any) => ({
        segmentId: r.segment_id,
        clipKind: r.clip_kind,
        positionSec: Number(r.position_sec),
        completedAt: r.completed_at,
        updatedAt: r.updated_at,
      }))),
    };
  }

  if (event.httpMethod === 'POST') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    // Beacon fallback: token in body
    const beaconToken: string | undefined = body._token;
    if (beaconToken && !event.headers.authorization) {
      event.headers = { ...event.headers, authorization: `Bearer ${beaconToken}` };
    }
    delete body._token;

    const session = await getSession(event);
    if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

    const segId = Number(body.segmentId);
    const kind = body.clipKind;
    const pos = Number(body.positionSec);
    if (!segId || !['intro','content','outro'].includes(kind) || !Number.isFinite(pos)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'segmentId, clipKind, positionSec required' }) };
    }

    const supabase = clientFor(event);
    const row = {
      user_id: session.userId,
      segment_id: segId,
      clip_kind: kind,
      position_sec: pos,
      completed_at: body.completedAt || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('segment_progress')
      .upsert(row, { onConflict: 'user_id,segment_id,clip_kind' });
    if (error) {
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
