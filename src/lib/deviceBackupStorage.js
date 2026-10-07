let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('map-method-device-copies', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { connection = null; throw error; });
  return connection;
}
export async function readDeviceSettings(owner) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('settings').objectStore('settings').get(owner);
    request.onsuccess = () => resolve(request.result || { enabled: false, intervalDays: 1, folder: '', lastAt: 0 });
    request.onerror = () => reject(request.error);
  });
}
export async function writeDeviceSettings(owner, settings) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put(settings, owner);
    transaction.oncomplete = () => resolve(settings);
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('backup-settings-unavailable'));
  });
}
