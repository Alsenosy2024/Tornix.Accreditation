import type { Db } from "./db.js";

/** Insert a pending cert_jobs row unless one is already pending or running for this assessment. */
export async function enqueueCertJob(db: Db, assessmentId: number): Promise<void> {
  await db.q(
    `INSERT INTO cert_jobs (assessment_id)
     SELECT $1
     WHERE NOT EXISTS (
       SELECT 1 FROM cert_jobs
       WHERE assessment_id = $1 AND status IN ('pending', 'running')
     )`,
    [assessmentId],
  );
}
