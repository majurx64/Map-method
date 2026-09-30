import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCellChanges, mergeLiveMaps } from '../src/lib/liveMaps.js';

test('another session updates clean maps without replacing unsaved or offline edits', () => {
  const remote = [{ id: 'clean', value: 2 }, { id: 'dirty', value: 1 }, { id: 'offline', value: 1 }];
  const local = [{ id: 'clean', value: 1 }, { id: 'dirty', value: 3 }, { id: 'removed' }];
  assert.deepEqual(mergeLiveMaps(remote, local, [{ map: { id: 'offline', value: 4 } }], new Map([['dirty', 1]]), new Set()),
    [{ id: 'clean', value: 2 }, { id: 'dirty', value: 3 }, { id: 'offline', value: 4 }]);
});

test('pending local deletion remains removed even when the server or outbox still has it', () => {
  assert.deepEqual(mergeLiveMaps([{ id: 'deleted' }], [{ id: 'deleted' }], [{ map: { id: 'deleted' } }], new Map([['deleted', 1]]), new Set(['deleted'])), []);
});

test('remote drawing, erasing and recolouring animate only the changed cells', () => {
  assert.deepEqual(liveCellChanges([0, 1, 3], [1, 2, 3], ['red', 'blue', , 'red'], [, 'green', 'blue', 'red']),
    [{ index: 0, mode: 'erase' }, { index: 1, mode: 'draw' }, { index: 2, mode: 'draw' }]);
  assert.deepEqual(liveCellChanges(new Set([3, 1]), [1, 3]), []);
});
