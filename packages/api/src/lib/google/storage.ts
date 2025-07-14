import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import path from 'path';
import { getMimeType } from '../utils';

config();

// Auth using a custom env var
const storage = new Storage({
  keyFilename: process.env.ATTACHMENT_GCS_KEY_PATH,
});

const BUCKET_NAME = process.env.ATTACHMENT_GCS_BUCKET as string;

function getBucket() {
  return storage.bucket(BUCKET_NAME);
}

/**
 * Upload a local file to GCS, make it public, and return the public URL.
 */
export async function uploadAttachment(localFilePath: string): Promise<string> {
  const bucket = getBucket();

  const originalName = path.basename(localFilePath);
  const extension = path.extname(originalName);
  const uniqueName = `${randomUUID()}${extension}`;

  await bucket.upload(localFilePath, {
    destination: uniqueName,
    public: true,
  });

  // Optional: delete local file after upload
  // await fs.unlink(localFilePath);

  return getPublicUrl(uniqueName);
}

/**
 * Get the public URL of a file in the bucket.
 */
export function getPublicUrl(fileName: string): string {
  return `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;
}

export async function uploadAttachmentBuffer(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const bucket = getBucket();
  const ext = path.extname(originalName);
  const uniqueName = `${randomUUID()}${ext}`;
  const file = bucket.file(uniqueName);

  await file.save(buffer, {
    resumable: false,
    contentType: getMimeType(originalName),
    predefinedAcl: 'publicRead', // Makes it publicly accessible
  });

  return `https://storage.googleapis.com/${BUCKET_NAME}/${uniqueName}`;
}
