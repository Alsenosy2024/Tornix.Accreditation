import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { buildApp } from "../index";
import { signSession } from "../auth";

process.env.JWT_SECRET = "a".repeat(64);

describe("routes/settings-branding", () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query("TRUNCATE settings, users RESTART IDENTITY CASCADE");
    await pool.query(`INSERT INTO users (id, email, is_admin) VALUES (1, 'a@x', true), (2, 'u@x', false)`);
    await pool.query(`INSERT INTO settings (key, data, logo_bytes, logo_mime)
                      VALUES ('branding', $1::jsonb, decode('48656c6c6f', 'hex'), 'image/png')`,
                     [JSON.stringify({ nameY: 44, nameColor: "#000" })]);
  });

  it("GET /api/settings/branding is public, returns base64 bytea", async () => {
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).get("/api/settings/branding");
    expect(r.status).toBe(200);
    expect(r.body.data.nameY).toBe(44);
    expect(r.body.logo_b64).toBe(Buffer.from("Hello").toString("base64"));
    expect(r.body.logo_mime).toBe("image/png");
  });

  it("PATCH /api/settings/branding rejects non-admin", async () => {
    const t = await signSession({ userId: "2", email: "u@x", name: null, picture: null, isAdmin: false });
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).patch("/api/settings/branding")
      .set("Authorization", `Bearer ${t}`).send({ data: { nameY: 50 } });
    expect(r.status).toBe(403);
  });

  it("PATCH /api/settings/branding merges JSONB for admin", async () => {
    const t = await signSession({ userId: "1", email: "a@x", name: null, picture: null, isAdmin: true });
    const app = buildApp({ poolOverride: pool });
    const r = await request(app).patch("/api/settings/branding")
      .set("Authorization", `Bearer ${t}`).send({ data: { nameY: 50 } });
    expect(r.status).toBe(200);
    expect(r.body.data.nameY).toBe(50);
    expect(r.body.data.nameColor).toBe("#000");
  });
});
