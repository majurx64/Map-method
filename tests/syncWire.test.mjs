import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWire, pruneWireObjects, dataPatch, applyEventDelta, equalJSON, requestMapBundle } from '../src/lib/syncWire.js';
import { applySyncDelta, knownVersions } from '../src/lib/syncCache.js';

const wire = (value, objects = {}) => ({ format: 'mm-wire-1', value, objects });
const legacyServer = (handler) => (name, args) => name === 'sync_map_manifest' ? Promise.resolve({ error: { code: 'PGRST202' } }) : handler(name, args);

test('a database encoding timeout falls back to the same read delta with the owner and revisions intact', async () => {
  const args = Object.freeze({ expected_owner: 'owner', history_team: 'team', known_private: { map: { revision: 4 } }, known_shared: { team: { revision: 8 } }, known_objects: ['image'] });
  const calls = [], data = { personal: { ids: ['map'], changes: [] }, shared: { ids: ['team'], changes: [] } };
  const result = await requestMapBundle(legacyServer(async (name, parameters) => {
    calls.push({ name, parameters });
    return name === 'sync_map_bundle_v2' ? { error: { code: '57014' } } : { data, error: null };
  }), args);
  assert.equal(result.plain, true);
  assert.equal(result.data, data);
  assert.deepEqual(calls.map((call) => call.name), ['sync_map_bundle_v2', 'sync_map_bundle']);
  assert.deepEqual(calls[1].parameters, { expected_owner: 'owner', history_team: 'team', known_private: args.known_private, known_shared: args.known_shared });
  assert.deepEqual(args.known_objects, ['image']);
});

test('successful wire reads and authentication or other failures never trigger an alternate request', async () => {
  for (const response of [{ data: wire(null), error: null }, { error: { code: '42501' } }, { error: { code: 'PGRST301' } }, { error: { code: '500' } }]) {
    let calls = 0;
    const result = await requestMapBundle(legacyServer(async () => { calls++; return response; }), {});
    assert.equal(calls, 1);
    assert.equal(result.plain, false);
    assert.equal(result.error, response.error);
  }
  await assert.rejects(requestMapBundle(async () => { throw new TypeError('Failed to fetch'); }, {}), /Failed to fetch/);
});

test('subsequent reads in plain mode keep using deltas without retrying the slow encoder', async () => {
  const calls = [], args = { expected_owner: 'owner', known_private: { map: { revision: 5 } }, known_objects: [] };
  const result = await requestMapBundle(legacyServer(async (name, parameters) => { calls.push({ name, parameters }); return { data: {}, error: null }; }), args, true);
  assert.deepEqual(calls, [{ name: 'sync_map_bundle', parameters: { expected_owner: 'owner', known_private: args.known_private } }]);
  assert.equal(result.plain, true);
});

