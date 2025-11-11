// sw.js
const CACHE_NAME = "app-shell-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/calliya-logo.png",
];

// Only cache http(s) requests
const isHttp = (urlStr) => {
  try {
    const u = new URL(urlStr);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/* --------------------------- Message: skipWaiting --------------------------- */
// Let the page activate the new SW on demand (after showing an Update button)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* -------------------------------- Install --------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // DO NOT auto-activate: we want a user-driven update flow
  // self.skipWaiting();
});

/* -------------------------------- Activate -------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup old caches
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));

      // Speed up first navigation while SW warms up
      if ("navigationPreload" in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {}
      }
    })()
  );

  // Start controlling existing clients ASAP
  self.clients.claim();
});

/* --------------------------------- Fetch ---------------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET http(s)
  if (req.method !== "GET" || !isHttp(req.url)) return;

  const url = new URL(req.url);

  // Ignore dev endpoints like Vite HMR
  if (url.pathname.startsWith("/@vite") || url.pathname.startsWith("/vite")) return;

  // ---- Navigation requests (SPA): network/preload first, fallback to index.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // 1) Use any preloaded navigation response (fastest)
          const preloaded =
            "navigationPreload" in self.registration ? await event.preloadResponse : null;
          if (preloaded) {
            caches.open(CACHE_NAME).then((c) => c.put(req, preloaded.clone())).catch(() => {});
            return preloaded;
          }

          // 2) Network
          const netRes = await fetch(req);
          if (netRes && netRes.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(req, netRes.clone())).catch(() => {});
            return netRes;
          }

          // 3) Fallback (works for /calls, /?action=online, etc.)
          return await caches.match("/index.html", { ignoreSearch: true });
        } catch {
          // Offline or network error → SPA fallback
          return await caches.match("/index.html", { ignoreSearch: true });
        }
      })()
    );
    return;
  }

  // ---- Static & other assets: cache-first, then network; populate cache on success
  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;

      try {
        const res = await fetch(req);
        if (res && res.ok && (res.type === "basic" || res.type === "opaque")) {
          caches.open(CACHE_NAME).then((c) => c.put(req, res.clone())).catch(() => {});
        }
        return res;
      } catch {
        // last resort: give cached hit if any (usually null)
        return hit || Response.error();
      }
    })()
  );
});

/* ========================================================================== */
/*                            PUSH NOTIFICATIONS                               */
/* ========================================================================== */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    data = { title: "Notification", body: event.data && event.data.text() };
  }

  const title = data.title || "Notification";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/", _payload: data },
    actions: Array.isArray(data.actions) ? data.actions : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

async function openOrFocusUrl(targetUrl) {
  const absoluteUrl = new URL(targetUrl, self.location.origin).toString();
  const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  // Prefer focusing any same-origin client, then navigate it
  for (const client of clientsArr) {
    if (client.url.startsWith(self.location.origin) && "focus" in client) {
      await client.focus();
      try {
        await client.navigate(absoluteUrl);
      } catch {}
      return;
    }
  }

  // No existing window → open a new one
  if (self.clients.openWindow) {
    await self.clients.openWindow(absoluteUrl);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(openOrFocusUrl(targetUrl));
});

self.addEventListener("notificationclose", () => {
  // optional: analytics
});

// Optional: react to subscription rotation
// self.addEventListener("pushsubscriptionchange", async () => {
//   const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
//   for (const client of clientsArr) client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGE" });
// });
