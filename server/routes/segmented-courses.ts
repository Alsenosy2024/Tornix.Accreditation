import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware.js';
import type { Db } from '../db.js';

function camelCourse(r: Record<string, unknown>) {
  return {
    id: r.id,
    slug: r.slug,
    titleAr: r.title_ar,
    titleEn: r.title_en,
    descriptionAr: r.description_ar,
    descriptionEn: r.description_en,
    language: r.language,
    passingScorePct: r.passing_score_pct,
    examQuestionCount: r.exam_question_count,
    unlockThresholdPct: r.unlock_threshold_pct,
    createdAt: r.created_at,
  };
}

function camelSegment(r: Record<string, unknown>) {
  return {
    id: r.id,
    num: r.num,
    slug: r.slug,
    titleAr: r.title_ar,
    titleEn: r.title_en,
    descriptionAr: r.description_ar,
    descriptionEn: r.description_en,
    durationSec: Number(r.duration_sec),
    vimeo: {
      introId: r.intro_vimeo_id,
      contentId: r.content_vimeo_id,
      outroId: r.outro_vimeo_id,
    },
    introDurationSec: r.intro_duration_sec != null ? Number(r.intro_duration_sec) : null,
    outroDurationSec: r.outro_duration_sec != null ? Number(r.outro_duration_sec) : null,
    nextTitleAr: r.next_title_ar,
    nextTitleEn: r.next_title_en,
    quiz: r.quiz,
  };
}

export function segmentedCoursesRouter(ctx: { db: Db }) {
  const r = Router();

  // GET /api/segmented-courses  -> list (id, slug, titleAr, titleEn, createdAt)
  r.get('/api/segmented-courses', async (_req, res) => {
    const { rows } = await ctx.db.q(
      `SELECT id, slug, title_ar, title_en, created_at
       FROM segmented_courses ORDER BY created_at DESC`,
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        titleAr: row.title_ar,
        titleEn: row.title_en,
        createdAt: row.created_at,
      })),
    );
  });

  // GET /api/segmented-courses/:slug  -> full course + segments array
  r.get('/api/segmented-courses/:slug', async (req, res) => {
    const { slug } = req.params;
    const { rows: courseRows } = await ctx.db.q(
      `SELECT * FROM segmented_courses WHERE slug = $1`,
      [slug],
    );
    if (!courseRows.length) return res.status(404).json({ error: 'course not found' });
    const course = courseRows[0];

    const { rows: segs } = await ctx.db.q(
      `SELECT * FROM course_segments WHERE course_id = $1 ORDER BY num ASC`,
      [course.id],
    );
    res.json({ course: camelCourse(course), segments: segs.map(camelSegment) });
  });

  // POST /api/segmented-courses  -> upsert course + segments (admin only)
  r.post('/api/segmented-courses', requireAuth, requireAdmin, async (req, res) => {
    const b = req.body ?? {};
    if (!b.slug || !b.titleAr || !b.titleEn) {
      return res.status(400).json({ error: 'slug, titleAr, titleEn required' });
    }

    const { rows: courseRows } = await ctx.db.q(
      `INSERT INTO segmented_courses
         (slug, title_ar, title_en, description_ar, description_en,
          language, passing_score_pct, exam_question_count, unlock_threshold_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO UPDATE SET
         title_ar            = EXCLUDED.title_ar,
         title_en            = EXCLUDED.title_en,
         description_ar      = EXCLUDED.description_ar,
         description_en      = EXCLUDED.description_en,
         language            = EXCLUDED.language,
         passing_score_pct   = EXCLUDED.passing_score_pct,
         exam_question_count = EXCLUDED.exam_question_count,
         unlock_threshold_pct= EXCLUDED.unlock_threshold_pct
       RETURNING id`,
      [
        b.slug,
        b.titleAr,
        b.titleEn,
        b.descriptionAr ?? null,
        b.descriptionEn ?? null,
        b.language ?? 'ar',
        b.passingScorePct ?? 70,
        b.examQuestionCount ?? 30,
        b.unlockThresholdPct ?? 80,
      ],
    );
    const courseId = courseRows[0].id;

    if (Array.isArray(b.segments) && b.segments.length > 0) {
      for (const s of b.segments) {
        await ctx.db.q(
          `INSERT INTO course_segments
             (course_id, num, slug, title_ar, title_en, description_ar, description_en,
              duration_sec, intro_vimeo_id, content_vimeo_id, outro_vimeo_id,
              intro_duration_sec, outro_duration_sec, next_title_ar, next_title_en, quiz)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
           ON CONFLICT (course_id, num) DO UPDATE SET
             slug              = EXCLUDED.slug,
             title_ar          = EXCLUDED.title_ar,
             title_en          = EXCLUDED.title_en,
             description_ar    = EXCLUDED.description_ar,
             description_en    = EXCLUDED.description_en,
             duration_sec      = EXCLUDED.duration_sec,
             intro_vimeo_id    = EXCLUDED.intro_vimeo_id,
             content_vimeo_id  = EXCLUDED.content_vimeo_id,
             outro_vimeo_id    = EXCLUDED.outro_vimeo_id,
             intro_duration_sec= EXCLUDED.intro_duration_sec,
             outro_duration_sec= EXCLUDED.outro_duration_sec,
             next_title_ar     = EXCLUDED.next_title_ar,
             next_title_en     = EXCLUDED.next_title_en,
             quiz              = EXCLUDED.quiz`,
          [
            courseId,
            s.num,
            s.slug,
            s.titleAr,
            s.titleEn,
            s.descriptionAr ?? null,
            s.descriptionEn ?? null,
            s.durationSec ?? 0,
            s.vimeo?.introId ?? null,
            s.vimeo?.contentId ?? null,
            s.vimeo?.outroId ?? null,
            s.introDurationSec ?? null,
            s.outroDurationSec ?? null,
            s.nextTitleAr ?? null,
            s.nextTitleEn ?? null,
            JSON.stringify(s.quiz ?? []),
          ],
        );
      }
    }

    res.json({ id: courseId });
  });

  return r;
}
