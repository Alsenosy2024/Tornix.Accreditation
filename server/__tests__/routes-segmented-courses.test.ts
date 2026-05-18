import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

async function admin() {
  return signSession({ userId: '1', email: 'admin@x', name: null, picture: null, isAdmin: true });
}
async function user() {
  return signSession({ userId: '2', email: 'u@x', name: null, picture: null, isAdmin: false });
}

describe('routes/segmented-courses', () => {
  let pool: Pool;
  let segmentId: number;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(
      'TRUNCATE segment_progress, course_segments, segmented_courses, users RESTART IDENTITY CASCADE',
    );
    await pool.query(
      `INSERT INTO users (id, email, is_admin) VALUES (1, 'admin@x', true), (2, 'u@x', false)`,
    );
    // Insert without explicit id so the sequence is not confused.
    const { rows: cRows } = await pool.query(
      `INSERT INTO segmented_courses (slug, title_ar, title_en) VALUES ('tcp', 'دورة TCP', 'TCP Course') RETURNING id`,
    );
    const courseId = cRows[0].id;
    const { rows: sRows } = await pool.query(
      `INSERT INTO course_segments (course_id, num, slug, title_ar, title_en)
       VALUES ($1, 1, 'tcp-01', 'الجزء 1', 'Part 1') RETURNING id`,
      [courseId],
    );
    segmentId = sRows[0].id;
  });

  it('GET /api/segmented-courses returns the course list (no auth required)', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/segmented-courses');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].slug).toBe('tcp');
    expect(r.body[0].titleAr).toBe('دورة TCP');
    expect(r.body[0].titleEn).toBe('TCP Course');
  });

  it('GET /api/segmented-courses/:slug returns course + segments', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/segmented-courses/tcp');
    expect(r.status).toBe(200);
    expect(r.body.course.slug).toBe('tcp');
    expect(r.body.segments).toHaveLength(1);
    expect(r.body.segments[0].slug).toBe('tcp-01');
    expect(typeof r.body.segments[0].durationSec).toBe('number');
    expect(r.body.segments[0].vimeo).toBeDefined();
  });

  it('GET /api/segmented-courses/:slug returns 404 for unknown slug', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/segmented-courses/does-not-exist');
    expect(r.status).toBe(404);
  });

  it('POST /api/segmented-courses rejects non-admin with 403', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/segmented-courses')
      .set('Authorization', `Bearer ${await user()}`)
      .send({ slug: 'new', titleAr: 'جديد', titleEn: 'New' });
    expect(r.status).toBe(403);
  });

  it('POST /api/segmented-courses creates course for admin', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/segmented-courses')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ slug: 'new-course', titleAr: 'دورة جديدة', titleEn: 'New Course' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBeDefined();
  });

  it('POST /api/segmented-courses returns 400 when required fields missing', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/segmented-courses')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ slug: 'x' }); // missing titleAr/titleEn
    expect(r.status).toBe(400);
  });
});
