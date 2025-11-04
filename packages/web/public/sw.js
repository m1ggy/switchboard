// sw.js
const CACHE_NAME = "app-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

// Only cache HTTP(S). Skip chrome-extension, ws, data, etc.
const isHttp = (urlStr) => {
  try {
    const u = new URL(urlStr);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET + http(s)
  if (req.method !== "GET" || !isHttp(req.url)) return;

  // Avoid caching Vite HMR and similar dev endpoints
  const url = new URL(req.url);
  if (url.pathname.startsWith("/@vite") || url.pathname.startsWith("/vite")) {
    return; // let the network handle it
  }

  // Navigation requests: network-first -> fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first, then network and populate cache
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // Only cache successful, basic/opaque HTTP(S) responses
          if (res && (res.type === "basic" || res.type === "opaque") && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit) // last-resort (usually null)
    })
  );
});

/* ========================================================================== */
/*                            PUSH NOTIFICATIONS                               */
/* ========================================================================== */

/**
 * Expected push payload (JSON), e.g.:
 * {
 *   "title": "New message",
 *   "body": "You have a new message",
 *   "icon": "/icons/icon-192.png",
 *   "badge": "/icons/icon-192.png",
 *   "url": "/dashboard/inbox/123",
 *   "tag": "inbox",
 *   "actions": [{ "action": "open", "title": "Open" }]
 * }
 *
 * Fallback: if payload is plain text, it's used as the notification body.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
      // Prefer JSON payloads
      data = event.data.json();
    }
  } catch (err) {
    // Some services may send text payloads
    data = { title: "Notification", body: event.data && event.data.text() };
  }

  const title = data.title || "Notification";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag, // Use a tag to collapse similar notifications if desired
    // Store useful data for click handling
    data: {
      url: data.url || "/", // Where to navigate on click
      // Keep original payload for debugging / advanced routing if needed
      _payload: data,
    },
    actions: Array.isArray(data.actions) ? data.actions : [],
    // On Android, requireInteraction keeps the notification until the user interacts
    // requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Try to focus an existing client with a URL that matches the target path.
 * If none found, open a new window.
 */
async function openOrFocusUrl(targetUrl) {
  const origin = self.location.origin;
  const absoluteUrl = new URL(targetUrl, origin).toString();

  const clientsArr = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Try focus an existing visible client first
  for (const client of clientsArr) {
    // Normalize both URLs (ignore search/hash differences if you prefer)
    if (client.url === absoluteUrl && "focus" in client) {
      await client.focus();
      return;
    }
  }

  // Otherwise, open a new client window
  if (self.clients.openWindow) {
    await self.clients.openWindow(absoluteUrl);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Support action buttons if you added them in the payload
  const action = event.action;
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) || "/";

  // You can route differently depending on action
  // e.g., if (action === 'reply') { ... }
  event.waitUntil(openOrFocusUrl(targetUrl));
});

// (Optional) Handle notification close analytics
self.addEventListener("notificationclose", (event) => {
  // You could send a beacon for analytics here using event.notification.data
  // e.g., navigator.sendBeacon('/api/notify/closed', JSON.stringify(...))
});

/**
 * (Optional) pushsubscriptionchange:
 * If you want to automatically re-subscribe when the browser rotates the
 * subscription (rare), you can listen here and message clients to refresh.
 * We don't auto-subscribe here because it requires your VAPID public key.
 */
// self.addEventListener("pushsubscriptionchange", async (event) => {
//   // Example: notify clients to re-initiate subscription flow
//   const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
//   for (const client of allClients) {
//     client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGE" });
//   }
// });
