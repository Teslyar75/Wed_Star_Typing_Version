/* PWA: shell + офлайн-кэш словаря / локалей */
const CACHE = "st-shell-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // словарь и локали — cache-first после первого ответа
  const cacheableApi =
    url.pathname.startsWith("/api/english/words") ||
    url.pathname.startsWith("/api/english/warehouse") ||
    url.pathname.startsWith("/locales/");

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
    caches.match(event.request).then((hit) => hit || fetch(event.request).catch(() => caches.match("/"))),
  );
});
