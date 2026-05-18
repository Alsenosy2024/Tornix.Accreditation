import express, { type Express } from 'express';
import { healthRouter } from './routes/health';

export function buildApp(opts: { skipDbCheck?: boolean; skipStorageCheck?: boolean } = {}): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', healthRouter({}));
  return app;
}

if (import.meta.url === `file://${encodeURI(process.argv[1]).replace(/%2F/gi, '/')}`) {
  const { env } = await import('./env');
  const app = buildApp();
  app.listen(env.PORT, () => console.log(`[server] listening on :${env.PORT}`));
}
