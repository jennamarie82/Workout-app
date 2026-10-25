// Offline support. Serves the cached app instantly, then refreshes the cache from
// the network in the background, so updates show up on the next launch.
//
// VERSION must match the ?v= on the script/style tags in index.html — bump both
// together with `python3 tools/bump_version.py` whenever an app file changes.
// The versioned URLs stop GitHub Pages' CDN (10-minute cache per URL) from handing
// out a mix of old and new files, and each version gets its own cache.

const VERSION = 4;
const CACHE = `workout-app-v${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  `css/styles.css?v=${VERSION}`,
  `data/program.js?v=${VERSION}`,
  `js/storage.js?v=${VERSION}`,
  `js/app.js?v=${VERSION}`,
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "no-cache" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Pages may carry a query string; versioned assets must match exactly.
  const match = caches.match(req, { ignoreSearch: req.mode === "navigate" });
  event.respondWith(
    match.then((cached) => {
      // Fetch by URL: a navigation Request can't be re-issued with different options.
      const network = fetch(req.url, { cache: "no-cache" })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      if (cached) event.waitUntil(network);
      return cached || network;
    })
  );
});
