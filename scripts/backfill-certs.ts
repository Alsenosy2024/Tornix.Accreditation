import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const { rows } = await pool.query<{ id: number }>(`
    SELECT a.id::int AS id FROM assessments a
    WHERE a.score >= 60 AND a.cert_storage_path IS NULL
    ORDER BY a.id
  `);
  console.log(`backfill: ${rows.length} assessments need certs`);

  for (const { id } of rows) {
    await pool.query(
      `INSERT INTO cert_jobs (assessment_id)
       SELECT $1 WHERE NOT EXISTS (
         SELECT 1 FROM cert_jobs WHERE assessment_id=$1 AND status IN ('pending','running')
       )`,
      [id],
    );
    console.log(`enqueued cert_job for assessment ${id}`);
  }
  await pool.end();
  console.log('backfill done. worker will render in the background.');
}

main().catch((e) => { console.error(e); process.exit(1); });
