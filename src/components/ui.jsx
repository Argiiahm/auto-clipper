import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/format';

export function Modal({ open, onClose, title, children, width = 'max-w-2xl', footer }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={cx('w-full bg-panel border border-line rounded-xl shadow-pop flex flex-col max-h-[90vh]', width)}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-line shrink-0">
          <div className="text-[14px] font-semibold text-fg">{title}</div>
          <button className="icon-btn w-7 h-7" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, onCommit, className }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <input type="range" className={cx('w-full range-fill', className)} style={{ '--p': `${Math.max(0, Math.min(100, p))}%` }} min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))} onMouseUp={(e) => onCommit && onCommit(parseFloat(e.target.value))}
      onKeyUp={(e) => onCommit && onCommit(parseFloat(e.target.value))} />
  );
}

/** Label + value + slider in one row (CapCut-style property row) */
export function SliderRow({ label, value, min = 0, max = 100, step = 1, onChange, onCommit, fmt = (v) => Math.round(v), resetTo }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1.5">
        <span className="text-fg2">{label}</span>
        <span className="flex items-center gap-2">
          {resetTo !== undefined && value !== resetTo && <button className="text-[11px] text-muted hover:text-fg" onClick={() => { onChange(resetTo); onCommit && onCommit(resetTo); }}>Reset</button>}
          <span className="font-mono text-muted min-w-[34px] text-right">{fmt(value)}</span>
        </span>
      </div>
      <Slider value={value} min={min} max={max} step={step} onChange={onChange} onCommit={onCommit} />
    </div>
  );
}

export function Check({ checked, onChange, label, className }) {
  return (
    <label className={cx('inline-flex items-center gap-2 cursor-pointer select-none', className)} onClick={(e) => e.stopPropagation()}>
      <span className={cx('w-4 h-4 rounded-[4px] border flex items-center justify-center transition',
        checked ? 'bg-accent border-accent' : 'border-faint bg-panel2 hover:border-muted')}>
        {checked && <svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6.5l2.5 2.5L10 3.5" stroke="rgb(var(--on-accent))" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <input type="checkbox" className="hidden" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span className="text-[12.5px] text-fg">{label}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none" onClick={(e) => { e.preventDefault(); onChange(!checked); }}>
      {label && <span className="text-[12.5px] text-fg">{label}</span>}
      <span className={cx('relative w-8 h-[18px] rounded-full transition shrink-0', checked ? 'bg-accent' : 'bg-line')}>
        <span className={cx('absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-all', checked ? 'left-[16px]' : 'left-[2px]')} />
      </span>
    </label>
  );
}

export function Segmented({ value, options, onChange, size = 'sm', full }) {
  return (
    <div className={cx('inline-flex p-0.5 rounded-md bg-panel2 border border-line', full && 'w-full')}>
      {options.map((o) => (
        <button key={String(o.value)} onClick={() => onChange(o.value)} title={o.title}
          className={cx('px-2.5 rounded text-xs font-medium transition inline-flex items-center justify-center gap-1.5', size === 'sm' ? 'h-6' : 'h-7 px-3', full && 'flex-1',
            value === o.value ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg')}>{o.icon}{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, right }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><div className="text-[12px] font-medium text-fg2">{label}</div>{right}</div>
      {children}
      {hint && <div className="text-[11.5px] text-muted leading-relaxed">{hint}</div>}
    </div>
  );
}

export function ColorInput({ value, onChange, onCommit }) {
  const [v, setV] = useState(value || '#ffffff');
  useEffect(() => setV(value || '#ffffff'), [value]);
  return (
    <div className="flex items-center gap-1.5">
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'} onChange={(e) => { setV(e.target.value); onChange(e.target.value); }} onBlur={() => onCommit && onCommit(v)} />
      <input className="input font-mono text-[11.5px] w-[84px] h-8 uppercase" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(v)) { onChange(v); onCommit && onCommit(v); } else setV(value); }} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
    </div>
  );
}

/** Numeric input that commits on blur / Enter */
export function NumInput({ value, onCommit, step = 0.1, min, max, digits = 2, className, suffix }) {
  const [txt, setTxt] = useState(Number(value || 0).toFixed(digits));
  useEffect(() => setTxt(Number(value || 0).toFixed(digits)), [value, digits]);
  const commit = () => {
    let v = parseFloat(txt);
    if (!isFinite(v)) { setTxt(Number(value || 0).toFixed(digits)); return; }
    if (min !== undefined) v = Math.max(min, v); if (max !== undefined) v = Math.min(max, v);
    onCommit(v); setTxt(v.toFixed(digits));
  };
  return (
    <div className={cx('relative', className)}>
      <input className="input font-mono pr-6" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = (parseFloat(txt) || 0) + (e.key === 'ArrowUp' ? step : -step); setTxt(v.toFixed(digits)); onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v))); } }} />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Tabs({ value, onChange, tabs, className }) {
  return (
    <div className={cx('flex border-b border-line shrink-0', className)}>
      {tabs.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={cx('h-9 px-3 text-[12.5px] font-medium border-b-2 -mb-px transition', value === k ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{l}</button>
      ))}
    </div>
  );
}

export function Section({ title, right, children, className }) {
  return (
    <div className={cx('px-4 py-3.5 border-b border-line space-y-3', className)}>
      {(title || right) && <div className="flex items-center justify-between min-h-[18px]"><div className="text-[12px] font-semibold text-fg">{title}</div>{right}</div>}
      {children}
    </div>
  );
}

/** simple dropdown menu */
export function Menu({ button, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {button({ open, toggle: () => setOpen(!open) })}
      {open && (
        <div className={cx('absolute top-full mt-1 z-50 min-w-[180px] bg-panel border border-line rounded-lg shadow-pop py-1 fade-in', align === 'right' ? 'right-0' : 'left-0')} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ icon, children, onClick, active, danger }) {
  return (
    <button onClick={onClick} className={cx('w-full h-8 px-3 flex items-center gap-2.5 text-[12.5px] text-left hover:bg-hover', danger ? 'text-red-500' : 'text-fg')}>
      <span className="w-4 flex justify-center text-muted">{icon}</span><span className="flex-1">{children}</span>{active && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
    </button>
  );
}

export function Spinner({ size = 14, className }) {
  return <svg className={cx('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" fill="none" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>;
}

export function Empty({ icon, children }) {
  return <div className="flex flex-col items-center justify-center text-center text-muted text-[12.5px] py-10 gap-2 px-4">{icon}<div>{children}</div></div>;
}

let toastFn = null;
export const toast = (msg, kind = 'info') => toastFn && toastFn(msg, kind);
export function Toaster() {
  const [items, setItems] = React.useState([]);
  useEffect(() => {
    toastFn = (msg, kind) => {
      const id = Math.random();
      setItems((a) => [...a, { id, msg, kind }]);
      setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3200);
    };
    return () => { toastFn = null; };
  }, []);
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[60] space-y-2 w-[420px] pointer-events-none">
      {items.map((t) => (
        <div key={t.id} className={cx('fade-in px-4 py-2.5 rounded-lg border text-[12.5px] shadow-pop bg-panel pointer-events-auto flex items-start gap-2.5',
          t.kind === 'error' ? 'border-red-500/40 text-fg' : t.kind === 'success' ? 'border-emerald-500/40 text-fg' : 'border-line text-fg')}>
          <span className={cx('mt-1 w-2 h-2 rounded-full shrink-0', t.kind === 'error' ? 'bg-red-500' : t.kind === 'success' ? 'bg-emerald-500' : 'bg-accent')} />
          <span className="break-words min-w-0">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
