import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeLiveMaps } from '../src/lib/liveMaps.js';

test('another session updates clean maps without replacing unsaved or offline edits', () => {
  const remote = [{ id: 'clean', value: 2 }, { id: 'dirty', value: 1 }, { id: 'offline', value: 1 }];
  const local = [{ id: 'clean', value: 1 }, { id: 'dirty', value: 3 }, { id: 'removed' }];
  assert.deepEqual(mergeLiveMaps(remote, local, [{ map: { id: 'offline', value: 4 } }], new Map([['dirty', 1]]), new Set()),
    [{ id: 'clean', value: 2 }, { id: 'dirty', value: 3 }, { id: 'offline', value: 4 }]);
});

test('pending local deletion remains removed even when the server or outbox still has it', () => {
  assert.deepEqual(mergeLiveMaps([{ id: 'deleted' }], [{ id: 'deleted' }], [{ map: { id: 'deleted' } }], new Map([['deleted', 1]]), new Set(['deleted'])), []);
});
