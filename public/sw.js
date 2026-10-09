const ASSETS = ["__BUILD_ASSETS__"];
const ASSET_ORIGIN = "https://map-method-chi.vercel.app";
const CACHE = "map-method-v2-__BUILD_ID__";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/mm-logo.png", ...ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    // The custom domain can stall on mobile networks. Use the existing asset
    // origin for installation, retaining this site's URLs as the cache keys.
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
    const staged = await Promise.all(SHELL.map(async (key) => {
      const url = key.startsWith('/') ? ASSET_ORIGIN + key : key;
      const response = await fetch(url, { cache: 'reload', signal: controller.signal });
      if (!response.ok) throw new Error('shell-download-failed');
      if (key === '/') {
        const html = await response.text();
        if (!ASSETS.every((asset) => html.includes(asset))) throw new Error('shell-version-mismatch');
        return [key, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })];
      }
      return [key, response];
    }));
    for (const [key, response] of staged) await cache.put(key, response);
    await self.skipWaiting();
    } finally { clearTimeout(timer); controller.abort(); }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((key) => key.startsWith("map-method-") && key !== CACHE);
    let previous;
    // An old page may still be loading when the new worker takes control.
    // Retain one complete previous build until the next successful update.
    for (const name of names.slice().reverse()) {
      const cache = await caches.open(name), shell = await cache.match('/');
      if (!shell) continue;
      const html = await shell.text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => new URL(match[1], self.location.origin).href);
      if (assets.length && (await Promise.all(assets.map((asset) => cache.match(asset)))).every(Boolean)) { previous = name; break; }
    }
    await Promise.all(names.filter((name) => name !== previous).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match("/");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        // Navigation uses the reliable origin and bypasses CDN copies. Keep the
        // account URL (including invitations) in the window unchanged.
        const freshUrl = new URL('/', ASSET_ORIGIN);
        freshUrl.searchParams.set('site-update', Date.now());
        const response = await fetch(freshUrl.href, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return saved || response;
        const html = await response.text();
        const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
          .map((match) => new URL(match[1], ASSET_ORIGIN).href);
        if (!html.includes('id="root"') || !assets.length
          || assets.some((asset) => new URL(asset).origin !== ASSET_ORIGIN)) throw new Error('invalid-site-shell');
        if (saved && await saved.clone().text() === html) return saved;
        const bundles = await Promise.all(assets.map(async (asset) => {
          const bundle = await cache.match(asset) || await fetch(asset, { signal: controller.signal, cache: 'no-store' });
          if (!bundle.ok) throw new Error('site-bundle-unavailable');
          return [asset, bundle];
        }));
        for (const [asset, bundle] of bundles) await cache.put(asset, bundle);
        const shell = new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        await cache.put('/', shell.clone());
        return shell;
      } catch {
        return saved || Response.error();
      } finally { clearTimeout(timer); }
    })());
    return;
  }
  const bundle = url.origin === ASSET_ORIGIN && /^\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname);
  if (!bundle && !SHELL.some((asset) => new URL(asset, self.location.origin).href === url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(event.request);
    if (saved) return saved;
    if (bundle) {
      // stageSiteUpdate can put newer bundles into an older worker's cache.
      // The build-time ASSETS list must not prevent serving those staged files.
      const previous = (await caches.keys()).filter((name) => name.startsWith('map-method-') && name !== CACHE).reverse();
      for (const name of previous) {
        const response = await (await caches.open(name)).match(event.request);
        if (response) return response;
      }
    }
    return fetch(event.request);
  })());
});
