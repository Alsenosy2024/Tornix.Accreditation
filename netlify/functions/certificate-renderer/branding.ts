import type { SupabaseClient } from '@supabase/supabase-js';

export interface ServerBranding {
  logoDataUrl: string | null;
  certBgDataUrl: string | null;
  nameY: number;
  serialY: number;
  fontFamily: string;
  nameColor: string;
  serialColor: string;
  serialFontSize: number;
}

// Tailwind class → CSS font-family. Mirrors AdminPanel's choices.
const FONT_MAP: Record<string, string> = {
  'font-montserrat': '"IBM Plex Sans Arabic", sans-serif',
  'font-sans':       '"IBM Plex Sans Arabic", sans-serif',
  'font-serif':      '"IBM Plex Sans Arabic", Georgia, serif',
};

function hexToBase64(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null;
  const hex = v.startsWith('\\x') ? v.slice(2) : v;
  if (!hex) return null;
  return Buffer.from(hex, 'hex').toString('base64');
}

function dataUrl(b64: string | null, mime: string | null | undefined): string | null {
  if (!b64) return null;
  return `data:${mime || 'application/octet-stream'};base64,${b64}`;
}

/**
 * Loads branding from the settings table (`key='branding'`). Mirrors the bytea→base64
 * conversion in `settings-branding.ts` and applies the same defaults as the React client.
 */
export async function fetchBrandingForServer(supabase: SupabaseClient): Promise<ServerBranding> {
  const { data } = await supabase
    .from('settings')
    .select('data, logo_bytes, logo_mime, cert_bg_bytes, cert_bg_mime')
    .eq('key', 'branding')
    .maybeSingle();

  const meta = (data?.data || {}) as Record<string, any>;
  const logoDataUrl   = dataUrl(hexToBase64(data?.logo_bytes),   data?.logo_mime)   ?? (meta.logoUrl   ?? null);
  const certBgDataUrl = dataUrl(hexToBase64(data?.cert_bg_bytes), data?.cert_bg_mime) ?? (meta.certBgUrl ?? null);

  return {
    logoDataUrl,
    certBgDataUrl,
    nameY:          typeof meta.nameY        === 'number' ? meta.nameY        : 37,
    serialY:        typeof meta.serialY      === 'number' ? meta.serialY      : 96,
    fontFamily:     FONT_MAP[meta.fontFamily as string] || FONT_MAP['font-montserrat'],
    nameColor:      typeof meta.nameColor    === 'string' ? meta.nameColor    : '#0f172a',
    serialColor:    typeof meta.serialColor  === 'string' ? meta.serialColor  : '#1e293b',
    serialFontSize: typeof meta.serialFontSize === 'number' ? meta.serialFontSize : 20,
  };
}
