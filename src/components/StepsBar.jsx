import React from 'react';
import { CheckCircle2, AlertCircle, Circle, RotateCw } from 'lucide-react';
import { Spinner } from './ui.jsx';
import { cx } from '../lib/format';

const STEPS = [['download', 'Download'], ['transcribe', 'Transkrip'], ['highlights', 'Highlight'], ['webcam', 'Webcam']];

export default function StepsBar({ project, progress, onRetry }) {
  return (
    <div className="h-8 px-3 flex items-center gap-1 border-b border-line bg-panel shrink-0 overflow-hidden">
      {STEPS.map(([k, label], i) => {
        const s = (project.steps || {})[k] || {};
        const live = progress[k];
        const running = s.status === 'running';
        const pct = running && live ? live.progress : s.progress;
        const detail = running && live && live.detail ? live.detail : s.detail;
        return (
          <React.Fragment key={k}>
            {i > 0 && <div className="w-4 h-px bg-line shrink-0" />}
            <div className={cx('group relative flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded-md min-w-0 overflow-hidden', s.status === 'error' ? 'bg-red-500/10' : running ? 'bg-accent/10' : '')} title={detail}>
              {s.status === 'done' ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" /> : s.status === 'error' || s.status === 'cancelled' ? <AlertCircle size={13} className="text-red-500 shrink-0" /> : running ? <Spinner size={12} className="text-accent shrink-0" /> : <Circle size={13} className="text-faint shrink-0" />}
              <span className="text-[11.5px] font-medium text-fg shrink-0">{label}</span>
              <span className={cx('text-[11px] truncate max-w-[220px]', s.status === 'error' ? 'text-red-500' : running ? 'text-accent-300' : 'text-muted')}>
                {running ? `${Math.round((pct || 0) * 100)}%${detail ? ' · ' + detail : ''}` : s.status === 'cancelled' ? 'Batal' : s.status === 'error' ? (detail || 'Error') : s.status === 'done' ? (detail || '') : ''}
              </span>
              {(s.status === 'error' || s.status === 'cancelled' || (s.status === 'done' && k !== 'webcam')) && !project.running && (
                <button title="Ulangi dari langkah ini" onClick={() => onRetry(k)} className={cx('text-muted hover:text-fg shrink-0', s.status === 'done' && 'opacity-0 group-hover:opacity-100')}><RotateCw size={11} /></button>
              )}
              {running && <div className="absolute left-0 bottom-0 h-[2px] bg-accent transition-all" style={{ width: `${Math.max(3, (pct || 0) * 100)}%` }} />}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
