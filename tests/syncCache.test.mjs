import test from 'node:test';
import assert from 'node:assert/strict';
import { applySyncDelta, knownVersions } from '../src/lib/syncCache.js';

test('unchanged maps reuse canonical snapshots without downloading images or history', () => {
  const image = 'x'.repeat(1_000_000);
  const rows = [{ id: 'a', sync_revision: 5, fields: { image: 'image-hash' }, data: { image } }];
  const response = { ids: ['a'], changes: [] };
  const next = applySyncDelta(rows, response);
  assert.equal(next[0], rows[0]);
  assert.equal(knownVersions(next).a.revision, 5);
  assert.ok(JSON.stringify(response).length < 40);
  assert.ok(JSON.stringify(knownVersions(next)).length < 100);
});

test('a partial update retains unchanged fields, removes deleted fields, and removes deleted maps', () => {
  const rows = [{ id: 'a', data: { image: 'original', progress: [1], removed: true } }, { id: 'deleted', data: {} }];
  const next = applySyncDelta(rows, { ids: ['a'], changes: [{ id: 'a', sync_revision: 2,
    patch: { fields: { image: 'same', progress: 'new' }, data: { progress: [1, 2] } } }] });
  assert.equal(next.length, 1);
  assert.deepEqual(next[0].data, { image: 'original', progress: [1, 2] });
  assert.deepEqual(rows[0].data.progress, [1]);
});

test('shared history is requested separately and invalidated when the snapshot changes', () => {
  const rows = [{ id: 'team', revision: 8, events: [{ id: 1 }], fields: { colors: 'c' }, map_data: { colors: ['#ffffff'] } }];
  assert.equal(knownVersions(rows, true).team.historyRevision, 8);
  const next = applySyncDelta(rows, { ids: ['team'], changes: [{ id: 'team', revision: 9, events: null,
    patch: { fields: { colors: 'c', progressCompleted: 'p' }, data: { progressCompleted: [0] } } }] }, true);
  assert.equal(knownVersions(next, true).team.historyRevision, undefined);
  assert.deepEqual(next[0].map_data.colors, ['#ffffff']);
  const history = applySyncDelta(next, { ids: ['team'], changes: [{ id: 'team', revision: 9, events: [{ id: 2 }],
    patch: { fields: { colors: 'c', progressCompleted: 'p' }, data: {} } }] }, true);
  assert.equal(knownVersions(history, true).team.historyRevision, 9);
  assert.deepEqual(history[0].map_data.progressCompleted, [0]);
});

test('a malformed delta cannot silently replace maps with incomplete data', () => {
  assert.throws(() => applySyncDelta([], { ids: ['missing'], changes: [] }), /missing-sync-row/);
  assert.throws(() => applySyncDelta([], { ids: ['a'], changes: [{ id: 'a', patch: { fields: { image: 'h' }, data: {} } }] }), /incomplete-sync-patch/);
  assert.throws(() => applySyncDelta([], null), /invalid-sync-response/);
});

test('personal history transfers only new versions and preserves deletion/reordering', () => {
  const first = { id: 'first', image: 'large image' }, second = { id: 'second', progress: [1] };
  const rows = [{ id: 'a', fields: { versions: ['h1', 'h2'] }, data: { versions: [first, second] } }];
  const third = { id: 'third', progress: [1, 2] };
  const next = applySyncDelta(rows, { ids: ['a'], changes: [{ id: 'a', sync_revision: 3,
    patch: { fields: { versions: ['h3', 'h2'] }, data: { versions: { h3: third } } } }] });
  assert.deepEqual(next[0].data.versions, [third, second]);
  assert.equal(next[0].data.versions[1], second);
  assert.deepEqual(applySyncDelta(next, { ids: ['a'], changes: [{ id: 'a', patch: { fields: { versions: [] }, data: { versions: {} } } }] })[0].data.versions, []);
});
