import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, ImageIcon, Wand2, FolderOpen, SkipBack, SkipForward } from 'lucide-react';
import { drawLayout } from '../lib/draw';
import { activeAt, containerStyle, wordStyle } from '../lib/captions';
import { drawOverlays, drawWatermark, overlayBox, cachedImage } from '../lib/overlay';
import { adjustFactors, adjustIsDefault } from '../lib/sequence';
import { fileUrl } from '../lib/api';
import { cx, fmtTime } from '../lib/format';
import { Spinner } from './ui.jsx';

function CaptionOverlay({ clip, groups, t, scale }) {
  const a = activeAt(groups, t);
  if (!a || !clip.burnCaptions) return null;
  const isClean = clip.captionStyle === 'clean';
  return (
    <div className="absolute left-0 top-0 pointer-events-none" style={{ width: 1080, height: 1920, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
      <div className="absolute left-[60px] right-[60px]" style={{ top: `${clip.captionPos}%`, transform: 'translateY(-50%)' }}>
        <div style={containerStyle(clip.captionStyle)}>
          {a.group.words.map((w, i) => (
            <React.Fragment key={i}>
              <span className="cap-word" style={wordStyle(clip.captionStyle, !isClean && i === a.ai)}>{w.w}</span>{i < a.group.words.length - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

const tc = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); const r = s - m * 60; return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`; };

export default function Player({ project, clip, seq, groups, player, videoRef, insRef, musicRef, view, setView, overlays, selection, setSelection, onOverlayChange,
  imgs, assetUrl, watermark, wmUrl, adjust, splitRatio, onGenThumb, genBusy, onShow, vol, setVol, muted, setMuted, sourceVolume }) {
  const baseRef = useRef(null); const ovRef = useRef(null); const stageRef = useRef(null);
  const measure = useMemo(() => document.createElement('canvas').getContext('2d'), []);
  const [box, setBox] = useState({ w: 270, h: 480 });
  const [guides, setGuides] = useState({ v: false, h: false });
  const [drag, setDrag] = useState(null);
  const src = project.video ? fileUrl(project.dir + '/' + project.video.path) : '';
  const st = useRef({}); st.current = { clip, seq, overlays, watermark, wmUrl, imgs, webcam: project.webcam, splitRatio, assetUrl };
  const { t, playing, toggle, seek } = player;
  const scale = box.w / 1080;

  // fit 9:16 frame in stage
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth - 24, H = el.clientHeight - 24;
      let h = Math.max(200, H); let w = (h * 9) / 16;
      if (w > W) { w = Math.max(120, W); h = (w * 16) / 9; }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el); return () => ro.disconnect();
  }, [view]);

  // volumes
  useEffect(() => {
    const v = videoRef.current; const iv = insRef.current; const m = musicRef.current;
    if (v) { v.volume = Math.min(1, vol * (sourceVolume ?? 1)); v.muted = muted; }
    if (iv) { iv.volume = vol; iv.muted = muted || iv.dataset.mute === '1'; }
    if (m) { m.volume = Math.min(1, vol * ((st.current.clip && st.current.clip.edit && st.current.clip.edit.music && st.current.clip.edit.music.volume) ?? 0.5)); m.muted = muted; }
  });

  // draw loop
  useEffect(() => {
    if (view !== 'preview') return;
    let raf;
    const loop = () => {
      const s = st.current; const c = baseRef.current; const o = ovRef.current;
      if (c && o && s.clip) {
        const ctx = c.getContext('2d');
        const it = player.curRef.current;
        const tt = player.tRef.current;
        if (it && it.type === 'src') {
          const v = videoRef.current;
          if (v && v.readyState >= 2) drawLayout(ctx, v, c.width, c.height, s.clip, s.webcam, s.splitRatio);
        } else if (it && it.type === 'ins') {
          const fit = { layout: it.ins.fit === 'fill' ? 'fill' : 'fit', focusX: 0.5 };
          if (it.ins.kind === 'image') { const img = cachedImage(s.assetUrl(it.ins.asset)); if (img) drawLayout(ctx, img, c.width, c.height, fit); }
          else { const iv = insRef.current; if (iv && iv.readyState >= 2) drawLayout(ctx, iv, c.width, c.height, fit); }
        }
        const octx = o.getContext('2d');
        octx.clearRect(0, 0, o.width, o.height);
        const k = o.width / 1080;
        drawOverlays(octx, s.overlays, tt, k, s.imgs);
        drawWatermark(octx, s.watermark, k, s.wmUrl ? cachedImage(s.wmUrl) : null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view]);

  // keyboard: space
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); if (view === 'preview') toggle(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [toggle, view]);

  const visible = (overlays || []).filter((o) => o.visible !== false && t >= o.start && t < o.end);
  const selOv = selection && selection.type === 'ov' ? visible.find((o) => o.id === selection.id) : null;
  const selBox = selOv ? overlayBox(measure, selOv, imgs) : null;

  const onDown = (e) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 1080, py = ((e.clientY - r.top) / r.height) * 1920;
    let hit = null;
    for (let i = visible.length - 1; i >= 0; i--) {
      const b = overlayBox(measure, visible[i], imgs);
      if (Math.abs(px - b.cx) <= b.w / 2 + 10 && Math.abs(py - b.cy) <= b.h / 2 + 10) { hit = visible[i]; break; }
    }
    if (hit) {
      setSelection({ type: 'ov', id: hit.id });
      setDrag({ mode: 'move', id: hit.id, sx: e.clientX, sy: e.clientY, ox: hit.x ?? 0.5, oy: hit.y ?? 0.5, rw: r.width, rh: r.height });
    } else if (selection) setSelection(null);
    else toggle();
  };
  const onScaleDown = (e, o) => {
    e.stopPropagation();
    const r = e.currentTarget.closest('[data-frame]').getBoundingClientRect();
    const cx0 = r.left + (o.x ?? 0.5) * r.width, cy0 = r.top + (o.y ?? 0.5) * r.height;
    const d0 = Math.hypot(e.clientX - cx0, e.clientY - cy0) || 1;
    setDrag({ mode: 'scale', id: o.id, cx0, cy0, d0, size: o.size || 64, w: o.w || 0.3, type: o.type });
  };
  useEffect(() => {
    if (!drag) return;
    let last = null;
    const mv = (e) => {
      if (drag.mode === 'move') {
        let x = drag.ox + (e.clientX - drag.sx) / drag.rw; let y = drag.oy + (e.clientY - drag.sy) / drag.rh;
        const sv = Math.abs(x - 0.5) * drag.rw < 6; const sh = Math.abs(y - 0.5) * drag.rh < 6;
        if (sv) x = 0.5; if (sh) y = 0.5;
        setGuides({ v: sv, h: sh });
        last = { x: +x.toFixed(4), y: +y.toFixed(4) };
      } else {
        const f = Math.max(0.1, Math.hypot(e.clientX - drag.cx0, e.clientY - drag.cy0) / drag.d0);
        last = drag.type === 'image' ? { w: +Math.max(0.03, Math.min(2, drag.w * f)).toFixed(4) } : { size: Math.round(Math.max(12, Math.min(400, drag.size * f))) };
      }
      onOverlayChange(drag.id, last, true);
    };
    const up = () => { if (last) onOverlayChange(drag.id, last, false); setDrag(null); setGuides({ v: false, h: false }); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [drag]);

  const af = adjustFactors(adjust);
  const baseFilter = adjustIsDefault(adjust) ? undefined : `brightness(${af.b}) contrast(${af.c}) saturate(${af.s})`;
  const rendered = clip && clip.render && clip.render.status === 'done' ? project.dir + '/' + clip.render.path : null;
  const thumb = clip && clip.thumbnail ? project.dir + '/' + clip.thumbnail : null;
  const frameStyle = { width: box.w, height: box.h };

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-panel border-x border-line">
      <video ref={videoRef} src={src} className="hidden" preload="auto" playsInline />
      <video ref={insRef} className="hidden" preload="auto" playsInline />
      <audio ref={musicRef} className="hidden" preload="auto" />
      <div className="h-10 px-3 flex items-center border-b border-line shrink-0">
        <div className="text-[12.5px] font-medium text-fg">Pemutar</div>
        <div className="ml-auto inline-flex p-0.5 rounded-md bg-panel2 border border-line">
          {[['preview', 'Pratinjau'], ['rendered', 'Hasil ekspor'], ['thumbnail', 'Thumbnail']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={cx('h-6 px-2.5 rounded text-[11.5px] font-medium transition', view === k ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg', k === 'rendered' && !rendered && view !== k && 'opacity-60')}>{l}</button>
          ))}
        </div>
      </div>

      <div ref={stageRef} className="flex-1 min-h-0 bg-stage flex items-center justify-center overflow-hidden relative">
        {!clip ? <div className="text-muted text-[12.5px]">Pilih klip di panel kiri</div> : view === 'preview' ? (
          <div data-frame className="relative bg-black shadow-pop" style={frameStyle} onMouseDown={onDown}>
            <canvas ref={baseRef} width={540} height={960} className="absolute inset-0 w-full h-full" style={{ filter: baseFilter }} />
            <CaptionOverlay clip={clip} groups={groups} t={t} scale={scale} />
            <canvas ref={ovRef} width={720} height={1280} className="absolute inset-0 w-full h-full pointer-events-none" />
            {guides.v && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-accent pointer-events-none" />}
            {guides.h && <div className="absolute left-0 right-0 top-1/2 h-px bg-accent pointer-events-none" />}
            {selOv && selBox && (
              <div className="absolute border border-accent pointer-events-none" style={{ left: (selBox.cx - selBox.w / 2) * scale - 3, top: (selBox.cy - selBox.h / 2) * scale - 3, width: selBox.w * scale + 6, height: selBox.h * scale + 6, transform: selOv.rotate ? `rotate(${selOv.rotate}deg)` : undefined }}>
                <div className="absolute -right-[6px] -bottom-[6px] w-3 h-3 rounded-full bg-white border-2 border-accent pointer-events-auto cursor-nwse-resize" onMouseDown={(e) => onScaleDown(e, selOv)} />
                <div className="absolute -left-[4px] -top-[4px] w-2 h-2 rounded-full bg-white border border-accent" />
                <div className="absolute -right-[4px] -top-[4px] w-2 h-2 rounded-full bg-white border border-accent" />
                <div className="absolute -left-[4px] -bottom-[4px] w-2 h-2 rounded-full bg-white border border-accent" />
              </div>
            )}
          </div>
        ) : view === 'rendered' ? (
          rendered ? <video key={rendered} src={fileUrl(rendered)} controls autoPlay className="bg-black shadow-pop" style={frameStyle} />
            : <div className="text-muted text-center text-[12.5px]">Klip ini belum diekspor.<br />Centang klip lalu klik Ekspor.</div>
        ) : (
          thumb ? <img key={thumb + (clip.thumbAt || '')} src={fileUrl(thumb) + '?v=' + (clip.thumbAt || '')} className="object-contain bg-black shadow-pop" style={frameStyle} />
            : <div className="border border-dashed border-faint rounded flex flex-col items-center justify-center text-muted gap-2 text-center p-6 text-[12.5px]" style={frameStyle}><ImageIcon size={26} />Belum ada thumbnail.<br />Atur frame di Pratinjau, isi headline, lalu Generate.</div>
        )}
      </div>

      {/* controls */}
      <div className="h-11 px-3 flex items-center gap-2 border-t border-line shrink-0">
        {view === 'preview' ? (<>
          <span className="font-mono text-[11.5px] text-accent-300 w-[72px]">{tc(t)}</span>
          <span className="font-mono text-[11.5px] text-muted">/ {tc(seq.total)}</span>
          <div className="flex-1 flex items-center justify-center gap-1">
            <button className="icon-btn w-7 h-7" title="Ke awal" onClick={() => seek(0)}><SkipBack size={14} /></button>
            <button className="w-8 h-8 rounded-full bg-fg text-bg flex items-center justify-center hover:opacity-90" onClick={toggle} title="Putar / jeda (Spasi)">{playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}</button>
            <button className="icon-btn w-7 h-7" title="Ke akhir" onClick={() => seek(seq.total - 0.05)}><SkipForward size={14} /></button>
          </div>
          <button className="icon-btn w-7 h-7" onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          <input type="range" className="w-20 range-fill" style={{ '--p': `${vol * 100}%` }} min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
          <span className="text-[11px] text-muted ml-1 px-1.5 py-0.5 rounded border border-line">9:16</span>
        </>) : view === 'rendered' ? (
          rendered ? <button className="btn-soft btn-sm mx-auto" onClick={() => onShow(rendered)}><FolderOpen size={13} />Tampilkan di folder</button> : <div />
        ) : (
          <div className="mx-auto flex gap-2">
            <button className="btn-primary btn-sm" disabled={genBusy || !clip} onClick={onGenThumb}>{genBusy ? <Spinner size={12} /> : <Wand2 size={13} />}Generate dari frame saat ini</button>
            {thumb && <button className="btn-soft btn-sm" onClick={() => onShow(thumb)}><FolderOpen size={13} />Folder</button>}
          </div>
        )}
      </div>
    </div>
  );
}
