import { useCallback, useLayoutEffect, useState } from 'react';

function read(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([, visible]) => typeof visible === 'boolean')) : {};
  } catch { return {}; }
}
export default function useCardBackgrounds(owner) {
  const key = `mm-card-backgrounds:${owner}`;
  const [state, setState] = useState(() => ({ key, values: read(key) }));
  useLayoutEffect(() => {
    setState({ key, values: read(key) });
    const changed = (event) => { if (event.key === key || event.key === null) setState({ key, values: read(key) }); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [key]);
  const values = state.key === key ? state.values : {};
  const visible = useCallback((map) => values[map.id] ?? (map.showCardBackground !== false), [values]);
  function set(map, value) {
    const next = { ...read(key), ...values, [map.id]: Boolean(value) };
    setState({ key, values: next });
    localStorage.setItem(key, JSON.stringify(next));
  }
  return { visible, set, values };
}
