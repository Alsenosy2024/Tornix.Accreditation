import { Router } from 'express';
import { requireAuth } from '../middleware.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

interface WhisperSegment { start: number; end: number; text: string }

// Load the static whisper transcript data bundled in the repo.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataPath = join(__dirname, '../data/whisper_segments.json');
const RAW: unknown = JSON.parse(readFileSync(dataPath, 'utf-8'));
const WHISPER_SEGMENTS: WhisperSegment[] = Array.isArray(RAW)
  ? (RAW as WhisperSegment[])
  : ((RAW as { segments?: WhisperSegment[] })?.segments ?? []);

// Segment slug -> time range in the original master recording (seconds).
const SOURCE_RANGES: Record<string, { start: number; end: number }> = {
  'tcp-01': { start: 514,   end: 801   },
  'tcp-02': { start: 801,   end: 1201  },
  'tcp-03': { start: 1201,  end: 1614  },
  'tcp-04': { start: 1802,  end: 2205  },
  'tcp-05': { start: 2205,  end: 2723  },
  'tcp-06': { start: 2723,  end: 3018  },
  'tcp-07': { start: 3018,  end: 3308  },
  'tcp-08': { start: 3308,  end: 3723  },
  'tcp-09': { start: 4858,  end: 5193  },
  'tcp-10': { start: 5193,  end: 5824  },
  'tcp-11': { start: 5824,  end: 6314  },
  'tcp-12': { start: 6314,  end: 6564  },
  'tcp-13': { start: 6564,  end: 7023  },
  'tcp-14': { start: 7023,  end: 7527  },
  'tcp-15': { start: 7527,  end: 8074  },
  'tcp-16': { start: 8074,  end: 8715  },
  'tcp-17': { start: 8715,  end: 9013  },
  'tcp-18': { start: 9013,  end: 9622  },
  'tcp-19': { start: 9622,  end: 10224 },
  'tcp-20': { start: 10224, end: 11114 },
  'tcp-21': { start: 11114, end: 11724 },
  'tcp-22': { start: 11724, end: 12555 },
};

export function transcriptRouter(_ctx: object) {
  const r = Router();

  // GET /api/transcript/:slug  -> { sentences: [{start, end, text}] }
  r.get('/api/transcript/:slug', requireAuth, async (req, res) => {
    const slug = String(req.params.slug);
    const range = SOURCE_RANGES[slug];
    if (!range) return res.status(404).json({ error: 'unknown slug' });

    const sentences = WHISPER_SEGMENTS
      .filter((s) => s.end > range.start && s.start < range.end)
      .map((s) => ({
        start: Math.max(0, s.start - range.start),
        end: Math.min(range.end - range.start, s.end - range.start),
        text: (s.text || '').trim(),
      }))
      .filter((s) => s.text.length > 0);

    res.json({ sentences });
  });

  return r;
}
