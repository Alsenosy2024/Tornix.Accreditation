function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3000', 10),
  PUBLIC_BASE_URL: req('PUBLIC_BASE_URL'),
  DATABASE_URL: req('DATABASE_URL'),
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
  GOOGLE_CLIENT_ID: req('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: req('GOOGLE_CLIENT_SECRET'),
  JWT_SECRET: req('JWT_SECRET'),
  S3_ENDPOINT: req('S3_ENDPOINT'),
  S3_REGION: req('S3_REGION'),
  S3_ACCESS_KEY: req('S3_ACCESS_KEY'),
  S3_SECRET_KEY: req('S3_SECRET_KEY'),
  S3_BUCKET: req('S3_BUCKET'),
  S3_FORCE_PATH_STYLE: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  VIMEO_ACCESS_TOKEN: process.env.VIMEO_ACCESS_TOKEN ?? '',
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
};
