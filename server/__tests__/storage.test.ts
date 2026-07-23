import { describe, it, expect } from 'vitest';
import dotenv from 'dotenv';
import { makeStorage } from '../storage';

dotenv.config({ path: '.env.local' });

describe('storage', () => {
  const s = makeStorage({
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: true,
    bucket: process.env.S3_BUCKET || 'certificates',
    accessKey: process.env.S3_ACCESS_KEY || 'tornixdev',
    secretKey: process.env.S3_SECRET_KEY || 'tornixdev_secret',
  });

  it('round-trips a buffer and returns a presigned URL', async () => {
    const path = `__test__/${Date.now()}.txt`;
    const body = Buffer.from('hello tornix', 'utf8');
    await s.put(path, body, 'text/plain');

    const url = await s.presignedGet(path, 30);
    expect(url).toMatch(/\/certificates\/__test__\//);   // accept both 9000 and 9100

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello tornix');
  });
});
