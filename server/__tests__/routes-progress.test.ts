import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { buildApp } from '../index';
import { signSession } from '../auth';

process.env.JWT_SECRET = 'a'.repeat(64);

async function user(id = 2) {
  return signSession({ userId: String(id), email: `u${id}@x`, name: null, picture: null, isAdmin: false });
}

describe('routes/progress', () => {
  let pool: Pool;
  let segmentId: number;

  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(
      'TRUNCATE segment_progress, course_segments, segmented_courses, users RESTART IDENTITY CASCADE',
    );
    await pool.query(
      `INSERT INTO users (id, email, is_admin) VALUES (1, 'admin@x', true), (2, 'u2@x', false)`,
    );
    // Insert without explicit IDs to avoid sequence confusion.
    const { rows: cRows } = await pool.query(
      `INSERT INTO segmented_courses (slug, title_ar, title_en) VALUES ('tcp', 'دورة TCP', 'TCP Course') RETURNING id`,
    );
    const courseId = cRows[0].id;
    const { rows: sRows } = await pool.query(
      `INSERT INTO course_segments (course_id, num, slug, title_ar, title_en)
       VALUES ($1, 1, 'tcp-01', 'الجزء 1', 'Part 1') RETURNING id`,
      [courseId],
    );
    segmentId = Number(sRows[0].id);
  });

  it('GET /api/progress/:courseSlug returns 401 without auth', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get('/api/progress/tcp');
    expect(r.status).toBe(401);
  });

  it('GET /api/progress/:courseSlug returns empty array when no progress', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .get('/api/progress/tcp')
      .set('Authorization', `Bearer ${await user()}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('POST /api/progress upserts a progress row', async () => {
    const app = buildApp({ poolOverride: pool });
    const tok = await user();
    const r = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${tok}`)
      .send({ segmentId, clipKind: 'content', positionSec: 42 });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /api/progress/:courseSlug returns progress after upsert', async () => {
    const app = buildApp({ poolOverride: pool });
    const tok = await user();
    await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${tok}`)
      .send({ segmentId, clipKind: 'intro', positionSec: 10 });

    const r = await request(app)
      .get('/api/progress/tcp')
      .set('Authorization', `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(Number(r.body[0].segmentId)).toBe(segmentId);
    expect(r.body[0].clipKind).toBe('intro');
    expect(r.body[0].positionSec).toBe(10);
  });

  it('POST /api/progress returns 400 on invalid clipKind', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app)
      .post('/api/progress')
      .set('Authorization', `Bearer ${await user()}`)
      .send({ segmentId, clipKind: 'bad', positionSec: 5 });
    expect(r.status).toBe(400);
  });
});
