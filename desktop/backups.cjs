const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { gzip, gunzip } = require('node:zlib');
const { promisify } = require('node:util');
const { APP_ORIGIN } = require('./navigation.cjs');
const zip = promisify(gzip), unzip = promisify(gunzip);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 100 * 1024 * 1024;
const OWNER = /^[a-zA-Z0-9_-]{1,100}$/;
const FILE = /^\d{13}-[a-f0-9]{16}\.mmbak$/;

function trustedBackupSender(event, win, offlineURL) {
  if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) return false;
  try { return new URL(event.senderFrame.url).origin === APP_ORIGIN || event.senderFrame.url === offlineURL; }
  catch { return false; }
}

function keptSnapshots(items, now = Date.now()) {
  const days = new Map();
  for (const item of items.filter((entry) => entry.at >= now - 90 * 86400000).sort((a, b) => a.at - b.at)) {
    const day = new Date(item.at).toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(item);
  }
  const result = [];
  for (const entries of days.values()) {
    const hourly = new Map();
    for (const entry of entries) hourly.set(new Date(entry.at).toISOString().slice(0, 13), entry);
    const keep = new Set([entries[0].id, ...entries.slice(-24).map((entry) => entry.id), ...[...hourly.values()].map((entry) => entry.id)]);
    result.push(...entries.filter((entry) => keep.has(entry.id)));
  }
  // The most recent snapshot survives even when the app has not been used for months.
  const latest = [...items].sort((a, b) => b.at - a.at)[0];
  if (latest && !result.some((entry) => entry.id === latest.id)) result.push(latest);
  return result;
}

