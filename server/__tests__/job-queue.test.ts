import { describe, it, expect, beforeEach } from "vitest";
import { Pool } from "pg";
import { makeDb } from "../db";
import { enqueueCertJob } from "../job-queue";

describe("enqueueCertJob", () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(
      "TRUNCATE cert_jobs, assessments, users RESTART IDENTITY CASCADE"
    );
    await pool.query(`INSERT INTO users (id, email) VALUES (1, 'u@x')`);
    await pool.query(
      `INSERT INTO assessments (id, user_id, user_email, score, status, answers)
                      VALUES (10, 1, 'u@x', 80, 'Passed', '[]'::jsonb)`
    );
  });

  it("inserts a pending row", async () => {
    const db = makeDb(() => pool);
    await enqueueCertJob(db, 10);
    const { rows } = await pool.query(
      `SELECT assessment_id, status FROM cert_jobs`
    );
    expect(rows).toEqual([{ assessment_id: "10", status: "pending" }]);
  });

  it("is idempotent for the same assessment when one is already pending", async () => {
    const db = makeDb(() => pool);
    await enqueueCertJob(db, 10);
    await enqueueCertJob(db, 10);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM cert_jobs WHERE assessment_id=10 AND status='pending'`
    );
    expect(rows[0].n).toBe(1);
  });
});
