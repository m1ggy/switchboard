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
    caches.keys().then((keys) =>
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
