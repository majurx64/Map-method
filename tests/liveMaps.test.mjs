import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCellChanges, mergeLiveMaps } from '../src/lib/liveMaps.js';
import { collaborativeVersions } from '../src/lib/collaborativeHistory.js';
import { chooseHistoryEntry, removeHistoryVersion, restoreHistoryVersion, animateHistoryRemoval } from '../src/lib/historyVersions.js';

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

test('Selected history stays on the same event when an earlier row disappears and a participant adds another', () => {
  const versions = ['start', 'first', 'selected', 'latest'].map((id) => ({ id }));
  const selection = { id: 'selected', index: 2 };
  const entries = (items) => items.map((version, index) => ({ version, index }));
  const updated = versions.filter((version) => version.id !== 'first').map((version) => ({ ...version }));
  updated.push({ id: 'new participant event' });
  assert.equal(chooseHistoryEntry(entries(updated), selection).version.id, 'selected');
  assert.equal(chooseHistoryEntry(entries(updated), selection).index, 1);
  assert.equal(chooseHistoryEntry(entries(updated.slice(0, 2)), selection).version.id, 'selected');
});

test('Shared deletion and undo survive server reconstruction without changing cells or hiding later progress', () => {
  const map = { mapType: 'free', totalCells: '3', completed: [0, 1, 2], progressCompleted: [0, 1, 2], colors: [], createdAt: '2026-10-01T10:00:00Z' };
  const team = { id: 'team', members: [], events: [1, 2, 3].map((id) => ({ id, created_at: '2026-10-01T10:01:00Z', changes: [{ index: id - 1, filled: true, previous_filled: false }] })) };
  const original = { ...map, collaboration: team, versions: collaborativeVersions(map, team) };
  const version = original.versions[1];
  const deleted = { version, index: 1, previousId: original.versions[0].id, nextId: original.versions[2].id };
  const hidden = removeHistoryVersion(original, version.id);
  const rebuilt = collaborativeVersions(hidden, hidden.collaboration);
  assert.deepEqual(rebuilt.map((item) => item.id), hidden.versions.map((item) => item.id));
  assert.equal(hidden.completed, original.completed);
  assert.equal(hidden.progressCompleted, original.progressCompleted);
  assert.deepEqual(rebuilt.at(-1).progressCompleted, [0, 1, 2]);
  const restored = restoreHistoryVersion({ ...hidden, versions: rebuilt }, deleted);
  assert.deepEqual(collaborativeVersions(restored, restored.collaboration).map((item) => item.id), original.versions.map((item) => item.id));
  assert.equal(restoreHistoryVersion(restored, deleted).versions.length, original.versions.length);
  assert.equal(removeHistoryVersion(original, original.versions[0].id), original);
});

test('Repeated private deletions undo in order while retaining a newer version and current drawing', () => {
  const original = { versions: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })), completed: [0] };
  let current = original;
  const deleted = [];
  for (const id of ['b', 'd', 'c']) {
    const index = current.versions.findIndex((version) => version.id === id);
    deleted.unshift({ version: current.versions[index], index, previousId: current.versions[index - 1]?.id, nextId: current.versions[index + 1]?.id });
    current = removeHistoryVersion(current, id);
  }
  const changedDrawing = [0, 4];
  current = { ...current, completed: changedDrawing, versions: [...current.versions, { id: 'new' }] };
  for (const entry of deleted) current = restoreHistoryVersion(current, entry);
  assert.deepEqual(current.versions.map((version) => version.id), ['a', 'b', 'c', 'd', 'e', 'new']);
  assert.equal(current.completed, changedDrawing);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('Row removal waits for the real animation completion instead of an elapsed timeout', async () => {
  const end = deferred();
  let finished = false;
  const row = { getBoundingClientRect: () => ({ height: 44 }), animate: (frames) => {
    assert.equal(frames[0].height, '44px');
    assert.equal(frames.at(-1).marginBottom, '-6px');
    return { finished: end.promise };
  } };
  const removal = animateHistoryRemoval(row);
  removal.finished.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  end.resolve();
  await removal.finished;
  assert.equal(finished, true);
});

test('A failed server deletion reverses the collapsed row and waits before releasing it', async () => {
  const reverseEnd = deferred();
  let reversed = false, cancelled = false;
  const animation = { finished: Promise.resolve(), reverse() { reversed = true; this.finished = reverseEnd.promise; }, cancel() { cancelled = true; } };
  const removal = animateHistoryRemoval({ isConnected: true, getBoundingClientRect: () => ({ height: 44 }), animate: () => animation });
  await removal.finished;
  const rollback = removal.rollback();
  assert.equal(reversed, true);
  assert.equal(cancelled, false);
  reverseEnd.resolve();
  await rollback;
  assert.equal(cancelled, true);
});

test('Reduced motion commits immediately without starting a row animation', async () => {
  const removal = animateHistoryRemoval({ animate: () => { assert.fail('Animation must be skipped'); } }, true);
  await removal.finished;
  await removal.rollback();
});
