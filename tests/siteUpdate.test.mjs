import test from 'node:test';
import assert from 'node:assert/strict';
import { stageSiteUpdate } from '../src/lib/siteUpdate.js';

const assetBase = 'https://assets.example/';
const origin = 'https://site.example';
const html = '<div id="root"></div><script src="https://assets.example/assets/new.js"></script><link href="https://assets.example/assets/new.css">';

test('stage a complete new shell into the active offline cache while keeping the account origin', async () => {
  const written = new Map();
  const storage = { keys: async () => ['map-method-old', 'unrelated'], open: async (name) => {
    assert.equal(name, 'map-method-old');
    return { put: async (url, response) => written.set(url, await response.text()) };
  } };
  await stageSiteUpdate({ assetBase, origin, version: 'new', storage,
    fetcher: async (url) => new Response(url.includes('/assets/') ? 'bundle' : html) });
  assert.equal(written.get(origin + '/'), html);
  assert.equal(written.get(assetBase + 'assets/new.js'), 'bundle');
  assert.equal(written.get(assetBase + 'assets/new.css'), 'bundle');
});

test('a failed bundle download leaves the previous working shell untouched', async () => {
  let writes = 0;
  const storage = { keys: async () => ['map-method-old'], open: async () => ({ put: async () => writes++ }) };
  await assert.rejects(stageSiteUpdate({ assetBase, origin, version: 'new', storage,
    fetcher: async (url) => url.endsWith('.js') ? new Response('', { status: 503 }) : new Response(html) }), /site-bundle-unavailable/);
  assert.equal(writes, 0);
});


// Exercise the real worker instead of a copy of its caching policy.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function workerFetch({ cached, fetcher }) {
  const handlers = {};
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin }, addEventListener: (type, handler) => { handlers[type] = handler; } },
    caches: { open: async () => ({ match: async () => cached }) },
    fetch: fetcher, URL, Response, AbortController, setTimeout, clearTimeout,
  });
  return (request) => {
    let response;
    handlers.fetch({ request, respondWith: (promise) => { response = promise; } });
    return response;
  };
}

test('refresh returns the complete installed shell without waiting for the network, including invite URLs', async () => {
  let calls = 0;
  const respond = workerFetch({ cached: new Response(html), fetcher: () => { calls++; return new Promise(() => {}); } });
  const response = await respond({ method: 'GET', mode: 'navigate', url: origin + '/?collaborate=invite' });
  assert.equal(await response.text(), html);
  assert.equal(calls, 0);
});

test('navigation without an installed shell still requests the page', async () => {
  let calls = 0;
  const respond = workerFetch({ fetcher: async () => { calls++; return new Response(html); } });
  const response = await respond({ method: 'GET', mode: 'navigate', url: origin + '/' });
  assert.equal(await response.text(), html);
  assert.equal(calls, 1);
});

test('worker leaves account and map API responses outside the shell cache', () => {
  const respond = workerFetch({ fetcher: () => { throw Error('worker must not fetch private data'); } });
  assert.equal(respond({ method: 'GET', mode: 'cors', url: 'https://project.supabase.co/rest/v1/maps' }), undefined);
});
