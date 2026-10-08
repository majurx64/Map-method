import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveMap, listBackups, readBackup, preserveSaveConflict, listSaveConflicts, clearSaveConflict, retainedBackups, packBackup, unpackBackup, detachedBackupMap } from '../src/lib/mapBackups.js';
import { queueMapSave, acknowledgeMapSave, pendingMapSaves, replacePendingMapSave } from '../src/lib/offlineMaps.js';
import { normalizeMeasurement, measurementInputError, measurementRatio, measurementRatioError, measurementQuantityStep, measurementDescription, quantityInCells } from '../src/lib/mapUnits.js';

// A small request/transaction mock verifies storage behavior without a browser.
// Completion follows request callbacks, matching the IndexedDB event contract.
const databases = new Map();
globalThis.indexedDB = {
  open(name) {
    const request = {};
    queueMicrotask(() => {
      if (!databases.has(name)) {
        const stores = new Map();
        const db = {
          stores,
          createObjectStore(storeName, options = {}) {
            stores.set(storeName, { rows: new Map(), keyPath: options.keyPath });
            return { createIndex() {} };
          },
          transaction() {
            const tx = { aborted: false };
            tx.abort = () => { tx.aborted = true; queueMicrotask(() => tx.onabort?.()); };
            const result = (value) => {
              const query = {};
              queueMicrotask(() => { if (!tx.aborted) query.onsuccess?.({ target: { result: structuredClone(value) } }); });
              return query;
            };
            tx.objectStore = (storeName) => {
              const store = stores.get(storeName);
              const write = (value, key, add) => {
                const id = key ?? value[store.keyPath];
                if (add && store.rows.has(id)) throw new Error('duplicate-key');
                store.rows.set(id, structuredClone(value));
              };
              return {
                get: (key) => result(store.rows.get(key)),
                getAll: () => result([...store.rows.values()]),
                index: () => ({ getAll: (owner) => result([...store.rows.values()].filter((value) => value.owner === owner)) }),
                put: (value, key) => write(value, key),
                add: (value) => write(value, undefined, true),
                delete: (key) => store.rows.delete(key),
              };
            };
            setImmediate(() => { if (!tx.aborted) tx.oncomplete?.(); });
            return tx;
          },
          close() {},
        };
        databases.set(name, db);
        request.result = db;
        request.onupgradeneeded?.();
      }
      request.result = databases.get(name);
      request.onsuccess?.();
    });
    return request;
  },
};

const map = { id: 'pullups', name: 'Подтягивания', mapType: 'image', totalCells: '500', completed: [], progressCompleted: [0, 1], colors: [], versions: [], image: 'data:image/png;base64,' + 'x'.repeat(4096), measurement: { unit: 'подтягиваний', perCell: 1 } };
const today = new Date(2026, 9, 6, 12).getTime();

test('archive survives a server rollback, does not alias mutable maps, and isolates accounts', async () => {
  const local = structuredClone(map);
  const first = await archiveMap('alice', local, 'device', today);
  local.progressCompleted.push(2);
  const latest = await archiveMap('alice', local, 'device', today + 1000);
  const server = await archiveMap('alice', map, 'server', today + 2000);
  assert.equal((await listBackups('alice')).length, 3);
  assert.equal(await readBackup('bob', first.id), null);
  assert.deepEqual(await listBackups('bob'), []);
  assert.deepEqual((await readBackup('alice', first.id)).progressCompleted, [0, 1]);
  assert.deepEqual((await readBackup('alice', latest.id)).progressCompleted, [0, 1, 2]);
  assert.deepEqual((await readBackup('alice', server.id)).progressCompleted, [0, 1]);
  assert.equal((await archiveMap('alice', local, 'device', today + 3000)).id, latest.id);
  assert.equal(databases.get('map-method-backups').stores.get('strings').rows.size, 1);
});

test('archive retains day baseline and recent versions; unresolved conflicts outlive normal retention', async () => {
  const entries = Array.from({ length: 40 }, (_, index) => ({ id: String(index), at: today + index, day: '2026-10-06', mapId: 'one', kind: 'device' }));
  const kept = retainedBackups([...entries, { ...entries[0], id: 'old', at: today - 31 * 86400000 }], today + 100);
  assert.equal(kept.length, 24); assert.equal(kept[0].id, '0'); assert.equal(kept.at(-1).id, '39');
  const pending = { owner: 'retention', map: { ...map, id: 'conflict' }, revision: 'old' };
  const conflict = await preserveSaveConflict(pending.owner, pending, { ...pending.map, progressCompleted: [] });
  await archiveMap('retention', { ...pending.map, progressCompleted: [1] }, 'device', Date.now() + 31 * 86400000);
  assert.ok(await readBackup('retention', conflict.localId));
  assert.ok(await readBackup('retention', conflict.serverId));
  await preserveSaveConflict(pending.owner, { ...pending, revision: 'new' }, pending.map);
  await clearSaveConflict(conflict);
  assert.equal((await listSaveConflicts('retention'))[0].revision, 'new');
});

