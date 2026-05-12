import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';

// POST /api/assessments  -> create assessment for signed-in user
// GET  /api/assessments  -> admin reads all (RLS enforces)

export const handler: Handler = async (event) => {
  const supabase = clientFor(event);
  const session = await getSession(event);

  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('assessments')
      .select('id, user_email, user_name, user_photo, score, integrity_score, serial_number, status, questions_count, created_at')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) {
      const status = /row-level security|permission denied/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }
    const out = (data || []).map((r: any) => ({
      id: r.id,
      userEmail: r.user_email,
      userName: r.user_name,
      userPhoto: r.user_photo,
      score: r.score,
      integrityScore: r.integrity_score,
      serialNumber: r.serial_number,
      status: r.status,
      questionsCount: r.questions_count,
      createdAt: r.created_at,
    }));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) };
  }

  if (event.httpMethod === 'POST') {
    if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    if (!['Started', 'completed', 'terminated', 'Passed', 'Failed'].includes(body.status)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'invalid status' }) };
    }

    const { data, error } = await supabase
      .from('assessments')
      .insert({
        user_id: session.userId,
        user_email: session.email,
        user_name: body.userName || session.name || null,
        user_photo: body.userPhoto || session.photo || null,
        score: Number(body.score ?? 0),
        integrity_score: Number(body.integrityScore ?? 0),
        serial_number: body.serialNumber || null,
        status: body.status,
        answers: body.answers || [],
        questions_count: body.questionsCount || null,
      })
      .select('id, created_at')
      .single();
    if (error) {
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }

    // Fire-and-forget: kick off server-side certificate generation for passing
    // assessments. We don't await the response (background functions return 202
    // immediately), but we DO race a short timer so the TCP request flies before
    // Netlify reaps this handler. If the background function never fires (network
    // blip), the row stays with cert_storage_path=NULL and the polling endpoint
    // reports `pending`; the client falls back to the legacy client-side render.
    if (Number(body.score ?? 0) >= 60) {
      const base = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
      const secret = process.env.CERT_RENDERER_SECRET || '';
      if (base && secret) {
        const bgUrl = `${base}/.netlify/functions/assessment-cert-generate-background`;
        try {
          await Promise.race([
            fetch(bgUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${secret}`,
              },
              body: JSON.stringify({ assessmentId: data!.id }),
            }).catch((err) => console.error('[cert-trigger] fetch failed:', err)),
            new Promise((r) => setTimeout(r, 200)),
          ]);
        } catch {
          // never block the response on this
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data!.id, createdAt: data!.created_at }),
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
