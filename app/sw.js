// Offline support. Serves the cached app instantly, then refreshes the cache from
// the network in the background, so updates show up on the next launch.
// Bump CACHE when the list of files changes, or to force everyone onto a new version.
//
// Network fetches use cache: "no-cache" so they revalidate with the server instead of
// reusing the browser's HTTP cache (GitHub Pages allows 10 minutes), which would
// otherwise store stale files under a new CACHE name.

const CACHE = "workout-app-v3";
const ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "css/styles.css",
  "js/storage.js",
  "js/app.js",
  "data/program.js",
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

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
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
