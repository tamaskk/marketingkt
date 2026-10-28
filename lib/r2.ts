import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const MAX_SIZE = 100 * 1024 * 1024;

export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

let client: S3Client | undefined;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Hiányzó környezeti változó: ${name}`);
  return value;
}

export const bucket = () => env("R2_BUCKET");

// Lazy, so a missing env var fails the request, not the build.
export function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
    // R2 rejects the default CRC32 checksum params on presigned URLs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}
