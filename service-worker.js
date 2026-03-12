const CACHE_NAME = "glp-cache-v5";
const APP_SHELL_PATHS = [
  "",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "data/gear.json",
  "data/program.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const scopeUrl = new URL(self.registration.scope);
      const requests = APP_SHELL_PATHS.map((path) => {
        const resolved = new URL(path || "./", scopeUrl);
        return new Request(resolved.toString(), { cache: "reload" });
      });
      await Promise.all(requests.map((request) => cache.add(request)));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  if (request.method !== "GET" || !url.href.startsWith(scopeUrl.href)) {
    return;
  }

  const scopeRelativePath = url.href.slice(scopeUrl.href.length);
  const isLiveUpdateAsset =
    request.mode === "navigate"
    || request.destination === "script"
    || request.destination === "style"
    || request.destination === "manifest"
    || scopeRelativePath.startsWith("data/");

  if (isLiveUpdateAsset) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

function networkFirst(request) {
  return fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return networkResponse;
    })
    .catch(() =>
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        throw new Error(`No cached response for ${request.url}`);
      })
    );
}

function cacheFirst(request) {
  return caches.match(request).then((cachedResponse) => {
    if (cachedResponse) {
      return cachedResponse;
    }

    return fetch(request).then((networkResponse) => {
      if (!networkResponse || networkResponse.status !== 200) {
        return networkResponse;
      }

      const responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, responseClone);
      });

      return networkResponse;
    });
  });
}
