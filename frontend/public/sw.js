/* PWA shell + offline vocab/locales */
const CACHE = "st-shell-v4";
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/sounds/click.wav",
  "/sounds/error.wav",
  "/sounds/finish.wav",
  "/sounds/start.wav",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  const cacheableApi =
    url.pathname.startsWith("/api/english/words") ||
    url.pathname.startsWith("/api/english/warehouse") ||
    url.pathname.startsWith("/locales/") ||
    url.pathname.startsWith("/models/");

  if (cacheableApi) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        try {
          const net = await fetch(event.request);
          if (net.ok) cache.put(event.request, net.clone());
          return net;
        } catch {
          const hit = await cache.match(event.request);
          if (hit) return hit;
          throw new Error("offline");
        }
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(async (hit) => {
      if (hit) return hit;
      try {
        const net = await fetch(event.request);
        if (net.ok && (url.origin === self.location.origin)) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, net.clone());
        }
        return net;
      } catch {
        if (event.request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return caches.match("/");
      }
    }),
  );
});
