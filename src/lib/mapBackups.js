// A separate, append-only archive. The offline cache and sync queue never write here.
const DAYS = 30;
const DAILY_LIMIT = 24;
let database;
const queues = new Map();

export function detachedBackupMap(map, id = map.id) {
  return { ...map, id, collaboration: null, shareId: '', shareSnapshot: null, shareSettings: null };
}

export function retainedBackups(entries, now = Date.now()) {
  const cutoff = now - DAYS * 86400000;
  const groups = new Map();
  const keep = [];
  for (const entry of entries.filter((item) => item.at >= cutoff).sort((a, b) => a.at - b.at)) {
    if (entry.kind.startsWith('conflict-')) { keep.push(entry); continue; }
    const key = JSON.stringify([entry.mapId, entry.day, entry.kind]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  // Preserve the first state of each day as well as its most recent states.
  for (const group of groups.values()) keep.push(...(group.length <= DAILY_LIMIT ? group : [group[0], ...group.slice(-(DAILY_LIMIT - 1))]));
  return keep;
}

function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('map-method-backups', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('entries', { keyPath: 'id' }).createIndex('owner', 'owner');
      db.createObjectStore('snapshots');
      db.createObjectStore('strings');
      db.createObjectStore('conflicts', { keyPath: 'key' }).createIndex('owner', 'owner');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

async function transaction(stores, mode, run) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    run(tx, (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('backup-storage-failed'));
  });
}

function serialize(owner, run) {
  const request = (queues.get(owner) || Promise.resolve()).then(() =>
    globalThis.navigator?.locks ? navigator.locks.request(`mm-backup:${owner}`, run) : run());
  const settled = request.catch(() => {});
  queues.set(owner, settled);
  void settled.then(() => { if (queues.get(owner) === settled) queues.delete(owner); });
  return request;
}

async function hash(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Images and other large strings are stored once, including those inside history.
export async function packBackup(map) {
  const strings = new Map();
  const known = new Map();
  const reference = (text, kind) => {
    if (!known.has(text)) known.set(text, hash(text).then((key) => { strings.set(key, text); return key; }));
    return known.get(text).then((key) => ({ [kind]: key }));
  };
  const externalize = (value, root) => {
    const text = JSON.stringify(value);
    return !root && text.length > 2048 ? reference(text, 'mmBackupObject') : value;
  };
  function pack(value, root = false) {
    if (typeof value === 'string' && value.length > 2048) {
      return reference(value, 'mmBackupString');
    }
    if (value && typeof value === 'object') {
      const result = Array.isArray(value) ? [] : {};
      const pending = [];
      for (const [key, child] of Object.entries(value)) {
        const packed = pack(child);
        if (packed?.then) { result[key] = null; pending.push(packed.then((resolved) => { result[key] = resolved; })); }
        else result[key] = packed;
      }
      return pending.length ? Promise.all(pending).then(() => externalize(result, root)) : externalize(result, root);
    }
    return value;
  }
  const data = JSON.stringify(await pack(map, true));
  return { data, strings, fingerprint: await hash(data) };
}

export function unpackBackup(data, strings) {
  const resolving = new Set();
  const decode = (_, value) => {
    if (value && typeof value === 'object' && Object.keys(value).length === 1 && (value.mmBackupString || value.mmBackupObject)) {
      const key = value.mmBackupString || value.mmBackupObject;
      if (!strings.has(key) || resolving.has(key)) throw new Error('backup-object-missing');
      if (value.mmBackupString) return strings.get(key);
      resolving.add(key);
      const resolved = JSON.parse(strings.get(key), decode);
      resolving.delete(key);
      return resolved;
    }
    return value;
  };
  return JSON.parse(data, decode);
}

export function archiveMap(owner, map, kind = 'device', now = Date.now()) {
  if (!owner || !map?.id) return Promise.resolve(null);
  return serialize(owner, async () => {
    const packed = await packBackup(map);
    const date = new Date(now);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return transaction(['entries', 'snapshots', 'strings', 'conflicts'], 'readwrite', (tx, done) => {
      const store = tx.objectStore('entries');
      store.index('owner').getAll(owner).onsuccess = (event) => {
        const existing = event.target.result;
        const latest = existing.filter((item) => item.mapId === map.id && item.kind === kind && item.day === day).sort((a, b) => b.at - a.at)[0];
        if (latest?.fingerprint === packed.fingerprint) { done(latest); return; }
        const entry = { id: crypto.randomUUID(), owner, mapId: map.id, name: map.name, at: now, day, kind, fingerprint: packed.fingerprint, strings: [...packed.strings.keys()] };
        // Conflict entries also remain protected while their resolution is pending.
        tx.objectStore('conflicts').index('owner').getAll(owner).onsuccess = (conflictsEvent) => {
          const protectedIds = new Set(conflictsEvent.target.result.flatMap((conflict) => [conflict.localId, conflict.serverId]));
          const all = [...existing, entry];
          const kept = retainedBackups(all, now);
          const keptIds = new Set([...kept.map((item) => item.id), ...protectedIds]);
          const remaining = all.filter((item) => keptIds.has(item.id));
          const fingerprints = new Set(remaining.map((item) => item.fingerprint));
          const stringKeys = new Set(remaining.flatMap((item) => item.strings));
          for (const old of existing) if (!keptIds.has(old.id)) {
            store.delete(old.id);
            if (!fingerprints.has(old.fingerprint)) tx.objectStore('snapshots').delete(`${owner}:${old.fingerprint}`);
            for (const key of old.strings) if (!stringKeys.has(key)) tx.objectStore('strings').delete(`${owner}:${key}`);
          }
          tx.objectStore('snapshots').put(packed.data, `${owner}:${packed.fingerprint}`);
          for (const [key, value] of packed.strings) tx.objectStore('strings').put(value, `${owner}:${key}`);
          store.add(entry);
          done(entry);
        };
      };
    });
  });
}

export async function archiveMaps(owner, maps, kind = 'device') {
  for (const map of maps) await archiveMap(owner, map, kind);
}

export function listBackups(owner) {
  return transaction(['entries'], 'readonly', (tx, done) => {
    tx.objectStore('entries').index('owner').getAll(owner).onsuccess = (event) => done(event.target.result.sort((a, b) => b.at - a.at));
  });
}

export function readBackup(owner, id) {
  return transaction(['entries', 'snapshots', 'strings'], 'readonly', (tx, done) => {
    tx.objectStore('entries').get(id).onsuccess = (event) => {
      const entry = event.target.result;
      if (!entry || entry.owner !== owner) { done(null); return; }
      tx.objectStore('snapshots').get(`${owner}:${entry.fingerprint}`).onsuccess = (snapshotEvent) => {
        const data = snapshotEvent.target.result;
        const strings = new Map();
        let remaining = entry.strings.length;
        const finish = () => { try { done(data ? unpackBackup(data, strings) : null); } catch { tx.abort(); } };
        if (!remaining) finish();
        for (const key of entry.strings) tx.objectStore('strings').get(`${owner}:${key}`).onsuccess = (stringEvent) => {
          if (typeof stringEvent.target.result === 'string') strings.set(key, stringEvent.target.result);
          if (!--remaining) finish();
        };
      };
    };
  });
}

export function listSaveConflicts(owner) {
  return transaction(['conflicts'], 'readonly', (tx, done) => {
    tx.objectStore('conflicts').index('owner').getAll(owner).onsuccess = (event) => done(event.target.result);
  });
}

export async function preserveSaveConflict(owner, pending, server) {
  const localEntry = await archiveMap(owner, pending.map, 'conflict-device');
  const serverEntry = server ? await archiveMap(owner, server, 'conflict-server') : null;
  const conflict = { key: `${owner}:${pending.map.id}`, owner, mapId: pending.map.id, name: pending.map.name, revision: pending.revision, localId: localEntry.id, serverId: serverEntry?.id || null, at: Date.now() };
  await transaction(['conflicts'], 'readwrite', (tx) => tx.objectStore('conflicts').put(conflict));
  return conflict;
}

export function clearSaveConflict(conflict) {
  return transaction(['conflicts'], 'readwrite', (tx) => {
    const store = tx.objectStore('conflicts');
    store.get(conflict.key).onsuccess = (event) => { if (event.target.result?.revision === conflict.revision) store.delete(conflict.key); };
  });
}
