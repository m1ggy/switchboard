// lib/getMimeType.ts
import path from 'path';
import { extension, lookup } from 'mime-types';

/**
 * Returns the MIME type for a given filename.
 * Falls back to 'application/octet-stream' if unknown.
 */
export function getMimeType(filename: string): string {
  // mime-types maps .mp4 to application/mp4; treat it as video like browsers do.
  if (path.extname(filename).toLowerCase() === '.mp4') return 'video/mp4';
  return lookup(filename) || 'application/octet-stream';
}

/**
 * Returns a file extension (without dot) for a MIME type, e.g. "text/x-vcard" -> "vcf".
 */
export function getExtensionForMime(contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  if (base === 'video/quicktime') return 'mov';
  return extension(base) || 'bin';
}
