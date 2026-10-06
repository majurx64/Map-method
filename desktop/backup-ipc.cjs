const fs = require('node:fs/promises');
const path = require('node:path');
const { trustedBackupSender } = require('./backups.cjs');

function registerBackupIPC({ ipcMain, store, getWindow, offlineURL, shell, dialog }) {
  const handle = (name, operation) => ipcMain.handle(`mm-backup:${name}`, async (event, ...args) => {
    if (!trustedBackupSender(event, getWindow(), offlineURL)) throw new Error('untrusted-backup-request');
    return operation(...args);
  });
  handle('info', () => store.info());
  handle('save', (owner, snapshot) => store.save(owner, snapshot));
  handle('list', (owner) => store.list(owner));
  handle('read', (owner, id) => store.read(owner, id));
  handle('open-folder', async () => {
    const { path: folder } = await store.info();
    await fs.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder);
    if (error) throw new Error('backup-folder-unavailable');
  });
  handle('export', async (owner, id, mapId = '') => {
    const snapshot = await store.read(owner, id);
    const maps = snapshot.maps.filter((map) => !mapId || map.id === mapId);
    if (!maps.length) throw new Error('backup-map-missing');
    const text = JSON.stringify({ format: 'map-method-backup', version: 1, exportedAt: new Date().toISOString(),
      profile: { ...snapshot.profile, preferences: snapshot.preferences }, maps }, null, 2);
    if (Buffer.byteLength(text) > 50 * 1024 * 1024 || maps.length > 1000) throw new Error('export-too-large');
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Сохранить переносимую копию Map Method',
      defaultPath: `map-method-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Копия Map Method', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    const temp = `${filePath}.${require('node:crypto').randomBytes(8).toString('hex')}.tmp`;
    try {
      const file = await fs.open(temp, 'wx', 0o600);
      try { await file.writeFile(text, 'utf8'); await file.sync(); } finally { await file.close(); }
      await fs.rename(temp, filePath);
    } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
    return { canceled: false, name: path.basename(filePath) };
  });
}
module.exports = { registerBackupIPC };
