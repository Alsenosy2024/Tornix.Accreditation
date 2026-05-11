import type { Handler } from '@netlify/functions';
import { getSession } from '../lib/supabase';
import whisperData from './transcript-data/whisper_segments.json';

interface WhisperSegment {
  id: number; start: number; end: number; text: string;
}
const WHISPER: { segments: WhisperSegment[] } = whisperData as any;

// Populated from /home/karem/side projects/hyperframe/work/segments/manifest.json.
// Keep in sync if the manifest changes.
const SOURCE_RANGES: Record<string, { start: number; end: number }> = {
  'tcp-01': { start: 514, end: 801 },
  'tcp-02': { start: 801, end: 1201 },
  'tcp-03': { start: 1201, end: 1614 },
  'tcp-04': { start: 1802, end: 2205 },
  'tcp-05': { start: 2205, end: 2723 },
  'tcp-06': { start: 2723, end: 3018 },
  'tcp-07': { start: 3018, end: 3308 },
  'tcp-08': { start: 3308, end: 3723 },
  'tcp-09': { start: 4858, end: 5193 },
  'tcp-10': { start: 5193, end: 5824 },
  'tcp-11': { start: 5824, end: 6314 },
  'tcp-12': { start: 6314, end: 6564 },
  'tcp-13': { start: 6564, end: 7023 },
  'tcp-14': { start: 7023, end: 7527 },
  'tcp-15': { start: 7527, end: 8074 },
  'tcp-16': { start: 8074, end: 8715 },
  'tcp-17': { start: 8715, end: 9013 },
  'tcp-18': { start: 9013, end: 9622 },
  'tcp-19': { start: 9622, end: 10224 },
  'tcp-20': { start: 10224, end: 11114 },
  'tcp-21': { start: 11114, end: 11724 },
  'tcp-22': { start: 11724, end: 12555 },
};

export const handler: Handler = async (event) => {
  const session = await getSession(event);
  if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const pathSlug = (event.path || '').match(/\/transcript\/([^/?]+)/)?.[1];
  const slug = event.queryStringParameters?.slug || pathSlug;
  if (!slug) return { statusCode: 400, body: JSON.stringify({ error: 'slug required' }) };

  const range = SOURCE_RANGES[slug];
  if (!range) return { statusCode: 404, body: JSON.stringify({ error: 'unknown slug' }) };

  const sentences = WHISPER.segments
    .filter(s => s.end > range.start && s.start < range.end)
    .map(s => ({
      start: Math.max(0, s.start - range.start),
      end: Math.min(range.end - range.start, s.end - range.start),
      text: s.text.trim(),
    }))
    .filter(s => s.text.length > 0);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentences }),
  };
};
