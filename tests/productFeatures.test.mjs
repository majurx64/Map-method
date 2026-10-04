import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveDailyTarget, addChangeSnapshot, addDailySnapshot, buildActivityCalendar, calculateStreaks, createBackup, createMapSnapshot, normalizeVersions, parseBackup, publicSnapshot, publicSharedSnapshot, shouldUpdateSharedMap, restoreSnapshot, encodeSharedSnapshot, decodeSharedSnapshot } from '../src/lib/productFeatures.js';
import { mergePendingMaps } from '../src/lib/offlineMaps.js';

const today = new Date(2026, 8, 28, 12);
const map = { id: 'one', name: 'Test', mapType: 'image', gridMode: 'manual', totalCells: '100', manualRows: '10', manualCols: '10', imageRatio: 1, completed: [], progressCompleted: [], colors: [], activityLog: [], deadline: '2026-10-01' };
const log = (dates) => [{ activityLog: dates.map((date) => ({ date, cells: 1 })) }];

test('An unfinished current day preserves yesterday’s streak without spending a rest day', () => {
  const result = calculateStreaks(log(['2026-09-26', '2026-09-27']), today);
  assert.equal(result.current, 2);
  assert.equal(result.freeDayUsed, false);
});
test('Seven active days earn one rest day; a second missed day breaks the streak', () => {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-09-${20 + i}`);
  assert.equal(calculateStreaks(log(dates), today).current, 8);
  assert.equal(calculateStreaks(log(dates), new Date(2026, 8, 29, 12)).current, 0);
});
test('Calendar retains old activity and handles leap years', () => {
  const result = buildActivityCalendar(log(['2024-02-29']), 366, new Date(2024, 11, 31));
  assert.equal(result.length, 366);
  assert.equal(result.find((day) => day.key === '2024-02-29').cells, 1);
});
test('Dated pauses resume automatically, indefinite pauses do not', () => {
  assert.equal(adaptiveDailyTarget({ ...map, planMode: 'paused', planPausedUntil: '2026-09-27' }, today).target, 25);
  assert.equal(adaptiveDailyTarget({ ...map, planMode: 'paused' }, today).paused, true);
  assert.equal(adaptiveDailyTarget({ ...map, planMode: 'paused', planPausedUntil: '2026-09-28' }, today).paused, true);
});
test('Daily quota is stable while painting today', () => {
  const before = adaptiveDailyTarget(map, today);
  const after = adaptiveDailyTarget({ ...map, progressCompleted: [0, 1, 2, 3], activityLog: [{ date: '2026-09-28', cells: 4 }] }, today);
  assert.equal(before.target, after.target);
  assert.equal(after.paintedToday, 4);
});
test('Empty drawings are not reported as finished', () => {
  assert.match(adaptiveDailyTarget({ ...map, mapType: 'free' }, today).label, /Добавьте рисунок/);
});
test('History preserves image placement and prevents re-sampling after restore', () => {
  const original = { ...map, image: 'data:image/png;base64,abc', imageOffset: { x: 0.2, y: 0 }, colors: ['#123456'], isGameMode: true };
  const version = normalizeVersions([createMapSnapshot(original)])[0];
  const restored = restoreSnapshot({ ...map, image: 'changed', modeDrafts: { image: {} } }, version);
  assert.equal(restored.image, original.image);
  assert.deepEqual(restored.colors, original.colors);
  assert.equal(restored.imageOffset.cellsEdited, true);
  assert.equal(restored.isGameMode, true);
  assert.deepEqual(restored.modeDrafts, {});
});
test('A recolour and a resize each create a daily snapshot', () => {
  assert.equal(addDailySnapshot(map, { ...map, colors: ['#fff'] }).versions.length, 1);
  assert.equal(addDailySnapshot(map, { ...map, totalCells: '90' }).versions.length, 1);
});
test('Daily snapshots are retained and not duplicated on another edit today', () => {
  const next = addDailySnapshot(map, { ...map, colors: ['#fff'] });
  assert.equal(addDailySnapshot(next, { ...next, colors: ['#000'] }).versions.length, 1);
  assert.equal(normalizeVersions(Array.from({ length: 30 }, () => createMapSnapshot(map))).length, 30);
});
test('Change history keeps separate settled edits without duplicating the same state', () => {
  const first = addChangeSnapshot(map);
  const duplicate = addChangeSnapshot(first);
  const second = addChangeSnapshot({ ...duplicate, completed: [1] }, [4, 2, 1]);
  assert.equal(first.versions.length, 1);
  assert.equal(duplicate.versions.length, 1);
  assert.equal(second.versions.length, 2);
  assert.deepEqual(second.versions.at(-1).cellSequence, [4, 2, 1]);
});
test('Malformed history arrays cannot crash normalisation', () => {
  assert.deepEqual(normalizeVersions([{ ...createMapSnapshot(map), progressCompleted: {} }])[0].progressCompleted, []);
});
test('Backup round-trip preserves maps and rejects invalid content before importing', () => {
  assert.deepEqual(parseBackup(createBackup([map])), [map]);
  for (const bad of [null, {}, { ...map, totalCells: '10001' }, { ...map, progressCompleted: {} }]) {
    assert.throws(() => parseBackup(createBackup([bad])));
  }
  assert.throws(() => parseBackup(JSON.stringify({ format: 'map-method-backup', version: 2, maps: [] })));
});
test('Public snapshots contain no hidden progress, versions, original image or private metadata', () => {
  const original = { ...map, progressCompleted: [1, 2], versions: [createMapSnapshot(map)], image: 'private', activityLog: [{ date: '2026-09-28', cells: 10 }], lastPaintedAt: 'private-date', shareId: 'private-token', owner: 'private-owner', modeDrafts: { private: true } };
  const visible = publicSnapshot(original, { showProgress: true, showActivity: true });
  const hidden = publicSnapshot(original, { showProgress: false, showActivity: false });
  assert.deepEqual(visible.progressCompleted, [1, 2]);
  assert.deepEqual(hidden.progressCompleted, []);
  assert.equal(hidden.lastPaintedAt, '');
  for (const field of ['versions','image','activityLog','shareId','owner','modeDrafts']) assert.equal(field in hidden, false);
});
test('Portable links round-trip Unicode and refuse oversized inputs', async () => {
  globalThis.window = globalThis;
  const value = { map: { ...publicSnapshot(map, {}), name: 'Тест 🗺️' }, settings: {} };
  assert.deepEqual(await decodeSharedSnapshot(await encodeSharedSnapshot(value)), value);
  await assert.rejects(decodeSharedSnapshot('x'.repeat(200001)));
});
test('Pending offline edits override stale cloud rows without replacing other maps', () => {
  const merged = mergePendingMaps([map, { ...map, id: 'two' }], [{ map: { ...map, name: 'Offline edit' } }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, 'Offline edit');
});


test('Shared history keeps playback data without private images, metadata or hidden progress', () => {
  const original = { ...map, isGameMode: true, completed: [0, 1, 2], progressCompleted: [1, 2], image: 'private-source' };
  const version = { ...createMapSnapshot(original, 'Этап', [1, 2]), shareId: 'private-token', owner: 'private-owner', activityLog: [{ cells: 10 }], modeDrafts: { private: true } };
  const settings = { showHistory: true, showProgress: true, showActivity: false };
  const visible = publicSnapshot({ ...original, versions: [version] }, settings);
  assert.equal(visible.versions.length, 1);
  assert.equal(visible.versions[0].label, 'Этап');
  assert.equal(visible.versions[0].createdAt, version.createdAt);
  assert.deepEqual(visible.versions[0].progressCompleted, [1, 2]);
  assert.deepEqual(visible.versions[0].cellSequence, [1, 2]);
  assert.equal(visible.versions[0].filled, 2);
  for (const field of ['image', 'owner', 'activityLog', 'modeDrafts', 'shareId', 'versions']) assert.equal(field in visible.versions[0], false);
  const hidden = publicSnapshot({ ...original, versions: [version] }, { ...settings, showProgress: false });
  assert.deepEqual(hidden.versions[0].progressCompleted, []);
  assert.deepEqual(hidden.versions[0].cellSequence, []);
  assert.equal(hidden.versions[0].isGameMode, false);
  assert.equal('versions' in publicSnapshot({ ...original, versions: [version] }, { ...settings, showHistory: false }), false);
});

test('A frozen link ignores map edits and updates only after sharing settings change', () => {
  const settings = { mode: 'snapshot', showProgress: true, showActivity: false, showHistory: true };
  assert.equal(shouldUpdateSharedMap(settings, { ...settings }), false);
  for (const key of ['showProgress', 'showActivity', 'showHistory']) assert.equal(shouldUpdateSharedMap({ ...settings, [key]: !settings[key] }, settings), true);
  assert.equal(shouldUpdateSharedMap(settings, { ...settings, mode: 'live' }), true);
  assert.equal(shouldUpdateSharedMap({ ...settings, mode: 'live' }, settings), true);
  assert.equal(shouldUpdateSharedMap({ showProgress: true }, { showProgress: true }), true);
});


test('Visibility changes preserve the frozen map and its playback endpoint; live mode uses current progress', () => {
  const frozen = { ...map, completed: [0, 1, 2, 3], progressCompleted: [0], lastPaintedAt: '2026-09-29T12:00:00Z' };
  frozen.versions = [createMapSnapshot(frozen, 'Сохранённый этап', [0])];
  const later = { ...frozen, progressCompleted: [0, 1, 2], lastPaintedAt: '2026-09-30T12:00:00Z' };
  later.versions = [...frozen.versions, createMapSnapshot(later, 'Новый этап', [1, 2])];
  later.shareSnapshot = publicSnapshot(frozen, { showProgress: true, showActivity: true, showHistory: true });
  const settings = { mode: 'snapshot', showProgress: true, showActivity: true, showHistory: true };
  const result = publicSharedSnapshot(later, settings);
  assert.deepEqual(result.progressCompleted, [0]);
  assert.equal(result.lastPaintedAt, frozen.lastPaintedAt);
  assert.equal(result.versions.length, 1);
  assert.deepEqual(result.versions[0].cellSequence, [0]);
  const hidden = publicSharedSnapshot(later, { ...settings, showHistory: false, showProgress: false, showActivity: false });
  assert.equal('versions' in hidden, false);
  assert.deepEqual(hidden.progressCompleted, []);
  assert.equal(hidden.lastPaintedAt, '');
  assert.deepEqual(publicSharedSnapshot(later, settings), result);
  const live = publicSharedSnapshot(later, { ...settings, mode: 'live' });
  assert.deepEqual(live.progressCompleted, [0, 1, 2]);
  assert.equal(live.versions.length, 2);
  const legacy = { ...later, shareSnapshot: null };
  assert.deepEqual(publicSharedSnapshot(legacy, settings, later.shareSnapshot), result);
});


test('Canonical history is reused without cloning snapshots on editor updates', () => {
  const source = [createMapSnapshot({ ...map, completed: [0, 1], colors: ['#111111'] })];
  const canonical = normalizeVersions(source);
  assert.notEqual(canonical, source);
  assert.equal(normalizeVersions(canonical), canonical);
  assert.equal(normalizeVersions(canonical)[0].colors, canonical[0].colors);
  source[0].completed.push(-1, 10001);
  assert.deepEqual(normalizeVersions(source)[0].completed, [0, 1]);
  assert.notEqual(normalizeVersions([...canonical]), canonical);
});
