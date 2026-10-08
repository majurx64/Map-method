import { useCallback, useEffect, useRef, useState } from 'react';
import { pendingMapSaves } from './lib/offlineMaps';

const labels = { checking: 'Проверяем сохранение', writing: 'Сохраняем на устройстве…', local: 'Сохранено на устройстве', sending: 'Отправляется', server: 'Сохранено на сервере', conflict: 'Есть разные версии карты', error: 'Ошибка сохранения' };

export function useSaveHealth(owner, dirtyMaps) {
  const [health, setHealth] = useState({ phase: 'checking', lastSyncedAt: '' });
  const state = useRef({ owner, sending: 0, conflicts: 0, error: false, verified: false, lastSyncedAt: '', sequence: 0 });
  const refresh = useCallback(async (change = {}) => {
    const current = state.current;
    if (current.owner !== owner) return;
    Object.assign(current, change);
    if (change.writing) setHealth((value) => ({ ...value, phase: 'writing' }));
    const sequence = ++current.sequence;
    let pending;
    try { pending = owner ? await pendingMapSaves(owner) : []; }
    catch { if (state.current === current) setHealth({ phase: 'error', lastSyncedAt: current.lastSyncedAt }); return; }
    if (state.current !== current || sequence !== current.sequence) return;
    const unsaved = pending.length || dirtyMaps.current.size;
    const phase = current.error ? 'error' : current.conflicts ? 'conflict' : current.sending ? 'sending' : change.writing ? 'writing' : unsaved || current.offline ? 'local' : owner ? (current.verified ? 'server' : 'checking') : 'local';
    setHealth({ phase, lastSyncedAt: current.lastSyncedAt, pending: pending.length });
  }, [owner, dirtyMaps]);
  useEffect(() => {
    let lastSyncedAt = '';
    try { lastSyncedAt = owner ? localStorage.getItem(`mm-last-sync:${owner}`) || '' : ''; } catch { /* The live status still works when storage is unavailable. */ }
    state.current = { owner, sending: 0, conflicts: 0, error: false, verified: false, lastSyncedAt, sequence: 0 };
    setHealth({ phase: 'checking', lastSyncedAt });
    const offline = () => { if (state.current.owner === owner) setHealth((value) => ({ ...value, phase: 'local' })); };
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [owner]);
  const start = useCallback((storageFailed = false) => {
    if (state.current.owner !== owner) return;
    state.current.sending += 1;
    void refresh({ error: storageFailed, offline: false });
  }, [owner, refresh]);
  const finish = useCallback((confirmed = false) => {
    if (state.current.owner !== owner) return;
    state.current.sending = Math.max(0, state.current.sending - 1);
    if (confirmed) {
      const lastSyncedAt = new Date().toISOString();
      state.current.lastSyncedAt = lastSyncedAt;
      state.current.verified = true;
      state.current.error = false;
      state.current.offline = false;
      try { localStorage.setItem(`mm-last-sync:${owner}`, lastSyncedAt); } catch { /* Optional across-session timestamp. */ }
    } else state.current.offline = true;
    void refresh();
  }, [owner, refresh]);
  return { health, refresh, start, finish };
}

export default function SaveHealth({ value, onOpen, working = false }) {
  const phase = value.phase === 'server' && working ? 'writing' : value.phase;
  const last = value.lastSyncedAt && Number.isFinite(Date.parse(value.lastSyncedAt)) ? new Date(value.lastSyncedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return <button type="button" className={`save-health is-${phase}`} onClick={onOpen} title={phase === 'conflict' ? 'На устройстве и сервере разные правки. Откройте «Версии и копии», сравните карты и выберите нужную. Обе копии сохранены.' : last ? `Последнее сохранение на сервере: ${last}` : 'Откройте данные и резервные копии'} aria-live="polite">
    <i aria-hidden="true" /><span>{labels[phase]}{last && <small>На сервере: {last}</small>}</span>
  </button>;
}
