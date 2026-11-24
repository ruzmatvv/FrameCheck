// Service worker: the page opens offline from the last copy, and game covers are kept for next time.
// Account, sync and other /api requests always go to the network and are never stored.
const VERSION = "__VERSION__";
const PAGES = "framecheck-pages-" + VERSION;
const IMAGES = "framecheck-images-v1";
const MAX_IMAGES = 400;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(PAGES).then(cache => cache.add(new Request("/", {cache: "reload"}))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("framecheck-pages-") && key !== PAGES).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request)
          .then(response => { if (response.ok && url.pathname === "/") { const copy = response.clone(); caches.open(PAGES).then(cache => cache.put("/", copy)); } return response; })
          .catch(() => caches.match("/").then(hit => hit || Response.error()))
      );
    } else if (url.pathname.startsWith("/img/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request));
    }
    return;
  }
  if (request.destination === "image" && /(^|\.)steamstatic\.com$/.test(url.hostname)) event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") { cache.put(request, response.clone()); trim(cache); }
    return response;
  } catch {
    return Response.error();
  }
}

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(key => cache.delete(key)));
}
