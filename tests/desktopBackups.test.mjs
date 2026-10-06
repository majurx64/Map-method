import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createBackupStore, keptSnapshots, trustedBackupSender } = require('../desktop/backups.cjs');
const { registerBackupIPC } = require('../desktop/backup-ipc.cjs');
const config = require('../desktop/electron-builder.cjs');
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (text) => Buffer.from(`test-key:${text}`),
  decryptString: (bytes) => { const value = bytes.toString(); if (!value.startsWith('test-key:')) throw new Error('wrong-profile'); return value.slice(9); } };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-backups-test-'));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('mm-backups-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let at = Date.UTC(2026, 9, 6, 12);
  const open = () => createBackupStore({ root, safeStorage, now: () => at });
  return { root, open, advance: (ms) => { at += ms; } };
}
const map = () => ({ id: 'map', name: 'Подтягивания', mapType: 'free', totalCells: '500', completed: [0, 1],
  image: `data:image/png;base64,${'a'.repeat(6000)}`, colors: ['#000', '#000'], versions: [{ id: 'version', snapshot: { completed: [0] } }] });
const payload = (owner = 'account-a') => ({ owner, maps: [map()], pending: [{ key: `${owner}:map`, revision: 'unsent', map: map(), base: { completed: [0] } }], preferences: { 'mm-language': 'ru' }, profile: { displayName: 'Тест' } });

test('encrypted disk copies restore exact maps, pending edits and settings after restart; identical data deduplicates', async (t) => {
  const f = await fixture(t), store = f.open(), source = payload();
  const first = await store.save(source.owner, source);
  f.advance(3000);
  assert.equal((await store.save(source.owner, source)).id, first.id);
  assert.deepEqual(await f.open().read(source.owner, first.id), source);
  const imageHash = createHash('sha256').update(source.maps[0].image).digest('hex');
  const imageFile = path.join(f.root, 'accounts', source.owner, 'objects', `${imageHash}.mmobj`);
  const imageBytes = await fs.readFile(imageFile);
  assert.ok(!imageBytes.includes(Buffer.from(source.maps[0].image)));
  const next = structuredClone(source); next.maps[0].completed.push(2); next.pending[0].map.completed.push(2);
  const second = await store.save(source.owner, next);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(await store.read(source.owner, first.id), source);
  assert.deepEqual(await fs.readFile(imageFile), imageBytes); // shared image is not rewritten
  f.advance(86400000);
  assert.notEqual((await store.save(source.owner, next)).id, second.id); // daily checkpoint
});

test('lost or inaccessible encryption key never regenerates over existing archives', async (t) => {
  const f = await fixture(t), source = payload();
  const first = await f.open().save(source.owner, source);
  const keyFile = path.join(f.root, 'windows-key.bin'), key = await fs.readFile(keyFile);
  await fs.unlink(keyFile);
  await assert.rejects(f.open().read(source.owner, first.id), /backup-key-unavailable/);
  await assert.rejects(f.open().save(source.owner, source), /backup-key-unavailable/);
  await assert.rejects(fs.access(keyFile));
  await fs.writeFile(keyFile, Buffer.from('wrong-profile'));
  await assert.rejects(f.open().list(source.owner), /backup-key-unavailable/);
  await fs.writeFile(keyFile, key);
  assert.deepEqual(await f.open().read(source.owner, first.id), source);
});

test('corrupt objects are rejected and repaired from current data without losing older valid copies', async (t) => {
  const f = await fixture(t), source = payload(), store = f.open();
  const first = await store.save(source.owner, source);
  const digest = createHash('sha256').update(source.maps[0].image).digest('hex');
  const file = path.join(f.root, 'accounts', source.owner, 'objects', `${digest}.mmobj`);
  const bytes = await fs.readFile(file); bytes[bytes.length - 1] ^= 1; await fs.writeFile(file, bytes);
  await assert.rejects(f.open().read(source.owner, first.id));
  const repair = f.open(); assert.equal((await repair.save(source.owner, source)).id, first.id);
  assert.deepEqual(await repair.read(source.owner, first.id), source);
  const next = structuredClone(source); next.maps[0].completed.push(2);
  const restarted = f.open(); await restarted.save(source.owner, next);
  assert.deepEqual(await restarted.read(source.owner, first.id), source);
});