test('paged account sync rechecks edits and deletions without losing unchanged history or shared card order', async () => {
  const history = [{ id: 'old', image: 'keep original' }];
  const previous = [{ id: 'a', sync_revision: 1, fields: { image: 'image', versions: ['history'], progressCompleted: 'p1' }, data: { image: 'keep original', versions: history, progressCompleted: [0] } }, { id: 'deleted', sync_revision: 1, data: {} }];
  const shared = [{ id: 'team', revision: 8, member_revision: 1, card_order: 4, fields: { progressCompleted: 'p' }, map_data: { progressCompleted: [0, 1] } }];
  const args = { expected_owner: 'owner', known_private: knownVersions(previous), known_shared: knownVersions(shared), known_objects: [] };
  const original = structuredClone(args);
  const calls = []; let indexes = 0, pages = 0;
  const response = await requestMapBundle(async (name, parameters) => {
    calls.push({ name, parameters });
    assert.equal(parameters.expected_owner, 'owner');
    if (name === 'sync_map_manifest') {
      indexes++;
      if (indexes > 1) assert.equal(parameters.known_shared.team.memberRevision, 2);
      return { data: { personal: { ids: ['a'], changed: indexes <= 2 ? ['a'] : [] }, shared: { ids: ['team'], changed: indexes === 1 ? ['team'] : [] } } };
    }
    assert.equal(name, 'sync_map_page');
    if (parameters.shared_id) return { data: { id: 'team', revision: 8, member_revision: 2, card_order: 0, events: null, patch: { fields: { progressCompleted: 'p' }, data: {} } } };
    pages++;
    assert.deepEqual(parameters.known_fields, original.known_private.a.fields);
    return { data: { id: 'a', sync_revision: pages + 1, patch: { fields: { image: 'image', versions: ['history'], progressCompleted: `p${pages + 1}` }, data: { progressCompleted: pages === 1 ? [0, 1] : [0, 1, 2] } } } };
  }, args);
  assert.equal(response.error, null); assert.equal(response.plain, true);
  const maps = applySyncDelta(previous, response.data.personal);
  assert.equal(maps.length, 1); assert.equal(maps[0].sync_revision, 3);
  assert.deepEqual(maps[0].data, { image: 'keep original', versions: history, progressCompleted: [0, 1, 2] });
  assert.equal(maps[0].data.versions[0], history[0]);
  const team = applySyncDelta(shared, response.data.shared, true)[0];
  assert.equal(team.card_order, 0); assert.equal(team.revision, 8);
  assert.deepEqual(team.map_data.progressCompleted, [0, 1]);
  assert.deepEqual(args, original);
  assert.equal(calls.filter((call) => call.name === 'sync_map_page').length, 3);
});

test('a failed page cannot publish a partial account or hide a server/authentication error', async () => {
  const error = { code: '57014' };
  const response = await requestMapBundle(async (name, args) => name === 'sync_map_manifest'
    ? { data: { personal: { ids: ['a', 'b'], changed: ['a', 'b'] }, shared: { ids: [], changed: [] } } }
    : args.private_id === 'a' ? { data: { id: 'a', sync_revision: 1 } } : { error }, { expected_owner: 'owner' });
  assert.equal(response.error, error); assert.equal(response.data, undefined);
  const denied = await requestMapBundle(async () => ({ error: { code: '42501' } }), { expected_owner: 'owner' });
  assert.equal(denied.error.code, '42501');
});

test('transport restores images, sparse colors, integer order, Unicode, and literal marker arrays exactly', () => {
  const image = 'data:image/png;base64,' + 'x'.repeat(10000);
  const encoded = wire(['o', {
    image: ['@', 'image'], versions: ['a', [['o', { image: ['@', 'image'] }]]],
    colors: ['r', [[3, null], [2, '#ffffff'], [1, '#abcdef']]],
    cells: ['n', [[3, 3], [3, 3], [0, 1], [-1, 1], [0, 4], [3, 3]]],
    text: 'Привет 🚀', literal: ['a', ['@', 'literal']],
  }], { image });
  const { data, objects } = decodeWire(encoded);
  assert.equal(data.versions[0].image, image);
  assert.deepEqual(data.colors, [null, null, null, '#ffffff', '#ffffff', '#abcdef']);
  assert.deepEqual(data.cells, [3, 4, 5, 3, 4, 5, 0, -1, 0, 1, 2, 3, 3, 4, 5]);
  assert.deepEqual(data.literal, ['@', 'literal']);
  assert.equal(data.text, 'Привет 🚀');
  assert.equal(decodeWire(wire(['@', 'image']), objects).data, image);
  assert.ok(JSON.stringify(wire(['@', 'image'])).length < 100);
});

test('grouped participant claims preserve numeric and special keys without prototype pollution', () => {
  const encoded = wire(['g', [['participant', ['n', [[0, 5]]]], [['o', { value: 1 }], ['a', ['__proto__', '001']]]]]);
  const result = decodeWire(encoded).data;
  assert.equal(result['4'], 'participant');
  assert.deepEqual(result.__proto__, { value: 1 });
  assert.deepEqual(result['001'], { value: 1 });
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal({}.value, undefined);
});

