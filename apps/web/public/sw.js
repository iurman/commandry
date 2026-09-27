const cacheName = "commandry-offline-help-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.add("/offline.html")),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter(
                (name) =>
                  name.startsWith("commandry-offline-help-") &&
                  name !== cacheName,
              )
              .map((name) => caches.delete(name)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    request.mode !== "navigate" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(request).catch(async () => {
      const offline = await caches.match("/offline.html");
      return (
        offline ??
        new Response("Commandry is unavailable offline.", {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});
