// Account-scoped durable storage; revisions prevent an older response clearing a newer edit.
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
export function queueMapSave(owner, map) {
  const entry = { key: `${owner}:${map.id}`, owner, map, revision: crypto.randomUUID() };
  return transaction("outbox", "readwrite", (store, done) => { store.put(entry); done(entry); });
}
export function pendingMapSaves(owner) {
  return transaction("outbox", "readonly", (store, done) => {
    store.getAll().onsuccess = (event) => done(event.target.result.filter((entry) => entry.owner === owner));
  });
}
export function acknowledgeMapSave(entry) {
  return transaction("outbox", "readwrite", (store) => {
    store.get(entry.key).onsuccess = (event) => {
      if (event.target.result?.revision === entry.revision) store.delete(entry.key);
    };
  });
}
export function discardPendingMap(owner, id) {
  return transaction("outbox", "readwrite", (store) => store.delete(`${owner}:${id}`));
}

export function mergePendingMaps(remote, pending) {
  const maps = new Map(remote.map((map) => [map.id, map]));
  pending.forEach((entry) => maps.set(entry.map.id, entry.map));
  return [...maps.values()];
}
