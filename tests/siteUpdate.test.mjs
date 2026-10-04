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
function workerFetch({ cached, fetcher, writes = new Map(), installed = [] }) {
  const handlers = {};
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').replace('["__BUILD_ASSETS__"]', JSON.stringify(['https://map-method-chi.vercel.app/assets/app.js'])), {
    self: { location: { origin }, skipWaiting: async () => installed.push(true), addEventListener: (type, handler) => { handlers[type] = handler; } },
    caches: { open: async () => ({ match: async () => cached, put: async (key, response) => writes.set(key, await response.text()) }) },
    fetch: fetcher, URL, Response, AbortController, setTimeout, clearTimeout,
  });
  const respond = (request) => {
    let response;
    handlers.fetch({ request, respondWith: (promise) => { response = promise; } });
    return response;
  };
  respond.install = () => { let pending; handlers.install({ waitUntil: (promise) => { pending = promise; } }); return pending; };
  return respond;
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


test('worker installation uses the asset origin and writes only a complete matching shell', async () => {
  const urls = [], writes = new Map(), installed = [];
  const shell = '<div id="root"></div><script src="https://map-method-chi.vercel.app/assets/app.js"></script>';
  const respond = workerFetch({ writes, installed, fetcher: async (url) => { urls.push(url); return new Response(url.endsWith('/') ? shell : 'asset'); } });
  await respond.install();
  assert.ok(urls.every((url) => url.startsWith('https://map-method-chi.vercel.app/')));
  assert.equal(writes.get('/'), shell);
  assert.equal(writes.get('/icon-192.png'), 'asset');
  assert.equal(installed.length, 1);
});

test('a mismatched HTML or failed asset cannot replace the working installed version', async () => {
  for (const failAsset of [false, true]) {
    const writes = new Map(), installed = [];
    const respond = workerFetch({ writes, installed, fetcher: async (url) => new Response(failAsset && url.endsWith('/') ? '<script src="https://map-method-chi.vercel.app/assets/app.js"></script>' : 'different version', { status: failAsset && url.endsWith('.js') ? 503 : 200 }) });
    await assert.rejects(respond.install(), /shell-version-mismatch|shell-download-failed/);
    assert.equal(writes.size, 0);
    assert.equal(installed.length, 0);
  }
});

import { cachedAccountUser, syncFailureMessage } from '../src/lib/startup.js';
test('startup uses only this project session for the local account copy without waiting for auth requests', () => {
  const session = { user: { id: 'owner-one' }, access_token: 'local-token', refresh_token: 'local-refresh' };
  const storage = { getItem: (key) => key === 'project-one' ? JSON.stringify(session) : null };
  assert.equal(cachedAccountUser({ storageKey: 'project-one' }, storage, origin + '/').id, 'owner-one');
  assert.equal(cachedAccountUser({ storageKey: 'project-two' }, storage, origin + '/'), null);
  assert.equal(cachedAccountUser({ storageKey: 'project-one' }, storage, origin + '/?code=callback'), null);
  assert.equal(cachedAccountUser({ storageKey: 'project-one' }, storage, origin + '/#access_token=callback'), null);
  assert.equal(cachedAccountUser({ storageKey: 'project-one' }, { getItem: () => '{invalid' }, origin + '/'), null);
});

test('synchronization distinguishes quota and session errors from failed connectivity', () => {
  assert.match(syncFailureMessage({ status: 402 }), /лимита/);
  assert.match(syncFailureMessage({ code: 'PGRST301' }), /войти/);
  assert.match(syncFailureMessage(new TypeError('Failed to fetch')), /синхронизировать/);
});