function createBackupStore({ root, safeStorage, now = Date.now }) {
  const accounts = new Map();
  const queues = new Map();
  let keyPromise;
  const ownerPath = (owner) => {
    if (typeof owner !== 'string' || !OWNER.test(owner)) throw new Error('invalid-backup-account');
    return path.join(root, 'accounts', owner);
  };
  async function atomicWrite(file, bytes, exclusive = false) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    try {
      if (exclusive) {
        try { await fs.link(temp, file); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await fs.unlink(temp);
      } else await fs.rename(temp, file);
    } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
  }
  async function encryptionKey() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('windows-encryption-unavailable');
    keyPromise ??= (async () => {
      const file = path.join(root, 'windows-key.bin');
      try { return Buffer.from(safeStorage.decryptString(await fs.readFile(file)), 'hex'); }
      catch (error) {
        if (error.code !== 'ENOENT') throw new Error('backup-key-unavailable');
        // Losing the key must never silently replace it and strand existing copies.
        const owners = await fs.readdir(path.join(root, 'accounts')).catch(() => []);
        if (owners.length) throw new Error('backup-key-unavailable');
        const key = randomBytes(32);
        await atomicWrite(file, safeStorage.encryptString(key.toString('hex')), true);
        return Buffer.from(safeStorage.decryptString(await fs.readFile(file)), 'hex');
      }
    })().catch((error) => { keyPromise = null; throw error; });
    const key = await keyPromise;
    if (key.length !== 32) throw new Error('backup-key-invalid');
    return key;
  }
  async function seal(text) {
    const key = await encryptionKey(), iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const compressed = await zip(Buffer.from(text), { level: 6 });
    const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
    return Buffer.concat([Buffer.from('MMB1'), iv, cipher.getAuthTag(), encrypted]);
  }
  async function unseal(bytes) {
    if (bytes.length < 33 || bytes.subarray(0, 4).toString() !== 'MMB1') throw new Error('backup-damaged');
    const cipher = createDecipheriv('aes-256-gcm', await encryptionKey(), bytes.subarray(4, 16));
    cipher.setAuthTag(bytes.subarray(16, 32));
    const compressed = Buffer.concat([cipher.update(bytes.subarray(32)), cipher.final()]);
    return (await unzip(compressed, { maxOutputLength: MAX_BYTES })).toString();
  }
  function enqueue(owner, operation) {
    ownerPath(owner);
    const request = (queues.get(owner) || Promise.resolve()).then(operation, operation);
    const settled = request.catch(() => {});
    queues.set(owner, settled);
    void settled.then(() => { if (queues.get(owner) === settled) queues.delete(owner); });
    return request;
  }
  async function manifests(owner) {
    const directory = path.join(ownerPath(owner), 'snapshots');
    let files;
    try { files = await fs.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return { entries: [], damaged: false }; throw error; }
    const results = [];
    let damaged = false;
    for (const id of files.filter((name) => FILE.test(name)).sort().reverse()) {
      try {
        const entry = JSON.parse(await unseal(await fs.readFile(path.join(directory, id))));
        if (entry.owner === owner && entry.id === id && Array.isArray(entry.objects)) results.push(entry);
      } catch (error) {
        if (['backup-key-unavailable', 'backup-key-invalid', 'windows-encryption-unavailable'].includes(error.message)) throw error;
        damaged = true; // Keep objects if any unreadable manifest might reference them.
      }
    }
    return { entries: results.sort((a, b) => b.at - a.at), damaged };
  }
  async function load(owner) {
    if (!accounts.has(owner)) {
      const stored = await manifests(owner);
      accounts.set(owner, { entries: [], damaged: false, ...stored, objects: new Set(), gcDay: '' });
    }
    return accounts.get(owner);
  }
  async function save(owner, snapshot) {
    return enqueue(owner, async () => {
      if (!snapshot || snapshot.owner !== owner || !Array.isArray(snapshot.maps) || snapshot.maps.length > 2000 || !Array.isArray(snapshot.pending)) throw new Error('invalid-backup-data');
      if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) throw new Error('backup-too-large');
      const { packBackup } = await import('../src/lib/mapBackups.js');
      const state = await load(owner);
      const packed = await packBackup(snapshot);
      const at = Math.max(now(), (state.entries[0]?.at || 0) + 1), day = new Date(at).toISOString().slice(0, 10);
      const latest = state.entries[0];
      const objectDirectory = path.join(ownerPath(owner), 'objects');
      for (const [digest, value] of packed.strings) {
        if (state.objects.has(digest)) continue;
        const file = path.join(objectDirectory, `${digest}.mmobj`);
        try {
          const restored = await unseal(await fs.readFile(file));
          if (hash(restored) !== digest) throw new Error('backup-object-damaged');
        } catch (error) {
          // The new payload repairs a corrupt deduplicated object before committing.
          if (error.message === 'backup-key-unavailable') throw error;
          await atomicWrite(file, await seal(value));
        }
        state.objects.add(digest);
      }
      if (latest?.fingerprint === packed.fingerprint && new Date(latest.at).toISOString().slice(0, 10) === day) return summary(latest);
      const id = `${String(at).padStart(13, '0')}-${randomBytes(8).toString('hex')}.mmbak`;
      const entry = { id, owner, at, fingerprint: packed.fingerprint, data: packed.data, objects: [...packed.strings.keys()], pending: snapshot.pending.length,
        maps: snapshot.maps.map((map) => ({ id: map.id, name: map.name, privateLibraryItem: Boolean(map.privateLibraryItem) })), profile: snapshot.profile || {} };
      await atomicWrite(path.join(ownerPath(owner), 'snapshots', id), await seal(JSON.stringify(entry)));
      state.entries.unshift(entry);
      const kept = keptSnapshots(state.entries, at), keepIds = new Set(kept.map((item) => item.id));
      for (const old of state.entries) if (!keepIds.has(old.id)) await fs.unlink(path.join(ownerPath(owner), 'snapshots', old.id)).catch(() => {});
      state.entries = state.entries.filter((item) => keepIds.has(item.id));
      if (!state.damaged && state.gcDay !== day) {
        const referenced = new Set(state.entries.flatMap((item) => item.objects));
        const files = await fs.readdir(objectDirectory).catch(() => []);
        for (const file of files) if (/^[a-f0-9]{64}\.mmobj$/.test(file) && !referenced.has(file.slice(0, 64))) {
          await fs.unlink(path.join(objectDirectory, file)).catch(() => {});
          state.objects.delete(file.slice(0, 64));
        }
        state.gcDay = day;
      }
      return summary(entry);
    });
  }
  const summary = (entry) => ({ id: entry.id, at: entry.at, maps: entry.maps, pending: entry.pending, profile: entry.profile });
  async function list(owner) { return enqueue(owner, async () => (await load(owner)).entries.map(summary)); }
  async function read(owner, id) {
    return enqueue(owner, async () => {
      if (!FILE.test(id || '')) throw new Error('invalid-backup-id');
      const entry = JSON.parse(await unseal(await fs.readFile(path.join(ownerPath(owner), 'snapshots', id))));
      if (entry.owner !== owner || entry.id !== id || hash(entry.data) !== entry.fingerprint) throw new Error('backup-integrity-failed');
      const strings = new Map();
      for (const digest of entry.objects) {
        if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('backup-integrity-failed');
        try {
          const value = await unseal(await fs.readFile(path.join(ownerPath(owner), 'objects', `${digest}.mmobj`)));
          if (hash(value) !== digest) throw new Error('backup-integrity-failed');
          strings.set(digest, value);
        } catch (error) { accounts.get(owner)?.objects.delete(digest); throw error; }
      }
      const { unpackBackup } = await import('../src/lib/mapBackups.js');
      const snapshot = unpackBackup(entry.data, strings);
      if (snapshot.owner !== owner || !Array.isArray(snapshot.maps)) throw new Error('backup-integrity-failed');
      return snapshot;
    });
  }
  async function info() {
    let owners = [];
    try { owners = (await fs.readdir(path.join(root, 'accounts'))).filter((owner) => OWNER.test(owner)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const accountInfo = [];
    for (const owner of owners) {
      try { const entries = await list(owner); if (entries[0]) accountInfo.push({ owner, ...entries[0] }); }
      catch { accountInfo.push({ owner, error: 'backup-unavailable' }); }
    }
    return { path: root, retentionDays: 90, accounts: accountInfo };
  }
  return { save, list, read, info, flush: () => Promise.all([...queues.values()]) };
}

module.exports = { createBackupStore, trustedBackupSender, keptSnapshots };
