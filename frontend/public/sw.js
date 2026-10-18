/* PWA: оболочка offline; JS/CSS всегда с сети — иначе после docker-пересборки чёрный экран */
const CACHE = "st-shell-v64";
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
  "/sounds/skins/spaceship/click.wav",
  "/skins/spaceship/bg1.jpg",
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

function isAssetPath(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".map") ||
    pathname.endsWith(".wasm")
  );
}

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

  /* HTML навигация и бандлы — только сеть (иначе Chrome держит старый index/чанки) */
  if (event.request.mode === "navigate" || isAssetPath(url.pathname) || url.pathname === "/sw.js") {
    event.respondWith(
      fetch(event.request)
        .then((net) => net)
        .catch(async () => {
          if (event.request.mode === "navigate") {
            const shell = (await caches.match("/index.html")) || (await caches.match("/"));
            if (shell) return shell;
          }
          throw new Error("offline");
        }),
    );
    return;
  }

  /* остальное (иконки, звуки, скины) — cache-first */
  event.respondWith(
    caches.match(event.request).then(async (hit) => {
      if (hit) return hit;
      try {
        const net = await fetch(event.request);
        if (net.ok && url.origin === self.location.origin) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, net.clone());
        }
        return net;
      } catch {
        return caches.match("/");
      }
    }),
  );
});
