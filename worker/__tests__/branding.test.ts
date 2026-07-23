import { describe, it, expect, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { fetchBrandingForServer } from '../../shared/branding';
import { makeDb } from '../../server/db';

describe('fetchBrandingForServer', () => {
  let pool: Pool;
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query('TRUNCATE settings RESTART IDENTITY CASCADE');
  });

  it('decodes bytea (Buffer) cert background into a data URL', async () => {
    // 1x1 JPEG, just enough to prove the bytea -> base64 path works.
    const jpeg1x1 = Buffer.from(
      'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b0801000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fbfc0a28a2bfffd9',
      'hex',
    );
    await pool.query(
      `INSERT INTO settings (key, data, cert_bg_bytes, cert_bg_mime)
       VALUES ('branding', '{}'::jsonb, $1::bytea, 'image/jpeg')`,
      [jpeg1x1],
    );
    const b = await fetchBrandingForServer(makeDb(() => pool));
    expect(b.certBgDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    // Smoke check: payload after the prefix should be a non-empty base64 string.
    expect(b.certBgDataUrl!.length).toBeGreaterThan('data:image/jpeg;base64,'.length + 10);
  });

  it('returns null cert background when bytea is absent', async () => {
    await pool.query(
      `INSERT INTO settings (key, data) VALUES ('branding', '{}'::jsonb)`,
    );
    const b = await fetchBrandingForServer(makeDb(() => pool));
    expect(b.certBgDataUrl).toBeNull();
    expect(b.logoDataUrl).toBeNull();
  });

  it('applies layout defaults when data JSON is empty', async () => {
    await pool.query(
      `INSERT INTO settings (key, data) VALUES ('branding', '{}'::jsonb)`,
    );
    const b = await fetchBrandingForServer(makeDb(() => pool));
    expect(b.nameY).toBe(37);
    expect(b.serialY).toBe(96);
    expect(b.nameColor).toBe('#0f172a');
    expect(b.serialColor).toBe('#1e293b');
    expect(b.serialFontSize).toBe(20);
  });
});
