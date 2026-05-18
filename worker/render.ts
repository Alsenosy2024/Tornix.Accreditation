import puppeteer from 'puppeteer-core';
import type { Db } from '../server/db';
import type { Storage } from '../server/storage';
import { fetchBrandingForServer } from '../shared/branding';
import { renderCertHtml } from '../shared/cert-template';

export interface RenderCtx {
  db: Db;
  storage: Storage;
  chromiumPath: string;
}

export async function renderAndUpload(ctx: RenderCtx, assessmentId: number): Promise<void> {
  const { rows } = await ctx.db.q<{
    id: number; user_name: string | null; user_email: string;
    user_photo: string | null; score: string; serial_number: string | null;
    created_at: Date;
  }>(
    `SELECT id::int AS id, user_name, user_email, user_photo, score, serial_number, created_at
     FROM assessments WHERE id = $1`,
    [assessmentId],
  );
  if (!rows.length) throw new Error(`assessment ${assessmentId} not found`);
  const row = rows[0];
  if (Number(row.score) < 60) throw new Error(`assessment ${assessmentId} score ${row.score} < 60`);

  const branding = await fetchBrandingForServer(ctx.db);
  const html = renderCertHtml({
    ...branding,
    userName: row.user_name || 'Student',
    userEmail: row.user_email,
    userPhoto: row.user_photo,
    score: Math.round(Number(row.score)),
    serialNumber: row.serial_number || `TCP-${row.id}`,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  });

  const browser = await puppeteer.launch({
    executablePath: ctx.chromiumPath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    defaultViewport: { width: 2480, height: 3508, deviceScaleFactor: 1 },
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'user-agent': 'Tornix-Cert-Renderer/1.0' });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 });
    await page.evaluate(() => (document as any).fonts.ready);
    await new Promise(r => setTimeout(r, 300));

    const pdf = Buffer.from(await page.pdf({
      width: '2480px', height: '3508px', printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: false,
    }));
    const png = Buffer.from(await page.screenshot({
      type: 'png', clip: { x: 0, y: 0, width: 2480, height: 3508 },
    }) as Uint8Array);

    const safeEmail = row.user_email.toLowerCase();
    const pdfKey = `${safeEmail}/${assessmentId}.pdf`;
    const pngKey = `${safeEmail}/${assessmentId}.png`;
    await ctx.storage.put(pdfKey, pdf, 'application/pdf');
    await ctx.storage.put(pngKey, png, 'image/png');

    await ctx.db.q(
      `UPDATE assessments
       SET cert_storage_path = $2, cert_generated_at = now(),
           cert_pdf_url = NULL, cert_png_url = NULL
       WHERE id = $1`,
      [assessmentId, pdfKey],
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
