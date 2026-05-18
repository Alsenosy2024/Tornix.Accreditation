import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../index';

describe('GET /api/health', () => {
  it('returns 200 with ok: true', async () => {
    const app = buildApp({ skipDbCheck: true, skipStorageCheck: true });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });
});
