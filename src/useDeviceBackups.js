import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKUP_INTERVALS, backupIsDue, portableBackup } from './lib/deviceBackupSchedule';
import { readDeviceSettings, writeDeviceSettings } from './lib/deviceBackupStorage';

const initial = { enabled: false, intervalDays: 1, folder: '', lastAt: 0 };
const withLock = (owner, operation) => navigator.locks?.request
  ? navigator.locks.request(`mm-device-copies:${owner}`, operation) : operation();
const failure = (error) => error.message === 'export-too-large' ? 'Набор превышает 50 МБ или 1000 карт. Скачайте карты частями.'
  : 'Копия не создана. Проверьте доступ к выбранной папке и свободное место. Предыдущие файлы сохранены.';

export default function useDeviceBackups({ owner, ready, capture, changes }) {
  const api = window.mapMethodDesktop?.backups?.saveScheduled ? window.mapMethodDesktop.backups : null;
  const supported = Boolean(api || (!window.mapMethodDesktop?.isDesktop && window.showDirectoryPicker));
  const [state, setState] = useState({ ...initial, owner, loading: true, error: '', needsPermission: false });
  const [busy, setBusy] = useState(false);
  const current = useRef({ owner, ready, capture });
  current.current = { owner, ready, capture };
  const running = useRef(false), lastAttempt = useRef(0);
  const publish = useCallback((requestedOwner, value) => {
    if (current.current.owner === requestedOwner) setState((old) => ({ ...old, ...value, owner: requestedOwner, loading: false }));
  }, []);
  useEffect(() => {
    let alive = true;
    lastAttempt.current = 0;
    setState({ ...initial, owner, loading: true, error: '', needsPermission: false });
    if (!owner || !supported) { setState({ ...initial, owner, loading: false, error: '', needsPermission: false }); return; }
    (api ? api.scheduleInfo(owner) : readDeviceSettings(owner)).then((value) => {
      if (alive) publish(owner, value);
    }).catch(() => { if (alive) publish(owner, { error: 'Не удалось прочитать настройки копирования. Попробуйте открыть раздел снова.' }); });
    return () => { alive = false; };
  }, [owner, api, supported, publish]);

  const check = useCallback(async (force = false) => {
    const requested = current.current;
    if (!supported || !requested.owner || !requested.ready || document.hidden || running.current
      || (!force && Date.now() - lastAttempt.current < 60000)) return;
    running.current = true; lastAttempt.current = Date.now();
    try {
      await withLock(requested.owner, async () => {
        const settings = await (api ? api.scheduleInfo(requested.owner) : readDeviceSettings(requested.owner));
        if (current.current.owner !== requested.owner || !backupIsDue(settings)) return;
        if (!api && (!settings.handle || await settings.handle.queryPermission({ mode: 'readwrite' }) !== 'granted')) {
          publish(requested.owner, { ...settings, needsPermission: true, error: 'Браузер просит снова разрешить запись в папку. До разрешения новые файлы не создаются.' }); return;
        }
        const snapshot = await current.current.capture(false);
        if (!snapshot || snapshot.owner !== requested.owner || current.current.owner !== requested.owner) {
          lastAttempt.current = 0; return; // Retry after an unfinished editor action ends.
        }
        let saved;
        if (api) saved = await api.saveScheduled(requested.owner, snapshot);
        else {
          const at = Date.now(), text = portableBackup(snapshot, at);
          const name = `map-method-backup-${new Date(at).toISOString().replace(/[:.]/g, '-')}-${requested.owner.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}.json`;
          let writer;
          try {
            const file = await settings.handle.getFileHandle(name, { create: true });
            writer = await file.createWritable();
            await writer.write(text); await writer.close();
          } catch (error) { await writer?.abort().catch(() => {}); await settings.handle.removeEntry(name).catch(() => {}); throw error; }
          saved = await writeDeviceSettings(requested.owner, { ...settings, lastAt: at });
        }
        publish(requested.owner, { ...saved, error: '', needsPermission: false });
      });
    } catch (error) { publish(requested.owner, { error: failure(error) }); }
    finally { running.current = false; }
  }, [api, supported, publish]);
  useEffect(() => {
    if (!owner || !ready || !supported || !state.enabled || state.owner !== owner) return;
    const timer = setTimeout(() => { void check(); }, 2000);
    return () => clearTimeout(timer);
  }, [owner, ready, supported, state.enabled, state.owner, check, capture, ...changes]);
  useEffect(() => {
    if (!owner || !ready || !supported) return;
    const visible = () => { if (!document.hidden) void check(); };
    const timer = setInterval(visible, 60000);
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [owner, ready, supported, check]);

  async function configure(changes, chooseFolder = false) {
    if (busy || !owner || !supported) return;
    setBusy(true);
    try {
      if (!BACKUP_INTERVALS.includes(changes.intervalDays)) throw new Error('invalid-backup-settings');
      // Call the picker directly from the click, while the browser still has user activation.
      const picked = chooseFolder && !api ? await window.showDirectoryPicker({ mode: 'readwrite', id: 'map-method-backups' }) : null;
      const saved = api ? chooseFolder ? await api.chooseBackupFolder(owner, changes.intervalDays) : await api.configureSchedule(owner, changes)
        : await withLock(owner, async () => {
          const previous = await readDeviceSettings(owner);
          const value = { ...previous, ...changes, ...(picked ? { handle: picked, folder: picked.name, enabled: true, lastAt: 0 } : {}) };
          if (value.enabled && !value.handle) throw new Error('backup-folder-required');
          return writeDeviceSettings(owner, value);
        });
      publish(owner, { ...saved, error: '', needsPermission: false });
      lastAttempt.current = 0; void check(true);
    } catch (error) { if (error.name !== 'AbortError') publish(owner, { error: failure(error) }); }
    finally { setBusy(false); }
  }
  async function allowFolder() {
    if (busy || !state.handle) return;
    setBusy(true);
    try {
      const permission = await state.handle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') { lastAttempt.current = 0; await check(true); }
    } catch (error) { publish(owner, { error: failure(error) }); }
    finally { setBusy(false); }
  }
  return { settings: state.owner === owner ? state : { ...initial, loading: true }, supported, native: Boolean(api), busy, configure, allowFolder };
}
