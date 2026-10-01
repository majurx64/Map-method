// Stage the new shell through the same reliable origin used for JS/CSS assets.
export async function stageSiteUpdate({ assetBase, version, origin, fetcher = fetch, storage = caches }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const url = new URL(assetBase);
    url.searchParams.set('site-update', `${version}-${Date.now()}`);
    const response = await fetcher(url.href, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('site-shell-unavailable');
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], assetBase).href);
    if (!assets.length || !html.includes('id="root"') || assets.some((asset) => new URL(asset).origin !== new URL(assetBase).origin)) {
      throw new Error('invalid-site-shell');
    }
    const bundles = await Promise.all(assets.map(async (asset) => {
      const bundle = await fetcher(asset, { cache: 'no-store', signal: controller.signal });
      if (!bundle.ok) throw new Error('site-bundle-unavailable');
      return [asset, bundle];
    }));
    const names = (await storage.keys()).filter((name) => name.startsWith('map-method-'));
    // The currently installed worker's offline fallback uses its own cache name.
    for (const name of names) {
      const cache = await storage.open(name);
      for (const [asset, bundle] of bundles) await cache.put(asset, bundle.clone());
      await cache.put(new URL('/', origin).href, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    }
  } finally { clearTimeout(timer); }
}
