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
