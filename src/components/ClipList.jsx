import React from 'react';
import { Plus, CheckCircle2, AlertCircle, LayoutPanelTop, Captions, FolderOpen, Trash2, Play, Pencil } from 'lucide-react';
import { Check, Segmented, Spinner, Empty } from './ui.jsx';
import { fmtTime, scoreColor, cx, timeAgo } from '../lib/format';
import { CAPTION_STYLES } from '../lib/captions';
import { hasEdits } from '../lib/sequence';

const LAYOUT = { split: 'Split', fill: 'Fill', fit: 'Fit' };

export function ClipCard({ clip, active, onClick, onToggle, renderProg }) {
  const len = clip.end - clip.start;
  const r = clip.render;
  const edited = hasEdits(clip) || ((clip.edit && clip.edit.overlays) || []).length > 0;
  return (
    <div onClick={onClick} className={cx('rounded-lg border p-2.5 cursor-pointer transition',
      active ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:bg-hover')}>
      <div className="flex gap-2.5">
        <div className="pt-0.5"><Check checked={clip.selected} onChange={onToggle} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-fg leading-snug line-clamp-2">{clip.title}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted flex-wrap">
            <span className="font-mono">{fmtTime(clip.start)}–{fmtTime(clip.end)}</span>
            <span>{Math.round(len)}s</span>
            {clip.score != null && <span className={cx('px-1.5 rounded font-semibold', scoreColor(clip.score))}>{clip.score}</span>}
            <span className={cx('px-1.5 rounded text-[10px] font-semibold uppercase', clip.source === 'manual' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300' : 'bg-hover text-fg2')}>{clip.source === 'manual' ? 'manual' : 'AI'}</span>
            {edited && <span className="px-1.5 rounded text-[10px] font-semibold bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 inline-flex items-center gap-1"><Pencil size={9} />diedit</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-fg2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-panel2 border border-line"><LayoutPanelTop size={10} />{LAYOUT[clip.layout] || clip.layout}</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-panel2 border border-line"><Captions size={10} />{clip.burnCaptions ? (CAPTION_STYLES[clip.captionStyle] || {}).label : 'tanpa sub'}</span>
            {r && r.status === 'done' && <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={11} />diekspor</span>}
            {r && r.status === 'error' && <span className="inline-flex items-center gap-1 text-red-500" title={r.error}><AlertCircle size={11} />gagal</span>}
            {r && r.status === 'queued' && <span className="text-muted">antre…</span>}
          </div>
          {clip.description && <div className="mt-1.5 text-[11.5px] text-muted leading-snug line-clamp-2">{clip.description}</div>}
          {r && r.status === 'rendering' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-accent-300"><Spinner size={11} />
              <div className="flex-1 h-1 rounded bg-line overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${(renderProg || 0) * 100}%` }} /></div>
              {Math.round((renderProg || 0) * 100)}%</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClipList({ project, tab, setTab, sortBy, setSortBy, activeId, setActiveId, onToggle, onAll, onAdd, renderProg, onPlayRender, onDeleteRender, onShow }) {
  const clips = [...(project.clips || [])].sort((a, b) => (sortBy === 'score' ? (b.score ?? -1) - (a.score ?? -1) : a.start - b.start));
  const renders = project.renders || [];
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-line shrink-0 px-2">
        {[['clips', `Klip (${clips.length})`], ['rendered', `Hasil ekspor (${renders.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('h-9 px-2.5 text-[12.5px] font-medium border-b-2 -mb-px transition', tab === k ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{l}</button>
        ))}
      </div>
      {tab === 'clips' ? (<>
        <div className="flex items-center gap-1.5 px-2.5 py-2 shrink-0">
          <Segmented value={sortBy} onChange={setSortBy} options={[{ value: 'time', label: 'Waktu' }, { value: 'score', label: 'Skor' }]} />
          <div className="ml-auto flex items-center">
            <button className="btn-ghost btn-sm px-2" onClick={() => onAll(true)}>Semua</button>
            <button className="btn-ghost btn-sm px-2" onClick={() => onAll(false)}>Kosongkan</button>
          </div>
        </div>
        <div className="px-2.5 pb-2 shrink-0"><button className="btn-soft btn-sm w-full" onClick={onAdd} disabled={!project.video}><Plus size={13} />Klip manual dari playhead</button></div>
        <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-1.5">
          {clips.length === 0 && <Empty>Belum ada klip.</Empty>}
          {clips.map((c) => <ClipCard key={c.id} clip={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} onToggle={(v) => onToggle(c.id, v)} renderProg={renderProg[c.id]} />)}
        </div>
      </>) : (
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {renders.length === 0 && <Empty>Belum ada klip yang diekspor.</Empty>}
          {renders.map((r) => (
            <div key={r.id} className="rounded-lg border border-line bg-panel p-2.5">
              <div className="text-[12.5px] font-semibold text-fg line-clamp-2">{r.title}</div>
              <div className="text-[11px] text-muted mt-1">{fmtTime(r.start)}–{fmtTime(r.end)} · {LAYOUT[r.layout] || r.layout} · {(CAPTION_STYLES[r.captionStyle] || {}).label} · {timeAgo(r.createdAt)}</div>
              <div className="mt-2 flex gap-1.5">
                <button className="btn-soft btn-sm" onClick={() => onPlayRender(r)}><Play size={12} />Putar</button>
                <button className="btn-soft btn-sm" onClick={() => onShow(r.path)}><FolderOpen size={12} />Folder</button>
                <button className="btn-danger btn-sm ml-auto" onClick={() => onDeleteRender(r)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
