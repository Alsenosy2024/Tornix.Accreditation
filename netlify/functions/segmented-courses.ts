import type { Handler } from '@netlify/functions';
import { clientFor, getSession } from '../lib/supabase';

// GET  /api/segmented-courses             -> list (id, slug, title_ar, title_en)
// GET  /api/segmented-courses/:slug       -> full course + segments
// POST /api/segmented-courses             -> upsert course + segments (admin only via RLS)

export const handler: Handler = async (event) => {
  const supabase = clientFor(event);

  if (event.httpMethod === 'GET') {
    // Read slug from query string OR parse it out of the path, in case the
    // Netlify redirect for /api/segmented-courses/:slug didn't fire.
    const pathSlug = (event.path || '').match(/\/segmented-courses\/([^/?]+)/)?.[1];
    const slug = event.queryStringParameters?.slug || pathSlug || null;

    if (slug) {
      const { data: course, error: cErr } = await supabase
        .from('segmented_courses')
        .select('*')
        .eq('slug', slug)
        .single();
      if (cErr || !course) {
        return { statusCode: 404, body: JSON.stringify({ error: 'course not found' }) };
      }
      const { data: segments, error: sErr } = await supabase
        .from('course_segments')
        .select('*')
        .eq('course_id', course.id)
        .order('num', { ascending: true });
      if (sErr) return { statusCode: 500, body: JSON.stringify({ error: sErr.message }) };

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: camelCourse(course), segments: (segments || []).map(camelSegment) }),
      };
    }

    const { data, error } = await supabase
      .from('segmented_courses')
      .select('id, slug, title_ar, title_en, created_at')
      .order('created_at', { ascending: false });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify((data || []).map((r: any) => ({
        id: r.id, slug: r.slug, titleAr: r.title_ar, titleEn: r.title_en, createdAt: r.created_at,
      }))),
    };
  }

  if (event.httpMethod === 'POST') {
    const session = await getSession(event);
    if (!session) return { statusCode: 401, body: JSON.stringify({ error: 'sign in required' }) };
    if (!session.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: 'admin only' }) };

    let body: any;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

    if (!body.slug || !body.titleAr || !body.titleEn) {
      return { statusCode: 400, body: JSON.stringify({ error: 'slug, titleAr, titleEn required' }) };
    }

    const { data: course, error: cErr } = await supabase
      .from('segmented_courses')
      .upsert({
        slug: body.slug,
        title_ar: body.titleAr,
        title_en: body.titleEn,
        description_ar: body.descriptionAr ?? null,
        description_en: body.descriptionEn ?? null,
        language: body.language ?? 'ar',
        passing_score_pct: body.passingScorePct ?? 70,
        exam_question_count: body.examQuestionCount ?? 30,
        unlock_threshold_pct: body.unlockThresholdPct ?? 80,
      }, { onConflict: 'slug' })
      .select('id')
      .single();
    if (cErr || !course) {
      const status = /row-level security/i.test(cErr?.message || '') ? 403 : 500;
      return { statusCode: status, body: JSON.stringify({ error: cErr?.message }) };
    }

    if (Array.isArray(body.segments) && body.segments.length > 0) {
      const rows = body.segments.map((s: any) => ({
        course_id: course.id,
        num: s.num,
        slug: s.slug,
        title_ar: s.titleAr,
        title_en: s.titleEn,
        description_ar: s.descriptionAr ?? null,
        description_en: s.descriptionEn ?? null,
        duration_sec: s.durationSec ?? 0,
        intro_vimeo_id:   s.vimeo?.introId   || null,
        content_vimeo_id: s.vimeo?.contentId || null,
        outro_vimeo_id:   s.vimeo?.outroId   || null,
        intro_duration_sec: s.introDurationSec ?? null,
        outro_duration_sec: s.outroDurationSec ?? null,
        next_title_ar: s.nextTitleAr ?? null,
        next_title_en: s.nextTitleEn ?? null,
        quiz: s.quiz ?? [],
      }));
      const { error: sErr } = await supabase
        .from('course_segments')
        .upsert(rows, { onConflict: 'course_id,num' });
      if (sErr) {
        const status = /row-level security/i.test(sErr.message) ? 403 : 500;
        return { statusCode: status, body: JSON.stringify({ error: sErr.message }) };
      }
    }

    return { statusCode: 200, body: JSON.stringify({ id: course.id }) };
  }

  return { statusCode: 405, body: JSON.stringify({ error: 'method not allowed' }) };
};

function camelCourse(r: any) {
  return {
    id: r.id, slug: r.slug,
    titleAr: r.title_ar, titleEn: r.title_en,
    descriptionAr: r.description_ar, descriptionEn: r.description_en,
    language: r.language,
    passingScorePct: r.passing_score_pct,
    examQuestionCount: r.exam_question_count,
    unlockThresholdPct: r.unlock_threshold_pct,
    createdAt: r.created_at,
  };
}
function camelSegment(r: any) {
  return {
    id: r.id, num: r.num, slug: r.slug,
    titleAr: r.title_ar, titleEn: r.title_en,
    descriptionAr: r.description_ar, descriptionEn: r.description_en,
    durationSec: Number(r.duration_sec),
    vimeo: { introId: r.intro_vimeo_id, contentId: r.content_vimeo_id, outroId: r.outro_vimeo_id },
    introDurationSec: r.intro_duration_sec ? Number(r.intro_duration_sec) : null,
    outroDurationSec: r.outro_duration_sec ? Number(r.outro_duration_sec) : null,
    nextTitleAr: r.next_title_ar, nextTitleEn: r.next_title_en,
    quiz: r.quiz,
  };
}
