import type { ServerBranding } from './branding';

export interface CertParams extends ServerBranding {
  userName: string;
  userEmail: string;
  userPhoto: string | null;
  score: number;
  serialNumber: string;
  createdAt: string; // ISO timestamp
}

// Page dimensions — A4 portrait at 300 DPI. 1cqw = 24.8 px.
const W = 2480;
const H = 3508;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

function nameFontPx(name: string): number {
  // Tuned to sit prominently against the pre-baked headings in the cert
  // background image. The client's old cqw ladder was calibrated for the
  // tiny on-screen preview and looked dwarfed at print resolution.
  // 1cqw = 24.8 px at the 2480px canvas width.
  const cqw =
    name.length > 45 ? 3.6 :
    name.length > 35 ? 4.4 :
    name.length > 28 ? 5.4 :
    name.length > 22 ? 6.4 :
    name.length > 15 ? 7.6 : 9.2;
  return cqw * 24.8;
}

function modeBgTemplate(p: CertParams): string {
  const namePx = nameFontPx(p.userName);
  const serialPx = (p.serialFontSize / 794) * W;
  const name = escapeHtml(p.userName);
  const serial = escapeHtml(p.serialNumber);
  return `
    <div class="cert-bg-wrap">
      <img class="cert-bg-img" src="${p.certBgDataUrl}" alt="" />
      <div class="cert-name-row" style="top:${p.nameY}%;">
        <h1 class="cert-name" style="
          color:${p.nameColor};
          font-family:${p.fontFamily};
          font-size:${namePx}px;
        ">${name}</h1>
      </div>
      <div class="cert-serial-row" style="top:${p.serialY}%;">
        <p class="cert-serial" style="
          color:${p.serialColor};
          font-family:${p.fontFamily};
          font-size:${serialPx}px;
        ">${serial}</p>
      </div>
    </div>
  `;
}

function modeBlankTemplate(p: CertParams): string {
  const date = new Date(p.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const photo = p.userPhoto
    ? `<img src="${p.userPhoto}" alt="" style="width:200px;height:200px;object-fit:cover;border-radius:32px;border:1px solid #ECE8FF" />`
    : '';
  const logo = p.logoDataUrl
    ? `<img src="${p.logoDataUrl}" alt="" style="width:200px;height:200px;object-fit:contain" />`
    : '';

  return `
    <div style="
      height:100%; width:100%;
      display:flex; flex-direction:column; justify-content:space-between;
      background:#FFFFFF; color:#1A1A2E;
      padding:250px 200px;
      font-family:'IBM Plex Sans Arabic', system-ui, sans-serif;
      position:relative;
    ">
      <div style="position:absolute; left:200px; right:200px; top:125px; height:2px; background:#ECE8FF;"></div>

      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:42px;">
          ${logo}
          <div>
            <div style="font-size:30px; letter-spacing:.18em; text-transform:uppercase; color:#64748B; font-weight:600;">Tornix</div>
            <div style="font-size:46px; font-weight:700; color:#0F172A;">Accreditation Center</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px; letter-spacing:.18em; text-transform:uppercase; color:#64748B; font-weight:600;">Serial</div>
          <div style="font-size:38px; font-weight:700; color:#0F172A; font-feature-settings:'tnum';">${escapeHtml(p.serialNumber)}</div>
        </div>
      </div>

      <div style="text-align:center; flex:1; display:flex; flex-direction:column; justify-content:center; gap:58px;">
        <div style="font-size:38px; letter-spacing:.32em; text-transform:uppercase; color:#7D42C6; font-weight:700;">Certified Professional</div>
        <div style="font-size:38px; color:#64748B;">This is to certify that</div>
        <h1 style="font-size:134px; font-weight:700; color:#0F172A; margin:0; letter-spacing:-.01em;">${escapeHtml(p.userName)}</h1>
        <p style="font-size:42px; line-height:1.6; color:#4D4D4D; max-width:2920px; margin:0 auto;">
          has demonstrated professional proficiency in the Tornix integrated project management environment,
          attaining a cumulative assessment score of <strong style="color:#0F172A">${p.score}%</strong>.
        </p>
      </div>

      <div style="display:flex; align-items:flex-end; justify-content:space-between; border-top:2px solid #ECE8FF; padding-top:75px;">
        <div style="display:flex; align-items:center; gap:50px;">
          ${photo}
          <div>
            <div style="font-size:28px; letter-spacing:.18em; text-transform:uppercase; color:#64748B; font-weight:600;">Date issued</div>
            <div style="font-size:42px; font-weight:700; color:#0F172A;">${escapeHtml(date)}</div>
            <div style="font-size:30px; color:#64748B; margin-top:12px;">${escapeHtml(p.userEmail)}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px; letter-spacing:.18em; text-transform:uppercase; color:#64748B; font-weight:600;">Issuing authority</div>
          <div style="font-size:38px; font-weight:700; color:#0F172A;">Tornix Global · Verified</div>
          <div style="display:inline-flex; align-items:center; gap:16px; margin-top:18px; padding:14px 30px; border-radius:9999px; background:#ECE8FF; color:#472572; font-weight:600; font-size:28px;">
            AI-validated session
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Returns a complete HTML document, sized 2480 × 3508 (A4 portrait at 300 DPI),
 * matching the client cert DOM in `src/App.tsx` (both modes).
 *
 * The output is what Puppeteer renders. Image data URLs are embedded inline
 * — only the user photo (Google CDN URL) and the Google Fonts CSS are fetched
 * over the network at render time.
 */
export function renderCertHtml(p: CertParams): string {
  const body = p.certBgDataUrl ? modeBgTemplate(p) : modeBlankTemplate(p);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');

  html, body { margin:0; padding:0; }
  body {
    width: ${W}px; height: ${H}px;
    background: white;
    font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Mode A — background template with overlaid name + serial */
  .cert-bg-wrap {
    position: relative; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: white; overflow: hidden;
  }
  .cert-bg-img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: contain;
  }
  .cert-name-row {
    position: absolute; left: 10%; right: 10%; text-align: center; z-index: 10;
    transform: translateY(-50%);
    display: flex; flex-direction: column; align-items: center;
  }
  .cert-name {
    font-weight: 700;
    line-height: 1.1;
    margin: 0;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    padding-bottom: 0.2em;
  }
  .cert-serial-row {
    position: absolute; left: 0; right: 0; text-align: center;
    pointer-events: none; z-index: 10;
    transform: translateY(-50%);
  }
  .cert-serial {
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1.1;
    margin: 0;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
