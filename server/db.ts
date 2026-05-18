import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from './env';

let _pool: Pool | undefined;
function defaultPool() {
  if (!_pool) _pool = new Pool({ connectionString: env.DATABASE_URL });
  return _pool;
}

export function makeDb(getPool: () => Pool = defaultPool) {
  return {
    pool: getPool,
    async q<R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<QueryResult<R>> {
      return getPool().query<R>(sql, params);
    },
    async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
      const c = await getPool().connect();
      try {
        await c.query('BEGIN');
        const out = await fn(c);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export const db = makeDb();
export type Db = ReturnType<typeof makeDb>;
