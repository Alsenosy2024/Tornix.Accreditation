import express, { type Express } from "express";
import { Pool } from "pg";
import { makeDb } from "./db.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { coursesRouter } from "./routes/courses.js";
import { settingsBrandingRouter } from "./routes/settings-branding.js";
import { assessmentsRouter } from "./routes/assessments.js";
import { assessmentCertRouter } from "./routes/assessment-cert.js";
import { segmentedCoursesRouter } from "./routes/segmented-courses.js";
import { progressRouter } from "./routes/progress.js";
import { transcriptRouter } from "./routes/transcript.js";
import { sendEmailRouter } from "./routes/send-email.js";
import { storage } from "./storage.js";

export interface BuildAppOpts {
  poolOverride?: Pool;
  publicBaseUrl?: string;
}

export function buildApp(opts: BuildAppOpts = {}): Express {
  const pool = opts.poolOverride ?? new Pool({ connectionString: process.env.DATABASE_URL });
  const db = makeDb(() => pool);
  const publicBaseUrl = opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", healthRouter({ db: pool }));
  app.use(authRouter({ db, publicBaseUrl }));
  app.use(meRouter({ db }));
  app.use(coursesRouter({ db }));
  app.use(settingsBrandingRouter({ db }));
  app.use(assessmentsRouter({ db }));
  app.use(assessmentCertRouter({ db, storage }));
  app.use(segmentedCoursesRouter({ db }));
  app.use(progressRouter({ db }));
  app.use(transcriptRouter({}));
  app.use(sendEmailRouter({}));
  return app;
}

// Path-with-spaces-safe entry-point detection (preserves the Task 2 fix).
function isEntryPoint(): boolean {
  try {
    return import.meta.url === `file://${encodeURI(process.argv[1]).replace(/%2F/gi, "/")}`;
  } catch { return false; }
}
if (isEntryPoint()) {
  const { env } = await import("./env.js");
  const app = buildApp();
  app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
}
