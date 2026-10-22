/* CommGrok service worker */
const VERSION = "v2";
const STATIC_CACHE = `commgrok-static-${VERSION}`;
const PAGES_CACHE = `commgrok-pages-${VERSION}`;
const DATA_CACHE = `commgrok-data-${VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE, DATA_CACHE];
const MAX_EVENT_PAGES = 15;

const PRECACHE_PAGES = ["/", "/offline"];
const PRECACHE_STATIC = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
];

async function addEach(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(
    urls.map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {
        /* ignore single failures so install still succeeds */
      })
    )
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      addEach(PAGES_CACHE, PRECACHE_PAGES),
      addEach(STATIC_CACHE, PRECACHE_STATIC),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => (key.startsWith("commons-") || key.startsWith("commgrok-")) && !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isEventPage(pathname) {
  return pathname.startsWith("/e/") && !pathname.endsWith("/ics");
}

async function trimEventPages() {
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  const eventKeys = keys.filter((req) => isEventPage(new URL(req.url).pathname));
  const excess = eventKeys.length - MAX_EVENT_PAGES;
  if (excess > 0) {
    // cache.keys() returns insertion order — oldest first
    await Promise.all(eventKeys.slice(0, excess).map((req) => cache.delete(req)));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

async function networkFirstNavigation(request, url) {
  try {
    const response = await fetch(request);
    if (response && response.ok && (url.pathname === "/" || isEventPage(url.pathname))) {
      const copy = response.clone();
      const cache = await caches.open(PAGES_CACHE);
      // Re-insert so it moves to the end (most recent) for trimming
      await cache.delete(request, { ignoreSearch: url.pathname === "/" });
      await cache.put(request, copy);
      if (isEventPage(url.pathname)) trimEventPages().catch(() => {});
    }
    return response;
  } catch (err) {
    const cache = await caches.open(PAGES_CACHE);
    const cached =
      (await cache.match(request, { ignoreSearch: url.pathname === "/" })) ||
      (await caches.match(request, { ignoreSearch: url.pathname === "/" }));
    if (cached) return cached;
    const offline = (await cache.match("/offline")) || (await caches.match("/offline"));
    if (offline) return offline;
    return new Response("You're offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function networkFirstData(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(DATA_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: network only
  if (url.pathname.startsWith("/api/")) return;

  // RSC / prefetch requests: let them fail normally so Next falls back to full navigation
  if (
    request.headers.get("RSC") ||
    request.headers.get("Next-Router-Prefetch") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }

  // Static assets: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/covers/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Calendar feeds: network-first with cache fallback
  if (
    url.pathname === "/calendar.ics" ||
    (url.pathname.startsWith("/e/") && url.pathname.endsWith("/ics"))
  ) {
    event.respondWith(networkFirstData(request));
    return;
  }

  // Navigations: network-first, fallback to cache, then /offline
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request, url));
    return;
  }
});
