import { useCallback, useEffect, useRef, useState } from 'react';

export default function useDesktopBackups({ owner, ready, capture, changes }) {
  const api = window.mapMethodDesktop?.backups;
  const [health, setHealth] = useState({ owner, at: null, error: '', revision: 0 });
  const current = useRef({ owner, ready, capture });
  current.current = { owner, ready, capture };
  const inFlight = useRef(Promise.resolve());
  const save = useCallback(async (force = false) => {
    const requested = current.current;
    if (!api || !requested.owner || !requested.ready) return null;
    const operation = async () => {
      if (current.current.owner !== requested.owner || !current.current.ready) return null;
      try {
        const snapshot = await current.current.capture(force);
        if (!snapshot || current.current.owner !== requested.owner) return null;
        const result = await api.save(requested.owner, snapshot);
        if (current.current.owner === requested.owner) setHealth((old) => old.owner === requested.owner && old.at === result.at && !old.error ? old
          : { owner: requested.owner, at: result.at, error: '', revision: old.revision + 1 });
        return result;
      } catch (error) {
        if (current.current.owner === requested.owner) setHealth((old) => ({ owner: requested.owner, at: old.owner === requested.owner ? old.at : null,
          error: 'Новая копия на диске не создана. Проверьте свободное место и скачайте файл резервной копии.', revision: old.revision + 1 }));
        throw error;
      }
    };
    const request = inFlight.current.then(operation, operation);
    inFlight.current = request.catch(() => {});
    return request;
  }, [api]);
  useEffect(() => {
    if (!api || !owner || !ready) return;
    const timer = setTimeout(() => { void save().catch(() => {}); }, 2000);
    return () => clearTimeout(timer);
    // These fixed dependencies are the actual maps and preferences, not backup status.
  }, [api, owner, ready, save, capture, ...changes]);
  useEffect(() => {
    if (!api || !owner || !ready) return;
    const saveVisible = () => { if (!document.hidden) void save().catch(() => {}); };
    const timer = setInterval(saveVisible, 10 * 60 * 1000);
    window.addEventListener('focus', saveVisible);
    return () => { clearInterval(timer); window.removeEventListener('focus', saveVisible); };
  }, [api, owner, ready, save]);
  return { save, health: health.owner === owner ? health : { owner, at: null, error: '', revision: 0 } };
}
