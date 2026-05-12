import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { clientFor, getSession } from '../lib/supabase';

// GET /api/assessments/:id/cert
//   → 401 if no session
//   → 404 if assessment not found
//   → 200 { status: 'not_required' } if score < 60
//   → 202 { status: 'pending' } if cert_storage_path is NULL
//   → 200 { status: 'ready', pdfUrl, pngUrl } otherwise (re-signs URLs if old)

const TTL = 31536000; // 1 year
const REFRESH_AT = TTL * 0.9 * 1000; // ms

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const session = await getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

  const pathId = (event.path || '').match(/\/assessments\/(\d+)\/cert/)?.[1];
  const id = Number(event.queryStringParameters?.id || pathId);
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'assessment id required' }) };

  // Use the JWT-scoped client first; RLS enforces ownership.
  const supabase = clientFor(event);
  const { data: row, error } = await supabase
    .from('assessments')
    .select('id, score, cert_storage_path, cert_pdf_url, cert_png_url, cert_generated_at')
    .eq('id', id)
    .maybeSingle();

  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  if (!row) return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };

  if (Number(row.score) < 60) {
    return { statusCode: 200, body: JSON.stringify({ status: 'not_required' }) };
  }

  if (!row.cert_storage_path) {
    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'pending' }),
    };
  }

  // Decide whether to re-sign URLs (≥90% of TTL elapsed).
  const genAt = row.cert_generated_at ? new Date(row.cert_generated_at).getTime() : 0;
  const elapsed = Date.now() - genAt;
  const stale = !row.cert_pdf_url || !row.cert_png_url || elapsed > REFRESH_AT;

  let pdfUrl = row.cert_pdf_url;
  let pngUrl = row.cert_png_url;

  if (stale) {
    // Re-signing requires service role (storage.createSignedUrl is callable with the
    // user JWT too, but only if the user can SELECT the object via RLS; service role
    // is simpler and matches the write path).
    const sUrl = process.env.SUPABASE_URL;
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sUrl && sKey) {
      const svc = createClient(sUrl, sKey, { auth: { persistSession: false } });
      const pdfPath = row.cert_storage_path;
      const pngPath = pdfPath.replace(/\.pdf$/, '.png');
      const [pd, pn] = await Promise.all([
        svc.storage.from('certificates').createSignedUrl(pdfPath, TTL),
        svc.storage.from('certificates').createSignedUrl(pngPath, TTL),
      ]);
      pdfUrl = pd.data?.signedUrl || pdfUrl;
      pngUrl = pn.data?.signedUrl || pngUrl;

      // Persist the fresh URLs.
      await svc.from('assessments')
        .update({ cert_pdf_url: pdfUrl, cert_png_url: pngUrl, cert_generated_at: new Date().toISOString() })
        .eq('id', id);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ status: 'ready', pdfUrl, pngUrl }),
  };
};
