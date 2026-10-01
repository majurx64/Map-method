import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCellChanges, mergeLiveMaps } from '../src/lib/liveMaps.js';
import { collaborativeVersions } from '../src/lib/collaborativeHistory.js';

test('shared history reconstructs drawing colours and progress across different participants', () => {
  const map = { mapType: 'free', totalCells: '4', completed: [0, 1], progressCompleted: [1], colors: ['#ff0000', '#0000ff'], createdAt: '2026-10-01T10:00:00Z' };
  const events = [
    { id: 1, actor_id: 'a', changes: [{ index: 0, mode: 'drawing', filled: true, previous_filled: false, previous_progress: false, previous_color: null, color: '#ff0000' }] },
    { id: 2, actor_id: 'b', changes: [{ index: 1, mode: 'drawing', filled: true, previous_filled: false, previous_progress: false, previous_color: null, color: '#0000ff' }] },
    { id: 3, actor_id: 'b', changes: [{ index: 1, filled: true, previous_filled: false }] },
  ].map((event) => ({ ...event, created_at: '2026-10-01T10:01:00Z' }));
  const versions = collaborativeVersions(map, { id: 'team', members: [], events });
  assert.deepEqual(versions[0].completed, []);
  assert.deepEqual(versions[0].progressCompleted, []);
  assert.deepEqual(versions[1].completed, [0]);
  assert.equal(versions[1].colors[0], '#ff0000');
  assert.deepEqual(versions.at(-1).progressCompleted, [1]);
  assert.equal(versions.at(-1).actorId, 'b');
});

test('hiding a shared version does not remove its changes from later history', () => {
  const map = { mapType: 'free', totalCells: '2', completed: [0, 1], progressCompleted: [0, 1], colors: [] };
  const versions = collaborativeVersions(map, { id: 'team', members: [], events: [
    { id: 1, version_hidden: true, changes: [{ index: 0, filled: true }] },
    { id: 2, changes: [{ index: 1, filled: true }] },
  ] });
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.at(-1).progressCompleted, [0, 1]);
});

test('shared history preserves dimensions and cropped cells across grid resizing', () => {
  const before = { mapType: 'free', gridMode: 'manual', totalCells: '4', manualRows: '2', manualCols: '2', completed: [0, 3], progressCompleted: [3], colors: ['#ff0000', null, null, '#0000ff'] };
  const after = { ...before, totalCells: '9', manualRows: '3', manualCols: '3', completed: [4, 8], progressCompleted: [8], colors: Array.from({ length: 9 }, (_, i) => i === 4 ? '#ff0000' : i === 8 ? '#0000ff' : null) };
  const versions = collaborativeVersions(after, { id: 'team', members: [], events: [{ id: 1, kind: 'grid', changes: [{ mode: 'grid', before, after }] }] });
  assert.equal(versions[0].manualCols, '2');
  assert.deepEqual(versions[0].completed, [0, 3]);
  assert.deepEqual(versions[0].progressCompleted, [3]);
  assert.equal(versions[0].colors[3], '#0000ff');
  assert.equal(versions[1].manualCols, '3');
  assert.deepEqual(versions[1].completed, [4, 8]);
  assert.deepEqual(versions[1].cellSequence, []);
});

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
