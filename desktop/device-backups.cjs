const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const OWNER = /^[A-Za-z0-9_-]{1,100}$/;

async function atomicWrite(filePath, text) {
  const temp = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const file = await fs.open(temp, 'wx', 0o600);
    try { await file.writeFile(text, 'utf8'); await file.sync(); } finally { await file.close(); }
    await fs.rename(temp, filePath);
  } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
}

function createDeviceBackups({ getRoot, now = Date.now }) {
  const queues = new Map();
  const serial = (owner, operation) => {
    if (!OWNER.test(owner || '')) return Promise.reject(new Error('invalid-backup-owner'));
    const work = (queues.get(owner) || Promise.resolve()).then(operation, operation);
    queues.set(owner, work.catch(() => {}));
    return work;
  };
  async function configPath(owner) { return path.join(await getRoot(), 'device-copy-settings', `${owner}.json`); }
  async function read(owner) {
    try {
      const value = JSON.parse(await fs.readFile(await configPath(owner), 'utf8'));
      const { BACKUP_INTERVALS } = await import('../src/lib/deviceBackupSchedule.js');
      if (!BACKUP_INTERVALS.includes(value.intervalDays) || typeof value.enabled !== 'boolean'
        || typeof value.folder !== 'string' || (value.folder && !path.isAbsolute(value.folder))
        || !Number.isFinite(value.lastAt) || value.lastAt < 0) throw new Error('invalid-backup-settings');
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { enabled: false, intervalDays: 1, folder: '', lastAt: 0 };
    }
  }
  async function persist(owner, settings) {
    const target = await configPath(owner);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await atomicWrite(target, JSON.stringify(settings));
    return settings;
  }
  return {
    info: (owner) => serial(owner, () => read(owner)),
    configure: (owner, changes, chosenFolder) => serial(owner, async () => {
      const { BACKUP_INTERVALS } = await import('../src/lib/deviceBackupSchedule.js');
      if (!changes || typeof changes.enabled !== 'boolean' || !BACKUP_INTERVALS.includes(changes.intervalDays)) throw new Error('invalid-backup-settings');
      const settings = await read(owner);
      // A folder can only come from the main-process native picker, never a renderer argument.
      if (chosenFolder !== undefined) {
        if (!path.isAbsolute(chosenFolder)) throw new Error('invalid-backup-folder');
        settings.folder = chosenFolder; settings.lastAt = 0;
      }
      if (changes.enabled && !settings.folder) throw new Error('backup-folder-required');
      return persist(owner, { ...settings, enabled: changes.enabled, intervalDays: changes.intervalDays });
    }),
    save: (owner, snapshot) => serial(owner, async () => {
      const { backupIsDue, portableBackup } = await import('../src/lib/deviceBackupSchedule.js');
      const settings = await read(owner), at = now();
      if (!backupIsDue(settings, at)) return settings;
      if (snapshot?.owner !== owner) throw new Error('invalid-backup-owner');
      const text = portableBackup(snapshot, at);
      const name = `map-method-backup-${new Date(at).toISOString().replace(/[:.]/g, '-')}-${owner.slice(0, 8)}-${randomBytes(4).toString('hex')}.json`;
      // Do not silently recreate a missing external drive or selected directory.
      if (!(await fs.stat(settings.folder)).isDirectory()) throw new Error('backup-folder-unavailable');
      await atomicWrite(path.join(settings.folder, name), text);
      return persist(owner, { ...settings, lastAt: at });
    }),
  };
}
module.exports = { createDeviceBackups };
