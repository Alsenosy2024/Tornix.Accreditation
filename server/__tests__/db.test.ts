import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { makeDb } from '../db';

describe('db.q', () => {
  let pool: Pool;
  const db = makeDb(() => pool);

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });
  afterAll(async () => { await pool.end(); });

  it('runs a simple SELECT', async () => {
    const { rows } = await db.q<{ n: number }>('SELECT 1::int AS n');
    expect(rows[0].n).toBe(1);
  });

  it('parameterizes safely', async () => {
    const { rows } = await db.q<{ x: string }>('SELECT $1::text AS x', ['hi']);
    expect(rows[0].x).toBe('hi');
  });

  it('runs a transaction with rollback on throw', async () => {
    await db.q('CREATE TEMP TABLE t (n int)');
    await expect(db.tx(async (c) => {
      await c.query('INSERT INTO t VALUES (1)');
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const { rows } = await db.q<{ n: number }>('SELECT count(*)::int AS n FROM t');
    expect(rows[0].n).toBe(0);
  });
});
