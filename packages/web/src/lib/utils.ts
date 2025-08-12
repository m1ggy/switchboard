import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from 'api/trpc';
import { clsx, type ClassValue } from 'clsx';
import { intervalToDuration } from 'date-fns';
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

export function formatDurationWithDateFns(seconds: number) {
  const duration = intervalToDuration({
    start: 0,
    end: seconds * 1000, // convert to ms
  });

  const { hours, minutes, seconds: secs } = duration;

  const hrStr = hours ? `${hours}h ` : '';
  const minStr = minutes ? `${minutes}m ` : '';
  const secStr = secs ? `${secs}s` : '0s';

  return `${hrStr}${minStr}${secStr}`.trim();
}

// --- Types from your features list ---
export const FEATURES = {
  support_email_basic: 'Email Support',
  support_email_priority: 'Priority Email Support',
  support_dedicated: 'Dedicated Support',
  mms: 'MMS Messaging',
  fax: 'Fax Support',
  video_calls: 'Video Calls',
} as const;

export type FeatureKey = keyof typeof FEATURES;

// --- Plans & feature mapping ---
export type PlanName = 'starter' | 'professional' | 'business';

export const PLAN_FEATURES: Record<PlanName, readonly FeatureKey[]> = {
  starter: ['support_email_basic'],
  professional: ['support_email_priority', 'mms'],
  business: ['support_dedicated', 'mms', 'fax'],
} as const;

// --- Quick helpers ---
export const hasFeature = (plan: PlanName, feature: FeatureKey): boolean =>
  PLAN_FEATURES[plan].includes(feature);

export const getFeaturesForPlan = (plan: PlanName): readonly FeatureKey[] =>
  PLAN_FEATURES[plan];

export const getPlansWithFeature = (feature: FeatureKey): PlanName[] =>
  (Object.keys(PLAN_FEATURES) as PlanName[]).filter((p) =>
    PLAN_FEATURES[p].includes(feature)
  );

// --- (Optional) pretty-print helpers ---
export const getFeatureLabel = (feature: FeatureKey) => FEATURES[feature];

export const listLabeledFeatures = (plan: PlanName): string[] =>
  PLAN_FEATURES[plan].map(getFeatureLabel);
