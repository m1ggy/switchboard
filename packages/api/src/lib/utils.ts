// lib/getMimeType.ts
import { lookup } from 'mime-types';

/**
 * Returns the MIME type for a given filename.
 * Falls back to 'application/octet-stream' if unknown.
 */
export function getMimeType(filename: string): string {
  return lookup(filename) || 'application/octet-stream';
}
