import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from 'api/trpc';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const trpc = createTRPCReact<AppRouter>();

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0 || isNaN(totalSeconds)) return '0 Seconds';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} Hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} Minute${minutes !== 1 ? 's' : ''}`);
  if (seconds > 0 || parts.length === 0)
    parts.push(`${seconds} Second${seconds !== 1 ? 's' : ''}`);

  return parts.join(' ');
}
