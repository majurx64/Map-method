// Account-scoped durable storage; revisions prevent an older response clearing a newer edit.
import { mapAfterProgressReset } from './progressReset.js';
let database;
let persistenceRequested = false;
function openDatabase() {
  if (!persistenceRequested && globalThis.navigator?.storage?.persist) {
    persistenceRequested = true;
    // Best effort: denial never blocks local edits or cloud synchronization.
    void navigator.storage.persist().catch(() => {});
  }
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open("map-method-offline", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("cache");
      request.result.createObjectStore("outbox", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = null; };
      resolve(request.result);
    };
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}

async function transaction(store, mode, run) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    run(tx.objectStore(store), (value) => { result = value; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage aborted"));
  });
}

export function cacheAccountMaps(owner, maps) {
  return transaction("cache", "readwrite", (store) => store.put(maps, owner));
}
export function readAccountCache(owner) {
  return transaction("cache", "readonly", (store, done) => {
    store.get(owner).onsuccess = (event) => done(event.target.result || []);
  });
}
export function queueMapSave(owner, map, base = null) {
  const entry = { key: `${owner}:${map.id}`, owner, map, base, revision: crypto.randomUUID() };
  return transaction("outbox", "readwrite", (store, done) => {
    store.get(entry.key).onsuccess = (event) => {
      if (event.target.result && Object.hasOwn(event.target.result, 'base')) entry.base = event.target.result.base;
      store.put(entry);
      done(entry);
    };
  });
}
export function pendingMapSaves(owner) {
  return transaction("outbox", "readonly", (store, done) => {
    store.getAll().onsuccess = (event) => done(event.target.result.filter((entry) => entry.owner === owner));
  });
}
export function acknowledgeMapSave(entry, submittedBase = null) {
  return transaction("outbox", "readwrite", (store, done) => {
    store.get(entry.key).onsuccess = (event) => {
      const current = event.target.result;
      const matches = current?.revision === entry.revision;
      if (matches) store.delete(entry.key);
      // A newer local edit contains the submitted snapshot plus its own edits.
      // Advance its baseline only after acceptance, so retries replay only those
      // newer edits and keep any concurrent progress already merged by the server.
      else if (current && submittedBase && Number(current.base?.sync_revision || 0) <= Number(submittedBase.sync_revision || 0)) {
        store.put({ ...current, base: submittedBase });
      }
      done(matches);
    };
  });
}
// Explicit conflict resolution replaces only the reviewed revision and its base.
// An edit made in another tab while the choice is open must survive unchanged.
export function replacePendingMapSave(entry, map, base) {
  return transaction("outbox", "readwrite", (store, done) => {
    store.get(entry.key).onsuccess = (event) => {
      if (event.target.result?.revision !== entry.revision) { done(null); return; }
      const next = { ...entry, map, base, revision: crypto.randomUUID() };
      store.put(next); done(next);
    };
  });
}
export function discardPendingMap(owner, id) {
  return transaction("outbox", "readwrite", (store) => store.delete(`${owner}:${id}`));
}

export function mergePendingMaps(remote, pending) {
  const maps = new Map(remote.map((map) => [map.id, map]));
  pending.forEach((entry) => maps.set(entry.map.id, mapAfterProgressReset(entry.map, maps.get(entry.map.id), entry.base)));
  return [...maps.values()];
}
