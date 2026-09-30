import { useLayoutEffect, useRef, useState } from 'react';

export default function AnimatedEditorPanel({ viewKey, children }) {
  const last = useRef({ key: viewKey, children });
  const content = useRef(null);
  const [outgoing, setOutgoing] = useState(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    let timer;
    if (last.current.key !== viewKey) {
      setOutgoing({ ...last.current, height: height ?? 0 });
      timer = setTimeout(() => setOutgoing(null), 240);
    }
    last.current = { key: viewKey, children };
    return () => clearTimeout(timer);
  }, [viewKey]);
  useLayoutEffect(() => { last.current.children = children; });
  useLayoutEffect(() => {
    let frame;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHeight(content.current?.getBoundingClientRect().height || 0));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content.current);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div className="editor-panel-transition" style={{ height: outgoing ? Math.max(height ?? 0, outgoing.height) : height ?? undefined }}>
    {outgoing && <div key={`old-${outgoing.key}`} className="editor-panel-outgoing" aria-hidden="true" inert>{outgoing.children}</div>}
    <div ref={content}><div key={viewKey} className="editor-panel-current">{children}</div></div>
  </div>;
}
