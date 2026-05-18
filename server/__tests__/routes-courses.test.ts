import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { buildApp } from "../index";
import { signSession } from "../auth";

process.env.JWT_SECRET = "a".repeat(64);

async function admin() {
  return signSession({ userId: "1", email: "admin@x", name: null, picture: null, isAdmin: true });
}
async function user() {
  return signSession({ userId: "2", email: "u@x", name: null, picture: null, isAdmin: false });
}

describe("routes/courses", () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query("TRUNCATE courses, users RESTART IDENTITY CASCADE");
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'admin@x', true), (2, 'u@x', false)`);
    await pool.query(`INSERT INTO courses (title, chapters) VALUES ('TCP', '[]'::jsonb)`);
  });

  it("GET /api/courses requires auth", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get("/api/courses");
    expect(r.status).toBe(401);
  });

  it("GET /api/courses returns rows for any authed user", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get("/api/courses").set("Authorization", `Bearer ${await user()}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].title).toBe("TCP");
  });

  it("POST /api/courses rejects non-admin", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).post("/api/courses")
      .set("Authorization", `Bearer ${await user()}`)
      .send({ title: "New", chapters: [] });
    expect(r.status).toBe(403);
  });

  it("POST /api/courses creates a course for admin", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).post("/api/courses")
      .set("Authorization", `Bearer ${await admin()}`)
      .send({ title: "New", video_url: "https://v", chapters: [] });
    expect(r.status).toBe(200);
    expect(r.body.title).toBe("New");
  });

  it("DELETE /api/courses/:id admin only", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).delete("/api/courses/1").set("Authorization", `Bearer ${await admin()}`);
    expect(r.status).toBe(204);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM courses");
    expect(rows[0].n).toBe(0);
  });

  it('PUT /api/courses/:id returns 400 for non-numeric id', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).put('/api/courses/foo')
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ title: 'X', chapters: [] });
    expect(r.status).toBe(400);
  });

  it('DELETE /api/courses/:id returns 400 for non-numeric id', async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).delete('/api/courses/foo')
      .set('Authorization', `Bearer ${await admin()}`);
    expect(r.status).toBe(400);
  });
});
