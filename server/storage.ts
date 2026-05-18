import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

export interface StorageOpts {
  endpoint: string; region: string; forcePathStyle: boolean;
  bucket: string; accessKey: string; secretKey: string;
}

export function makeStorage(opts: StorageOpts) {
  const client = new S3Client({
    endpoint: opts.endpoint,
    region: opts.region,
    forcePathStyle: opts.forcePathStyle,
    credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
  });
  return {
    client,
    bucket: opts.bucket,
    async put(key: string, body: Buffer, contentType: string) {
      await client.send(new PutObjectCommand({
        Bucket: opts.bucket, Key: key, Body: body, ContentType: contentType,
      }));
    },
    async presignedGet(key: string, ttlSeconds = 60 * 60) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: opts.bucket, Key: key,
      }), { expiresIn: ttlSeconds });
    },
  };
}

export const storage = makeStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  bucket: env.S3_BUCKET,
  accessKey: env.S3_ACCESS_KEY,
  secretKey: env.S3_SECRET_KEY,
});

export type Storage = ReturnType<typeof makeStorage>;
