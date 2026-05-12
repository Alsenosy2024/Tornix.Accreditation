import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import { fetchBrandingForServer } from './certificate-renderer/branding';
import { renderCertHtml } from './certificate-renderer/template';

// Pinned to match @sparticuz/chromium-min@^137.0.1
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.x64.tar';

/**
 * Triggered fire-and-forget by `assessments.ts` POST after a passing assessment
 * is inserted. Renders the certificate via headless Chromium, uploads PDF + PNG
 * to Supabase Storage, and writes the storage path + signed URLs back to the row.
 *
 * Auth: shared secret in Authorization header (the assessments function and any
 * future backfill script know the secret).
 *
 * Returns 202 on accept (background functions always return 202 to the caller),
 * but we still log success/error for the Netlify function log.
 */
export const handler: Handler = async (event) => {
  const expected = `Bearer ${process.env.CERT_RENDERER_SECRET || ''}`;
  if ((event.headers.authorization || event.headers.Authorization) !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  let body: any;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

  const assessmentId = Number(body.assessmentId);
  if (!assessmentId) return { statusCode: 400, body: JSON.stringify({ error: 'assessmentId required' }) };

  const URL_ENV = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_ENV || !KEY) {
    console.error('[cert-bg] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    return { statusCode: 500, body: JSON.stringify({ error: 'misconfigured' }) };
  }
  const sb = createClient(URL_ENV, KEY, { auth: { persistSession: false } });

  // 1. Load the assessment row
  const { data: row, error: rowErr } = await sb
    .from('assessments')
    .select('id, score, user_name, user_email, user_photo, serial_number, created_at')
    .eq('id', assessmentId)
    .maybeSingle();
  if (rowErr) {
    console.error('[cert-bg] row fetch failed:', rowErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: rowErr.message }) };
  }
  if (!row) {
    console.warn('[cert-bg] no row found for id=', assessmentId);
    return { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
  }
  if (Number(row.score) < 60) {
    console.log('[cert-bg] skipping fail assessment id=', assessmentId, 'score=', row.score);
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'fail' }) };
  }

  // 2. Branding + HTML
  const branding = await fetchBrandingForServer(sb);
  const html = renderCertHtml({
    ...branding,
    userName: row.user_name || 'Student',
    userEmail: row.user_email || '',
    userPhoto: row.user_photo || null,
    score: Math.round(Number(row.score)),
    serialNumber: row.serial_number || `TCP-${assessmentId}`,
    createdAt: row.created_at,
  });

  // 3. Launch Chromium and render
  let browser: any;
  let pdfBuffer: Buffer;
  let pngBuffer: Buffer;
  try {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    browser = await puppeteer.launch({
      args: [...chromium.args, '--disable-dev-shm-usage'],
      defaultViewport: { width: 2480, height: 3508, deviceScaleFactor: 1 },
      executablePath,
      headless: 'shell' as any, // chromium-min v137 uses Chrome's new headless mode
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'user-agent': 'Tornix-Cert-Renderer/1.0' });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.evaluate(() => (document as any).fonts.ready);
    // Belt-and-suspenders: give the layout one more paint cycle for the photo image.
    await new Promise(r => setTimeout(r, 300));

    pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    }));

    pngBuffer = Buffer.from(await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 2480, height: 3508 },
    }) as Uint8Array);
  } catch (e: any) {
    console.error('[cert-bg] render failed for id=', assessmentId, e?.message || e);
    return { statusCode: 500, body: JSON.stringify({ error: String(e?.message || e) }) };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // 4. Upload both files
  const safeEmail = String(row.user_email || '').toLowerCase();
  const pdfPath = `${safeEmail}/${assessmentId}.pdf`;
  const pngPath = `${safeEmail}/${assessmentId}.png`;

  const upPdf = await sb.storage.from('certificates').upload(pdfPath, pdfBuffer, {
    contentType: 'application/pdf', upsert: true,
  });
  if (upPdf.error) {
    console.error('[cert-bg] PDF upload failed:', upPdf.error.message);
    return { statusCode: 500, body: JSON.stringify({ error: upPdf.error.message }) };
  }

  const upPng = await sb.storage.from('certificates').upload(pngPath, pngBuffer, {
    contentType: 'image/png', upsert: true,
  });
  if (upPng.error) {
    console.error('[cert-bg] PNG upload failed:', upPng.error.message);
    return { statusCode: 500, body: JSON.stringify({ error: upPng.error.message }) };
  }

  // 5. Generate signed URLs (1 year)
  const TTL = 31536000;
  const [signedPdf, signedPng] = await Promise.all([
    sb.storage.from('certificates').createSignedUrl(pdfPath, TTL),
    sb.storage.from('certificates').createSignedUrl(pngPath, TTL),
  ]);

  // 6. Update the row
  const { error: updErr } = await sb
    .from('assessments')
    .update({
      cert_storage_path: pdfPath,
      cert_pdf_url: signedPdf.data?.signedUrl || null,
      cert_png_url: signedPng.data?.signedUrl || null,
      cert_generated_at: new Date().toISOString(),
    })
    .eq('id', assessmentId);
  if (updErr) {
    console.error('[cert-bg] row update failed:', updErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: updErr.message }) };
  }

  console.log('[cert-bg] OK id=', assessmentId, 'pdfBytes=', pdfBuffer.length, 'pngBytes=', pngBuffer.length);
  return { statusCode: 200, body: JSON.stringify({ ok: true, pdfPath, pngPath }) };
};
