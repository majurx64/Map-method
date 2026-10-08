import { useEffect, useId, useRef, useState } from 'react';
import { BACKUP_INTERVALS } from './lib/deviceBackupSchedule';

const intervalLabel = (days) => days === 1 ? 'Каждый день' : days === 3 ? 'Раз в 3 дня' : `Раз в ${days} дней`;

export function BackupFrequency({ value, disabled, onChange }) {
  const id = useId(), root = useRef(null), trigger = useRef(null), options = useRef([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const selected = Math.max(0, BACKUP_INTERVALS.indexOf(value));
  useEffect(() => {
    if (disabled) { setOpen(false); return; }
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, disabled]);
  function focus(index) {
    setHighlight(index); setOpen(true);
    requestAnimationFrame(() => options.current[index]?.focus());
  }
  function choose(days) {
    setOpen(false); trigger.current?.focus(); onChange(days);
  }
  function keys(event) {
    if (disabled) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focus(open ? (highlight + (event.key === 'ArrowDown' ? 1 : -1) + BACKUP_INTERVALS.length) % BACKUP_INTERVALS.length : selected);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); focus(event.key === 'Home' ? 0 : BACKUP_INTERVALS.length - 1);
    }
  }
  return <div className="device-backup-frequency" ref={root} onKeyDown={keys} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <span id={`${id}-label`}>Как часто</span>
    <button type="button" ref={trigger} className={`backup-frequency-trigger${open ? ' is-open' : ''}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-labelledby={`${id}-label ${id}-value`} onClick={() => { setHighlight(selected); setOpen(!open); }}>
      <span id={`${id}-value`}>{intervalLabel(value)}</span><Chevron />
    </button>
    <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={`backup-frequency-list${open ? ' is-open' : ''}`} aria-hidden={!open} inert={!open}>
      {BACKUP_INTERVALS.map((days, index) => <button type="button" role="option" aria-selected={days === value} className={days === value ? 'is-selected' : ''} key={days} ref={(element) => { options.current[index] = element; }} tabIndex={open && highlight === index ? 0 : -1} disabled={disabled} onFocus={() => setHighlight(index)} onClick={() => choose(days)}>
        <span>{intervalLabel(days)}</span><span className="backup-frequency-check" aria-hidden="true">{days === value ? '✓' : ''}</span>
      </button>)}
    </div>
  </div>;
}

function Chevron() {
  return <svg className="backup-control-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function BackupDisclosure({ title, open, onToggle, children, className = '' }) {
  const id = useId();
  return <div className={`device-backup-help ${className}${open ? ' is-open' : ''}`}>
    <button type="button" className="device-backup-help-toggle" aria-expanded={open} aria-controls={id} onClick={() => onToggle(!open)}><span>{title}</span><Chevron /></button>
    <div id={id} className="device-backup-help-content" aria-hidden={!open} inert={!open}><div><div className="device-backup-help-body">{children}</div></div></div>
  </div>;
}
