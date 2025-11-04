import { isPushSupported, ensureNotificationPermission, getOrCreateSubscription, unsubscribePush } from "../lib/pwa-client";


const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export async function enablePush() {
  if (!isPushSupported()) return alert("Push not supported in this browser.");
  const perm = await ensureNotificationPermission();
  if (perm !== "granted") return;

  const sub = await getOrCreateSubscription(VAPID);
  const json = sub.toJSON();

  await trpc.notifications.subscribePush.mutate({
    endpoint: json.endpoint!,
    expirationTime: (json as any).expirationTime ?? null,
    keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
  });

  alert("Push enabled");
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  await trpc.notifications.unsubscribePush.mutate({ endpoint: sub.endpoint });
  await unsubscribePush();
  alert("Push disabled");
}
