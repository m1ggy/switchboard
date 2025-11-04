// src/lib/push/push.ts
import { PushSubscriptionsRepository } from '@/db/repositories/push_subscriptions';
import type { PushSubscription } from 'web-push';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[push] Missing VAPID keys in env. Web Push will be disabled.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export type PushAction = { action: string; title: string; icon?: string };
export type PushPayload = {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  url?: string; // opened on click
  tag?: string; // collapse key
  actions?: PushAction[];
  data?: Record<string, unknown>; // extra data to pass to SW
};

/**
 * Send a push to a single PushSubscription.
 * Returns true if send succeeds, false if subscription is gone/stale (404/410).
 */
export async function sendPushToSubscription(
  subscription: PushSubscription,
  payload: PushPayload
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    const code = err?.statusCode;
    if (code === 404 || code === 410) {
      // subscription is no longer valid
      return false;
    }
    console.error('[push] send error', code, err?.message);
    return true; // don't delete sub on transient errors
  }
}

/**
 * Fan-out to all subscriptions of a user.
 * Automatically cleans up stale endpoints.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subs = await PushSubscriptionsRepository.getAllByUser(userId);
  if (subs.length === 0) return;

  const staleEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (rec) => {
      const sub: PushSubscription = {
        endpoint: rec.endpoint,
        keys: { p256dh: rec.p256dh, auth: rec.auth },
        expirationTime: rec.expirationTime ?? undefined,
      };
      const ok = await sendPushToSubscription(sub, payload);
      if (!ok) staleEndpoints.push(rec.endpoint);
    })
  );

  if (staleEndpoints.length) {
    await PushSubscriptionsRepository.deleteManyByEndpoints(staleEndpoints);
  }
}

/**
 * Optional: broadcast to many users (best-effort).
 */
export async function broadcastPushToUsers(
  userIds: string[],
  payload: PushPayload
) {
  const dedupEndpoints = new Set<string>();
  const subRecords = (
    await Promise.all(
      userIds.map((uid) => PushSubscriptionsRepository.getAllByUser(uid))
    )
  ).flat();

  const staleEndpoints: string[] = [];

  await Promise.all(
    subRecords.map(async (rec) => {
      if (dedupEndpoints.has(rec.endpoint)) return;
      dedupEndpoints.add(rec.endpoint);

      const sub: PushSubscription = {
        endpoint: rec.endpoint,
        keys: { p256dh: rec.p256dh, auth: rec.auth },
        expirationTime: rec.expirationTime ?? undefined,
      };
      const ok = await sendPushToSubscription(sub, payload);
      if (!ok) staleEndpoints.push(rec.endpoint);
    })
  );

  if (staleEndpoints.length) {
    await PushSubscriptionsRepository.deleteManyByEndpoints(staleEndpoints);
  }
}
