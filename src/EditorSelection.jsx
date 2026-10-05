import { useEffect, useRef, useState } from 'react';

export default function EditorSelection({ area, ready, moving, cols, rows }) {
  const previous = useRef(null);
  const [mounted, setMounted] = useState(Boolean(area));
  const visible = Boolean(area);
  if (area) previous.current = { area, ready, moving };
  useEffect(() => {
    if (area) { setMounted(true); return; }
    const timer = setTimeout(() => setMounted(false), 180);
    return () => clearTimeout(timer);
  }, [visible]);
  const shown = area ? { area, ready, moving } : previous.current;
  if ((!area && !mounted) || !shown) return null;
  return <div className={`grid-selection${shown.ready && !shown.moving ? ' selection-ready' : ''}${!area ? ' is-closing' : ''}`} style={{ left: `${shown.area.x / cols * 100}%`, top: `${shown.area.y / rows * 100}%`, width: `${shown.area.width / cols * 100}%`, height: `${shown.area.height / rows * 100}%` }}>{shown.ready && !shown.moving && <span>Можно перемещать</span>}</div>;
}
