const ASSETS = ["__BUILD_ASSETS__"];
const CACHE = "map-method-v2-__BUILD_ID__";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/mm-logo.png", ...ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("map-method-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      // The installed shell and its bundles are one complete version. Show it
      // immediately; registering the worker downloads the next version in the background.
      const saved = await cache.match("/");
      if (saved) return saved;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(event.request, { signal: controller.signal, cache: "no-store" });
        return response.ok ? response : (await cache.match("/")) || response;
      } catch {
        return (await cache.match("/")) || Response.error();
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  if (!SHELL.some((asset) => new URL(asset, self.location.origin).href === url.href)) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request)));
});