test('broken dictionaries, cycles, and invalid runs cannot silently become map data', () => {
  assert.throws(() => decodeWire(wire(['@', 'missing'])), /missing-wire-object/);
  assert.throws(() => decodeWire(wire(['@', 'a'], { a: ['@', 'a'] })), /invalid-wire-cycle/);
  assert.throws(() => decodeWire(wire(['r', [[-1, null]]])), /invalid-wire-run/);
  assert.throws(() => decodeWire(wire(['n', [[1.5, 3]]])), /invalid-wire-range/);
  assert.throws(() => decodeWire(wire(['unknown', []])), /invalid-wire-node/);
});

test('cache pruning retains every dependency of retained nodes and does not affect canonical maps', () => {
  const objects = { image: 'x'.repeat(10000), dependent: ['a', [['@', 'image']]] };
  for (let index = 0; index < 1100; index++) objects[`old-${index}`] = ['o', { index }];
  objects.latest = ['a', [['@', 'dependent']]];
  const pruned = pruneWireObjects(objects);
  assert.ok(Object.keys(pruned).length < 1024);
  assert.deepEqual(decodeWire(wire(['@', 'latest']), pruned).data, [['x'.repeat(10000)]]);
});

test('personal save patches send only new history bodies, preserve reorder/deletion, and retain null', () => {
  const first = { id: 'first', image: 'x'.repeat(10000), completed: [0] };
  const second = { id: 'second', image: first.image, completed: [0, 1] };
  const third = { id: 'third', image: first.image, completed: [0, 1, 2] };
  const before = { image: first.image, removed: true, progressCompleted: [], versions: [first, second] };
  const after = { image: first.image, progressCompleted: [0], versions: [second, third, null] };
  const patch = dataPatch(before, after);
  assert.deepEqual(patch.fields, { progressCompleted: [0] });
  assert.deepEqual(patch.removed, ['removed']);
  assert.deepEqual(patch.versions, { order: [['old', 1], ['new', 0], ['new', 1]], added: [{ base: ['old', 1], fields: { id: 'third', completed: [0, 1, 2] }, removed: [] }, { literal: null }] });
  assert.ok(JSON.stringify(patch).length < 400);
  assert.deepEqual(dataPatch(after, after), { fields: {}, removed: [], versions: null });
});

test('database object ordering and sparse colors do not cause full history uploads', () => {
  const original = { image: 'large', completed: [1, 2], id: 'version' };
  const reordered = { id: 'version', completed: [1, 2], image: 'large' };
  const patch = dataPatch({ versions: [original], colors: [null, '#ffffff'] }, { versions: [reordered], colors: [undefined, '#ffffff'] });
  assert.deepEqual(patch, { fields: {}, removed: [], versions: null });
  assert.equal(equalJSON(Array(2), [1, null]), false);
  assert.equal(equalJSON(Array(2), [null, null]), true);
});

test('incremental history retains old events, applies hidden changes, and removes events outside the server window', () => {
  const first = { id: 1, version_hidden: false }, second = { id: 2, changes: [{ index: 0 }] };
  const changed = { ...first, version_hidden: true }, third = { id: 3, changes: [] };
  assert.deepEqual(applyEventDelta([first, second], { ids: [1, 2, 3], changes: [changed, third], hashes: {} }), [changed, second, third]);
  assert.deepEqual(applyEventDelta([first, second], { ids: [2], changes: [], hashes: {} }), [second]);
  assert.throws(() => applyEventDelta([], { ids: [1], changes: [], hashes: {} }), /missing-history-event/);
});

test('personal patches preserve reserved own field names without changing prototypes', () => {
  const next = JSON.parse('{"__proto__":{"safe":true},"constructor":"literal"}');
  const patch = dataPatch({}, next);
  assert.deepEqual(JSON.parse(JSON.stringify(patch.fields)), next);
  assert.equal(Object.getPrototypeOf(patch.fields), Object.prototype);
});

test('a new object version never derives from a literal array version', () => {
  const patch = dataPatch({ versions: [['literal', 'array']] }, { versions: [{ id: 'new', completed: [] }] });
  assert.deepEqual(patch.versions.added[0].base, ['map']);
});
