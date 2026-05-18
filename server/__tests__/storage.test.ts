import { describe, it, expect } from 'vitest';
import { makeStorage } from '../storage';

describe('storage', () => {
  const s = makeStorage({
    endpoint: 'http://127.0.0.1:9100',
    region: 'us-east-1',
    forcePathStyle: true,
    bucket: 'certificates',
    accessKey: 'tornixdev',
    secretKey: 'tornixdev_secret',
  });

  it('round-trips a buffer and returns a presigned URL', async () => {
    const path = `__test__/${Date.now()}.txt`;
    const body = Buffer.from('hello tornix', 'utf8');
    await s.put(path, body, 'text/plain');

    const url = await s.presignedGet(path, 30);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:9100\/certificates\/__test__\//);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello tornix');
  });
});