test('large history and images round-trip without repeated content or shared-map links in restored copies', async () => {
  const drawing = Array.from({ length: 1000 }, (_, index) => index);
  const source = { ...map, completed: drawing, versions: [{ id: 'a', snapshot: { completed: drawing, image: map.image } }, { id: 'b', snapshot: { completed: drawing, image: map.image } }], collaboration: { id: 'team' }, shareId: 'public-token', shareSettings: { mode: 'live' }, shareSnapshot: { completed: drawing } };
  const packed = await packBackup(source);
  assert.deepEqual(unpackBackup(packed.data, packed.strings), source);
  assert.equal(packed.fingerprint, (await packBackup(source)).fingerprint);
  assert.equal([...packed.strings.values()].filter((value) => value === map.image).length, 1);
  const restored = detachedBackupMap(source, 'copy');
  assert.equal(restored.id, 'copy'); assert.equal(restored.collaboration, null); assert.equal(restored.shareId, ''); assert.equal(restored.shareSettings, null); assert.equal(restored.shareSnapshot, null);
});

test('late save acknowledgement cannot clear a newer local revision or its original merge baseline', async () => {
  const base = { id: map.id, data: { progressCompleted: [] } };
  const old = await queueMapSave('outbox', map, base);
  const newer = await queueMapSave('outbox', { ...map, progressCompleted: [0, 1, 2] }, { id: map.id, data: { progressCompleted: [0] } });
  assert.equal(await acknowledgeMapSave(old), false);
  assert.deepEqual((await pendingMapSaves('outbox'))[0].base, base);
  assert.equal((await pendingMapSaves('outbox'))[0].revision, newer.revision);
  assert.equal(await acknowledgeMapSave(newer), true);
  assert.deepEqual(await pendingMapSaves('outbox'), []);
});

test('units count complete cells exactly and reject silent rounding, invalid values, and unsafe settings', () => {
  assert.match(measurementInputError('1', 5), /название/);
  assert.equal(measurementInputError('страниц', 5), '');
  assert.equal(measurementInputError('', 0), '');
  assert.match(measurementInputError('минут', 0), /Количество/);
  assert.deepEqual(quantityInCells(30, { unit: 'страниц', perCell: 5 }), { cells: 6, valid: true, perCell: 5 });
  assert.equal(quantityInCells(31, { unit: 'страниц', perCell: 5 }).valid, false);
  assert.equal(quantityInCells(0.3, { unit: 'часов', perCell: 0.1 }).cells, 3);
  assert.equal(quantityInCells(0.3, { unit: 'часов', perCell: 0.1 }).valid, true);
  assert.equal(quantityInCells(50, null).cells, 50);
  for (const amount of [0, -1, '', NaN, Infinity]) assert.equal(quantityInCells(amount, null).valid, false);
  for (const perCell of [0, -1, Infinity, 0.0001, 1000001]) assert.equal(normalizeMeasurement({ unit: 'минут', perCell }), null);
  const steps = normalizeMeasurement({ unit: '', steps: 1, cells: 30 });
  assert.equal(quantityInCells(20, steps).cells, 600);
  assert.equal(quantityInCells(20, steps).valid, true);
  assert.equal(measurementQuantityStep(steps), 1);
  assert.equal(measurementDescription(steps), '1 шаг → 30 клеток');
  assert.deepEqual(measurementRatio(steps), { steps: 1, cells: 30 });
  const pages = normalizeMeasurement({ unit: '1 страниц', steps: 1, cells: 5 });
  assert.equal(pages.unit, 'страниц');
  assert.equal(measurementDescription(pages), '1 страница → 5 клеток');
  assert.equal(quantityInCells(30, pages).cells, 150);
  const legacy = { unit: 'страниц', perCell: 5 };
  assert.deepEqual(measurementRatio(legacy), { steps: 5, cells: 1 });
  assert.equal(quantityInCells(30, normalizeMeasurement({ unit: 'страниц', ...measurementRatio(legacy) })).cells, 6);
  assert.deepEqual(measurementRatio({ unit: 'часов', perCell: 0.1 }), { steps: 1, cells: 10 });
  assert.equal(normalizeMeasurement({ unit: '', steps: 1, cells: 1 }), null);
  assert.equal(measurementRatioError('', 1, 30), '');
  assert.match(measurementRatioError('10', 1, 30), /название/);
  for (const value of ['', 0, -1, Infinity, 1000001]) {
    assert.notEqual(measurementRatioError('', value, 30), '');
    assert.notEqual(measurementRatioError('', 1, value), '');
  }
  assert.equal(measurementQuantityStep({ unit: 'шагов', steps: 3, cells: 20 }), 3);
  assert.equal(quantityInCells(1, { unit: 'шагов', steps: 3, cells: 20 }).valid, false);
  assert.equal(quantityInCells(3, { unit: 'шагов', steps: 3, cells: 20 }).cells, 20);
  assert.equal(quantityInCells(1000000000, { unit: 'шагов', steps: 0.001, cells: 1000000 }).valid, false);
});

test('choosing a conflict version atomically replaces the reviewed base and refuses newer unseen edits', async () => {
  const before = await queueMapSave('choice', map, { data: { progressCompleted: [] } });
  const chosenBase = { data: { progressCompleted: [0, 1, 2, 3] } };
  const after = await replacePendingMapSave(before, { ...map, progressCompleted: [0, 1, 2] }, chosenBase);
  assert.notEqual(after.revision, before.revision);
  assert.deepEqual((await pendingMapSaves('choice'))[0].base, chosenBase);
  assert.equal(await replacePendingMapSave(before, map, null), null);
  assert.deepEqual((await pendingMapSaves('choice'))[0].map.progressCompleted, [0, 1, 2]);
});
