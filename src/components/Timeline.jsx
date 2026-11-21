import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, Scissors, Trash2, Type, ImagePlus, ZoomIn, ZoomOut, Maximize2, Music, Captions, Layers, Film, Image as ImageIco, Plus } from 'lucide-react';
import { fileUrl } from '../lib/api';
import { cx } from '../lib/format';

const GUT = 46;
const H = { ruler: 24, lane: 28, main: 58, cap: 24, audio: 30 };
const fmtR = (s) => { const m = Math.floor(s / 60); const r = Math.round(s - m * 60); return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`; };
const fmtS = (s) => `${s.toFixed(1)}s`;

function lanes(overlays) {
  const ls = [];
  const sorted = [...overlays].sort((a, b) => a.start - b.start);
  const laneOf = {};
  for (const o of sorted) {
    let i = ls.findIndex((end) => end <= o.start + 1e-3);
    if (i < 0) { ls.push(o.end); i = ls.length - 1; } else ls[i] = o.end;
    laneOf[o.id] = i;
  }
  return { count: ls.length, laneOf };
}

export default function Timeline({ project, clip, seq, t, seek, playing, selection, setSelection, overlays, onOverlayChange, onTrim, onInsertChange, assetsMap,
  captionGroups, onCaptionChange, music, onMusicChange, onSplit, onDelete, onUndo, onRedo, canUndo, canRedo, onAddText, onOpenMedia, onOpenAudio }) {
  const scRef = useRef(null);
  const [vw, setVw] = useState(800);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const total = Math.max(0.5, seq.total);
  const pps = Math.max(2, ((vw - GUT - 60) / total) * zoom);
  const width = total * pps;
  const L = useMemo(() => lanes(overlays || []), [overlays]);
  const nLanes = Math.max(1, L.count);
  const cover = project.cover ? fileUrl(project.dir + '/' + project.cover) : null;

  useEffect(() => {
    const el = scRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setVw(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  // keep playhead visible while playing
  useEffect(() => {
    const el = scRef.current; if (!el || !playing) return;
    const x = t * pps;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - GUT - 40) el.scrollLeft = Math.max(0, x - 40);
  }, [t, playing, pps]);

  const xToT = (clientX) => {
    const el = scRef.current; const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(total, (clientX - r.left - GUT + el.scrollLeft) / pps));
  };

  // generic drag
  useEffect(() => {
    if (!drag) return;
    let last = null;
    const mv = (e) => {
      if (drag.kind === 'seek') { seek(xToT(e.clientX)); return; }
      const dt = (e.clientX - drag.sx) / pps;
      const o = drag.orig;
      if (drag.kind === 'ov-move') { const len = o.end - o.start; const s = Math.max(0, Math.min(total - len, o.start + dt)); last = { start: +s.toFixed(2), end: +(s + len).toFixed(2) }; onOverlayChange(drag.id, last, true); }
      else if (drag.kind === 'ov-l') { last = { start: +Math.max(0, Math.min(o.end - 0.2, o.start + dt)).toFixed(2) }; onOverlayChange(drag.id, last, true); }
      else if (drag.kind === 'ov-r') { last = { end: +Math.min(total, Math.max(o.start + 0.2, o.end + dt)).toFixed(2) }; onOverlayChange(drag.id, last, true); }
      else if (drag.kind === 'trim-start') { last = { start: +Math.max(0, Math.min(o.end - 1, o.start + dt)).toFixed(2) }; onTrim(last, true); }
      else if (drag.kind === 'trim-end') { last = { end: +Math.min(o.max, Math.max(o.start + 1, o.end + dt)).toFixed(2) }; onTrim(last, true); }
      else if (drag.kind === 'ins-r') {
        if (o.kind === 'image') last = { dur: +Math.max(0.3, o.dur + dt).toFixed(2) };
        else last = { out: +Math.min(o.max || 1e9, Math.max((o.in || 0) + 0.3, o.out + dt)).toFixed(2) };
        onInsertChange(drag.id, last, true);
      }
      else if (drag.kind === 'music-move') {
        const len = o.end - o.start;
        const s = Math.max(0, Math.min(total - len, o.start + dt));
        last = { start: +s.toFixed(2), end: +(s + len).toFixed(2) };
        if (onMusicChange) onMusicChange(last, true);
      }
      else if (drag.kind === 'music-l') {
        last = { start: +Math.max(0, Math.min(o.end - 0.5, o.start + dt)).toFixed(2) };
        if (onMusicChange) onMusicChange(last, true);
      }
      else if (drag.kind === 'music-r') {
        last = { end: +Math.min(total, Math.max(o.start + 0.5, o.end + dt)).toFixed(2) };
        if (onMusicChange) onMusicChange(last, true);
      }
      else if (drag.kind === 'cap-move') {
        const len = o.end - o.start;
        const s = Math.max(0, Math.min(total - len, o.start + dt));
        last = { start: +s.toFixed(2), end: +(s + len).toFixed(2) };
        if (onCaptionChange) onCaptionChange(drag.id, last, true);
      }
      else if (drag.kind === 'cap-l') {
        last = { start: +Math.max(0, Math.min(o.end - 0.2, o.start + dt)).toFixed(2), end: o.end };
        if (onCaptionChange) onCaptionChange(drag.id, last, true);
      }
      else if (drag.kind === 'cap-r') {
        last = { start: o.start, end: +Math.min(total, Math.max(o.start + 0.2, o.end + dt)).toFixed(2) };
        if (onCaptionChange) onCaptionChange(drag.id, last, true);
      }
    };
    const up = () => {
      if (last) {
        if (drag.kind.startsWith('ov')) onOverlayChange(drag.id, last, false);
        else if (drag.kind.startsWith('trim')) onTrim(last, false);
        else if (drag.kind === 'ins-r') onInsertChange(drag.id, last, false);
        else if (drag.kind.startsWith('music')) onMusicChange && onMusicChange(last, false);
        else if (drag.kind.startsWith('cap')) onCaptionChange && onCaptionChange(drag.id, last, false);
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [drag, pps, total, onMusicChange, onCaptionChange]);

  const startDrag = (e, kind, id, orig) => { e.stopPropagation(); e.preventDefault(); setDrag({ kind, id, orig, sx: e.clientX }); };
  const bgDown = (e) => { if (e.button !== 0) return; setSelection(null); seek(xToT(e.clientX)); setDrag({ kind: 'seek' }); };

  // ruler ticks
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find((s) => s * pps >= 70) || 600;
  const ticks = []; for (let s = 0; s <= total + 1e-6; s += step) ticks.push(s);

  const srcItems = seq.items.filter((i) => i.type === 'src');
  const firstSrc = srcItems[0]; const lastSrc = srcItems[srcItems.length - 1];
  const vidDur = project.video ? project.video.duration : 1e9;
  const isSel = (type, id) => selection && selection.type === type && selection.id === id;
  const rows = H.ruler + nLanes * H.lane + H.main + H.cap + H.audio + 16;
  const yLanes = H.ruler + 4; const yMain = yLanes + nLanes * H.lane + 4; const yCap = yMain + H.main + 4; const yAud = yCap + H.cap + 2;

  // Music bounds
  const mStart = music ? Math.max(0, Number(music.start) || 0) : 0;
  const mEnd = music ? Math.min(total, Math.max(mStart + 0.5, Number(music.end != null ? music.end : total))) : total;
  const mWidth = Math.max(12, (mEnd - mStart) * pps);

  return (
    <div className="h-full flex flex-col bg-panel border-t border-line">
      {/* toolbar */}
      <div className="h-10 px-2 flex items-center gap-0.5 border-b border-line shrink-0">
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button>
        <div className="w-px h-5 bg-line mx-1.5" />
        <button className="icon-btn" title="Split di playhead (Ctrl+B)" onClick={onSplit}><Scissors size={16} /></button>
        <button className="icon-btn" title="Hapus yang dipilih (Delete)" disabled={!selection || selection.type === 'music' && !music} onClick={onDelete}><Trash2 size={16} /></button>
        <div className="w-px h-5 bg-line mx-1.5" />
        <button className="btn-ghost btn-sm" onClick={onAddText}><Type size={14} />Teks</button>
        <button className="btn-ghost btn-sm" onClick={onOpenMedia}><ImagePlus size={14} />Media</button>
        <button className="btn-ghost btn-sm" onClick={onOpenAudio}><Music size={14} />Audio</button>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-muted mr-2 hidden xl:inline">Tarik ujung klip di timeline untuk atur Start/End</span>
          <button className="icon-btn w-7 h-7" title="Perkecil" onClick={() => setZoom((z) => Math.max(1, z / 1.4))}><ZoomOut size={15} /></button>
          <input type="range" className="w-24 range-fill" style={{ '--p': `${(Math.log(zoom) / Math.log(30)) * 100}%` }} min={0} max={1} step={0.01} value={Math.log(zoom) / Math.log(30)} onChange={(e) => setZoom(Math.pow(30, parseFloat(e.target.value)))} />
          <button className="icon-btn w-7 h-7" title="Perbesar" onClick={() => setZoom((z) => Math.min(30, z * 1.4))}><ZoomIn size={15} /></button>
          <button className="icon-btn w-7 h-7" title="Pas layar" onClick={() => setZoom(1)}><Maximize2 size={14} /></button>
        </div>
      </div>

      {/* tracks */}
      <div ref={scRef} className="flex-1 min-h-0 overflow-auto relative bg-track">
        <div className="relative" style={{ width: GUT + width + 60, height: rows }}>
          {/* gutter */}
          <div className="sticky left-0 z-20 bg-panel border-r border-line" style={{ width: GUT, height: rows }}>
            <div style={{ height: H.ruler }} className="border-b border-line" />
            <div className="flex items-center justify-center text-muted" style={{ position: 'absolute', top: yLanes, height: nLanes * H.lane, width: GUT }} title="Teks & overlay"><Layers size={14} /></div>
            <div className="flex items-center justify-center text-muted" style={{ position: 'absolute', top: yMain, height: H.main, width: GUT }} title="Video utama"><Film size={15} /></div>
            <div className="flex items-center justify-center text-muted" style={{ position: 'absolute', top: yCap, height: H.cap, width: GUT }} title="Subtitle"><Captions size={14} /></div>
            <div className="flex items-center justify-center text-muted" style={{ position: 'absolute', top: yAud, height: H.audio, width: GUT }} title="Musik"><Music size={14} /></div>
          </div>

          <div className="absolute top-0" style={{ left: GUT, width: width + 60, height: rows }} onMouseDown={bgDown}>
            {/* ruler */}
            <div className="sticky top-0 z-10 bg-panel border-b border-line cursor-ew-resize" style={{ height: H.ruler }}>
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full" style={{ left: s * pps }}>
                  <div className="w-px h-2 bg-faint" />
                  <div className="text-[10px] text-muted ml-1 -mt-0.5 font-mono">{fmtR(s)}</div>
                </div>
              ))}
            </div>

            {/* overlay lanes (Teks & Gambar) */}
            {(overlays || []).map((o) => {
              const lane = L.laneOf[o.id] || 0;
              const sel = isSel('ov', o.id);
              const a = o.type === 'image' && assetsMap[o.asset];
              const w = Math.max(8, (o.end - o.start) * pps);
              return (
                <div key={o.id} className={cx('absolute rounded-[5px] flex items-center overflow-hidden text-[11px] cursor-grab active:cursor-grabbing select-none',
                  o.type === 'image' ? 'bg-violet-500/85 text-white' : 'bg-amber-500/90 text-black', sel ? 'ring-2 ring-fg z-10 shadow-md' : 'hover:brightness-105', o.visible === false && 'opacity-40')}
                  style={{ top: yLanes + lane * H.lane, height: H.lane - 4, left: o.start * pps, width: w }}
                  onMouseDown={(e) => { setSelection({ type: 'ov', id: o.id }); startDrag(e, 'ov-move', o.id, { start: o.start, end: o.end }); }}>
                  
                  {/* Left Trim Handle */}
                  <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/95 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                    title="Geser untuk atur waktu mulai"
                    onMouseDown={(e) => { setSelection({ type: 'ov', id: o.id }); startDrag(e, 'ov-l', o.id, { start: o.start, end: o.end }); }}>
                    <div className="w-0.5 h-3 bg-black/60 rounded" />
                  </div>

                  <span className="px-3.5 truncate font-medium flex items-center gap-1.5 pointer-events-none">
                    {o.type === 'image' ? <><ImageIco size={11} />{a ? a.name : 'Gambar'}</> : <><Type size={11} />{(o.text || '').split('\n')[0] || 'Teks'}</>}
                    <span className="text-[9.5px] opacity-75 font-mono">{fmtR(o.start)}–{fmtR(o.end)}</span>
                  </span>

                  {/* Right Trim Handle */}
                  <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/95 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                    title="Geser untuk atur waktu selesai"
                    onMouseDown={(e) => { setSelection({ type: 'ov', id: o.id }); startDrag(e, 'ov-r', o.id, { start: o.start, end: o.end }); }}>
                    <div className="w-0.5 h-3 bg-black/60 rounded" />
                  </div>
                </div>
              );
            })}
            {!(overlays || []).length && <div className="absolute text-[11px] text-faint flex items-center gap-1.5 pointer-events-none" style={{ top: yLanes + 6, left: 8 }}><Plus size={11} />Teks, stiker & logo muncul di sini</div>}

            {/* main track (Video Utama) */}
            {seq.items.map((it) => {
              const sel = isSel(it.type === 'src' ? 'src' : 'ins', it.type === 'src' ? it.id : it.ins.id);
              const w = Math.max(4, (it.oe - it.os) * pps);
              if (it.type === 'src') {
                const canL = firstSrc === it && Math.abs(it.s - clip.start) < 0.01;
                const canR = lastSrc === it && Math.abs(it.e - clip.end) < 0.01;
                return (
                  <div key={it.id} className={cx('absolute rounded-md overflow-hidden border select-none', sel ? 'border-fg ring-1 ring-fg z-10' : 'border-accent/70')}
                    style={{ top: yMain, height: H.main, left: it.os * pps, width: w, backgroundImage: cover ? `url("${cover}")` : undefined, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', backgroundColor: 'rgb(var(--accent) / .35)' }}
                    onMouseDown={(e) => { e.stopPropagation(); setSelection({ type: 'src', id: it.id }); seek(xToT(e.clientX)); setDrag({ kind: 'seek' }); }}>
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/10 pointer-events-none" />
                    <div className="absolute left-2.5 top-1 text-[10.5px] text-white font-medium truncate right-2 pointer-events-none">{fmtR(it.s)}–{fmtR(it.e)} · {fmtS(it.e - it.s)}</div>
                    {canL && <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow" title="Geser untuk ubah Start" onMouseDown={(e) => startDrag(e, 'trim-start', null, { start: clip.start, end: clip.end })}><div className="w-0.5 h-4 bg-black/60 rounded" /></div>}
                    {canR && <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow" title="Geser untuk ubah End" onMouseDown={(e) => startDrag(e, 'trim-end', null, { start: clip.start, end: clip.end, max: vidDur })}><div className="w-0.5 h-4 bg-black/60 rounded" /></div>}
                  </div>
                );
              }
              const a = assetsMap[it.ins.asset];
              const th = a ? (a.kind === 'image' ? fileUrl(project.dir + '/' + a.rel) : a.thumb ? fileUrl(project.dir + '/' + a.thumb) : null) : null;
              return (
                <div key={it.id} className={cx('absolute rounded-md overflow-hidden border select-none', sel ? 'border-fg ring-1 ring-fg z-10' : 'border-fuchsia-500/80')}
                  style={{ top: yMain, height: H.main, left: it.os * pps, width: w, backgroundImage: th ? `url("${th}")` : undefined, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x', backgroundColor: 'rgb(217 70 239 / .35)' }}
                  onMouseDown={(e) => { e.stopPropagation(); setSelection({ type: 'ins', id: it.ins.id }); seek(xToT(e.clientX)); setDrag({ kind: 'seek' }); }}>
                  <div className="absolute inset-0 bg-gradient-to-b from-black/55 to-black/10 pointer-events-none" />
                  <div className="absolute left-2.5 top-1 text-[10.5px] text-white font-medium truncate right-3 flex items-center gap-1 pointer-events-none">{it.ins.kind === 'image' ? <ImageIco size={10} /> : <Film size={10} />}{a ? a.name : 'Scene'} · {fmtS(it.oe - it.os)}</div>
                  <div className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow" title="Geser untuk ubah durasi"
                    onMouseDown={(e) => { setSelection({ type: 'ins', id: it.ins.id }); startDrag(e, 'ins-r', it.ins.id, { kind: it.ins.kind, dur: Number(it.ins.dur) || 3, in: Number(it.ins.in) || 0, out: Number(it.ins.out) || 0, max: a && a.duration }); }}><div className="w-0.5 h-4 bg-black/60 rounded" /></div>
                </div>
              );
            })}

            {/* captions (Subtitle per baris/grup) */}
            {clip.burnCaptions && (captionGroups || []).map((g, gi) => {
              const sel = isSel('cap', gi);
              const w = Math.max(10, (g.end - g.start) * pps);
              return (
                <div
                  key={gi}
                  className={cx(
                    'absolute rounded-[4px] border text-[10px] px-2 flex items-center overflow-hidden cursor-pointer select-none transition-shadow',
                    sel
                      ? 'bg-sky-500/85 text-white border-sky-300 ring-2 ring-sky-400 z-10 shadow-md'
                      : 'bg-sky-500/25 hover:bg-sky-500/40 text-fg2 border-sky-500/60'
                  )}
                  style={{
                    top: yCap,
                    height: H.cap - 4,
                    left: g.start * pps,
                    width: w,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelection({ type: 'cap', id: gi });
                    seek(g.start);
                    startDrag(e, 'cap-move', gi, { start: g.start, end: g.end, words: g.words });
                  }}
                >
                  {/* Left Trim Handle */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                    title="Geser waktu mulai subtitle ini"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelection({ type: 'cap', id: gi });
                      startDrag(e, 'cap-l', gi, { start: g.start, end: g.end, words: g.words });
                    }}
                  >
                    <div className="w-0.5 h-3 bg-black/60 rounded" />
                  </div>

                  <span className="truncate font-medium px-2 pointer-events-none">
                    {g.words.map((w) => w.rawW || w.w).join(' ')}
                  </span>

                  {/* Right Trim Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                    title="Geser waktu selesai subtitle ini"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelection({ type: 'cap', id: gi });
                      startDrag(e, 'cap-r', gi, { start: g.start, end: g.end, words: g.words });
                    }}
                  >
                    <div className="w-0.5 h-3 bg-black/60 rounded" />
                  </div>
                </div>
              );
            })}

            {/* music (Musik Latar) */}
            {music ? (
              <div
                className={cx(
                  'absolute rounded-md bg-emerald-600/85 hover:bg-emerald-600 text-white text-[11px] flex items-center px-2 overflow-hidden cursor-grab active:cursor-grabbing select-none transition-shadow',
                  isSel('music', 'music') && 'ring-2 ring-fg z-10 shadow-md'
                )}
                style={{ top: yAud, height: H.audio - 4, left: mStart * pps, width: mWidth }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelection({ type: 'music', id: 'music' });
                  startDrag(e, 'music-move', 'music', { start: mStart, end: mEnd });
                }}
              >
                {/* Left Trim Handle */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                  title="Geser waktu mulai musik di timeline"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelection({ type: 'music', id: 'music' });
                    startDrag(e, 'music-l', 'music', { start: mStart, end: mEnd });
                  }}
                >
                  <div className="w-0.5 h-3.5 bg-black/60 rounded" />
                </div>

                {/* Center Content */}
                <div className="px-2 truncate flex items-center gap-1.5 z-[1] pointer-events-none">
                  <Music size={11} className="shrink-0" />
                  <span className="font-semibold truncate">{music.name}</span>
                  <span className="text-[10px] text-white/80 font-mono ml-1">
                    {fmtR(mStart)}–{fmtR(mEnd)} ({fmtS(mEnd - mStart)})
                  </span>
                </div>

                <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 200 20">
                  {Array.from({ length: 100 }, (_, i) => {
                    const h = 3 + Math.abs(Math.sin(i * 1.7) * 7 + Math.sin(i * 0.37) * 5);
                    return <rect key={i} x={i * 2} y={10 - h / 2} width="1.2" height={h} fill="white" />;
                  })}
                </svg>

                {/* Right Trim Handle */}
                <div
                  className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/90 cursor-ew-resize flex items-center justify-center z-10 shadow-xs"
                  title="Geser waktu selesai musik di timeline"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelection({ type: 'music', id: 'music' });
                    startDrag(e, 'music-r', 'music', { start: mStart, end: mEnd });
                  }}
                >
                  <div className="w-0.5 h-3.5 bg-black/60 rounded" />
                </div>
              </div>
            ) : (
              <button
                className="absolute text-[11px] text-faint hover:text-fg flex items-center gap-1.5"
                style={{ top: yAud + 6, left: 8 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onOpenAudio}
              >
                <Plus size={11} />Tambah musik
              </button>
            )}

            {/* playhead */}
            <div className="absolute top-0 z-[15] pointer-events-none" style={{ left: t * pps - 6, height: rows }}>
              <div className="w-3 h-3 bg-fg rounded-b-sm" style={{ clipPath: 'polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)' }} />
              <div className="absolute left-[5.5px] top-2 w-px bg-fg" style={{ height: rows - 8 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
