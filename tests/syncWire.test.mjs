import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWire, pruneWireObjects, dataPatch, applyEventDelta, equalJSON } from '../src/lib/syncWire.js';

const wire = (value, objects = {}) => ({ format: 'mm-wire-1', value, objects });

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