test('corrupt or interrupted manifests do not hide intact copies or trigger deletion of their objects', async (t) => {
  const f = await fixture(t), source = payload(), store = f.open();
  const first = await store.save(source.owner, source);
  const next = structuredClone(source); next.maps[0].name = 'Следующее состояние'; f.advance(1000);
  const second = await store.save(source.owner, next);
  const directory = path.join(f.root, 'accounts', source.owner, 'snapshots');
  await fs.writeFile(path.join(directory, second.id), 'broken');
  await fs.writeFile(path.join(directory, 'unfinished.tmp'), 'partial');
  const restarted = f.open();
  assert.deepEqual((await restarted.list(source.owner)).map((entry) => entry.id), [first.id]);
  assert.deepEqual(await restarted.read(source.owner, first.id), source);
  const objects = await fs.readdir(path.join(f.root, 'accounts', source.owner, 'objects'));
  f.advance(86400000); await restarted.save(source.owner, next);
  for (const file of objects) await fs.access(path.join(f.root, 'accounts', source.owner, 'objects', file));
});

test('account isolation, path validation and encryption failures fail closed', async (t) => {
  const f = await fixture(t), store = f.open(), source = payload();
  const first = await store.save(source.owner, source);
  await assert.rejects(store.read('account-b', first.id));
  await assert.rejects(store.save('account-b', source), /invalid-backup-data/);
  for (const owner of ['../outside', 'a/b', 'C:\\outside', '']) await assert.rejects(store.save(owner, { ...source, owner }));
  await assert.rejects(store.read(source.owner, '../windows-key.bin'), /invalid-backup-id/);
  const unavailable = createBackupStore({ root: path.join(f.root, 'empty'), safeStorage: { isEncryptionAvailable: () => false } });
  await assert.rejects(unavailable.save(source.owner, source), /windows-encryption-unavailable/);
  const other = payload('account-b'); await store.save(other.owner, other);
  assert.deepEqual((await store.info()).accounts.map((entry) => entry.owner).sort(), ['account-a', 'account-b']);
});

test('retention preserves first, hourly, 24 recent states and latest after long inactivity', () => {
  const now = Date.UTC(2026, 9, 6, 23), items = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, at: now - 6 * 3600000 + i * 300000 }));
  const retained = keptSnapshots(items, now), ids = new Set(retained.map((entry) => entry.id));
  assert.ok(ids.has('s0')); for (const item of items.slice(-24)) assert.ok(ids.has(item.id));
  assert.ok(ids.has('s11')); assert.ok(ids.has('s23')); assert.ok(ids.has('s35'));
  assert.deepEqual(keptSnapshots(items, now + 100 * 86400000).map((entry) => entry.id), ['s59']);
});

test('native backup IPC rejects foreign pages, subframes and arbitrary filesystem access', async () => {
  const frame = { url: 'https://www.mapmethod.ru/' }, contents = { mainFrame: frame };
  const win = { isDestroyed: () => false, webContents: contents }, event = { sender: contents, senderFrame: frame }, offline = 'file:///app/desktop/offline.html';
  assert.equal(trustedBackupSender(event, win, offline), true);
  assert.equal(trustedBackupSender({ ...event, senderFrame: { ...frame } }, win, offline), false);
  frame.url = 'https://www.mapmethod.ru.evil.example/'; assert.equal(trustedBackupSender(event, win, offline), false);
  frame.url = offline; assert.equal(trustedBackupSender(event, win, offline), true);
  frame.url = 'file:///app/other.html'; assert.equal(trustedBackupSender(event, win, offline), false);
  const handlers = new Map(); registerBackupIPC({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, store: { save: () => assert.fail('Untrusted write') }, getWindow: () => win, offlineURL: offline });
  await assert.rejects(handlers.get('mm-backup:save')(event, 'account', payload('account')), /untrusted-backup-request/);
  assert.equal(handlers.has('mm-backup:write-file'), false);
  assert.ok(config.files.includes('src/lib/mapBackups.js')); // codec ships inside the installer
});
