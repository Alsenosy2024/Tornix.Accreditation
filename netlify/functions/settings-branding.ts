import type { Handler } from '@netlify/functions';
import { clientFor } from '../lib/supabase';

// GET  /api/settings/branding  -> public read (RLS allows anon select)
// PUT  /api/settings/branding  -> admin write (RLS gates this)
//
// Image blobs travel as data: URLs on the wire.  Stored as bytea on the server.

interface BrandingDataUrl { logo?: string; badge?: string; certBg?: string; [k: string]: any }

function dataUrl(bytesBase64: string | null, mime: string | null): string | null {
  if (!bytesBase64) return null;
  return `data:${mime || 'application/octet-stream'};base64,${bytesBase64}`;
}

function splitDataUrl(value: unknown): { base64: string; mime: string } | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { base64: m[2], mime: m[1] };
}

export const handler: Handler = async (event) => {
  const supabase = clientFor(event);

  if (event.httpMethod === 'GET') {
    // PostgREST returns bytea as `\x` hex string; ask for base64 with the Accept-Profile trick
    // or, simpler, fetch via RPC.  Easiest: keep image data in a side endpoint or rely on the
    // fact that bytea round-trips here as a base64-encoded representation when we cast in select.
    const { data, error } = await supabase
      .from('settings')
      .select('data, logo_bytes, logo_mime, badge_bytes, badge_mime, cert_bg_bytes, cert_bg_mime')
      .eq('key', 'branding')
      .maybeSingle();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    const out: BrandingDataUrl = { ...(data?.data || {}) };
    if (data) {
      // PostgREST serializes bytea as a `\x...` hex string. Convert to base64.
      const hexToBase64 = (v: any): string | null => {
        if (!v || typeof v !== 'string') return null;
        const hex = v.startsWith('\\x') ? v.slice(2) : v;
        if (!hex) return null;
        return Buffer.from(hex, 'hex').toString('base64');
      };
      const logo = dataUrl(hexToBase64(data.logo_bytes), data.logo_mime as any);
      const badge = dataUrl(hexToBase64(data.badge_bytes), data.badge_mime as any);
      const cert = dataUrl(hexToBase64(data.cert_bg_bytes), data.cert_bg_mime as any);
      if (logo) out.logo = logo; else if (out.logoUrl) out.logo = out.logoUrl;
      if (badge) out.badge = badge; else if (out.badgeUrl) out.badge = out.badgeUrl;
      if (cert) out.certBg = cert; else if (out.certBgUrl) out.certBg = out.certBgUrl;
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(out),
    };
  }

  if (event.httpMethod === 'PUT' || event.httpMethod === 'POST') {
    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    const logo  = splitDataUrl(body.logo);
    const badge = splitDataUrl(body.badge);
    const cert  = splitDataUrl(body.certBg);

    // Non-image fields stay in JSONB.
    const incoming: Record<string, any> = { ...body };
    delete incoming.logo; delete incoming.badge; delete incoming.certBg;

    // Merge with existing JSONB so partial updates don't wipe other keys.
    const { data: existing } = await supabase
      .from('settings').select('data').eq('key', 'branding').maybeSingle();
    const mergedData = { ...(existing?.data || {}), ...incoming };

    // For bytea, send base64 prefixed with \x (hex) — pg-rest accepts hex form for bytea.
    const toBytea = (b64: string) => '\\x' + Buffer.from(b64, 'base64').toString('hex');

    const upsert: Record<string, any> = {
      key: 'branding',
      data: mergedData,
      updated_at: new Date().toISOString(),
    };
    if (logo)  { upsert.logo_bytes    = toBytea(logo.base64);  upsert.logo_mime    = logo.mime; }
    if (badge) { upsert.badge_bytes   = toBytea(badge.base64); upsert.badge_mime   = badge.mime; }
    if (cert)  { upsert.cert_bg_bytes = toBytea(cert.base64);  upsert.cert_bg_mime = cert.mime; }

    const { error } = await supabase.from('settings').upsert(upsert, { onConflict: 'key' });
    if (error) {
      const status = /row-level security/i.test(error.message) ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};
