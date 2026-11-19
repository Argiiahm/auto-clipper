import React, { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, Sparkles, Crosshair, Copy, Webcam } from 'lucide-react';
import { Check, Slider, Spinner, Tabs, Section, Toggle } from './ui.jsx';
import { CAPTION_STYLES, STYLE_IDS, containerStyle, wordStyle } from '../lib/captions';
import { cx, fmtTime, scoreColor } from '../lib/format';

function TimeRow({ label, value, onSet, onPlayhead }) {
  const [txt, setTxt] = useState(value.toFixed(2));
  useEffect(() => setTxt(value.toFixed(2)), [value]);
  const commit = () => { const v = parseFloat(txt); if (isFinite(v)) onSet(v); else setTxt(value.toFixed(2)); };
  return (
    <div>
      <div className="text-[11.5px] text-muted mb-1">{label} <span className="font-mono text-faint ml-1">{fmtTime(value, true)}</span></div>
      <div className="flex gap-1">
        <input className="input font-mono" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
        <button className="btn-soft w-8 px-0" onClick={() => onSet(value - 0.5)} title="-0.5 dtk"><Minus size={14} strokeWidth={2.5} /></button>
        <button className="btn-soft w-8 px-0" onClick={() => onSet(value + 0.5)} title="+0.5 dtk"><Plus size={14} strokeWidth={2.5} /></button>
        <button className="btn-soft px-2" onClick={onPlayhead} title="Pakai posisi playhead"><Crosshair size={13} />Playhead</button>
      </div>
    </div>
  );
}

const LayoutIcon = ({ kind }) => (
  <div className="w-6 h-10 rounded-[3px] overflow-hidden border border-faint bg-panel2 flex flex-col">
    {kind === 'split' && <><div className="h-[42%] bg-amber-400" /><div className="flex-1 bg-accent" /></>}
    {kind === 'fill' && <div className="flex-1 bg-accent" />}
    {kind === 'fit' && <><div className="flex-1 bg-accent/30" /><div className="h-[34%] bg-accent" /><div className="flex-1 bg-accent/30" /></>}
  </div>
);

function StyleCard({ id, active, onClick }) {
  const words = ['THIS', 'IS', 'INSANE'];
  const st = CAPTION_STYLES[id];
  const cs = containerStyle(id);
  return (
    <button onClick={onClick} className={cx('relative h-[64px] rounded-md border-2 overflow-hidden transition', active ? 'border-accent' : 'border-transparent hover:border-faint')}
      style={{ background: 'linear-gradient(135deg,#2a2d3e,#1a1b26 60%,#23202e)' }}>
      <div className="absolute inset-0 flex items-center justify-center" style={{ ...cs, fontSize: st.clean ? 12 : st.font === 'Bangers' ? 18 : 14 }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          {words.map((w, i) => {
            const ws = wordStyle(id, !st.clean && i === 1);
            const shrink = (ws.textShadow || '').replace(/(-?\d+(\.\d+)?)px/g, (m, n) => `${(parseFloat(n) * 0.22).toFixed(2)}px`);
            return <React.Fragment key={i}><span className="cap-word" style={{ ...ws, textShadow: shrink }}>{st.upper ? w : w.toLowerCase().replace(/^t/, 'T')}</span>{i < 2 ? ' ' : ''}</React.Fragment>;
          })}
        </div>
      </div>
      <span className="absolute left-1 bottom-1 text-[9.5px] font-semibold px-1 rounded bg-black/60 text-white">{st.label}</span>
    </button>
  );
}

const ApplyAll = ({ n, onClick }) => n > 1 ? <button className="text-[11px] text-accent-300 hover:underline inline-flex items-center gap-1" onClick={onClick}><Copy size={11} />Terapkan ke {n} terpilih</button> : null;

export default function ClipPanel({ project, clip, patch, videoRef, onDelete, onAiTitle, aiBusy, openWebcam, onApplyAll, selectedCount, tab, setTab }) {
  const [title, setTitle] = useState(clip.title);
  const [desc, setDesc] = useState(clip.description || '');
  const [headline, setHeadline] = useState(clip.thumbHeadline || '');
  useEffect(() => { setTitle(clip.title); setDesc(clip.description || ''); setHeadline(clip.thumbHeadline || ''); }, [clip.id, clip.title, clip.description, clip.thumbHeadline]);

  const dur = project.video ? project.video.duration : 1e9;
  const len = clip.end - clip.start;
  const setStart = (v) => { v = Math.max(0, Math.min(v, clip.end - 1)); patch({ start: +v.toFixed(2) }); };
  const setEnd = (v) => { v = Math.min(dur, Math.max(v, clip.start + 1)); patch({ end: +v.toFixed(2) }); };
  const playhead = () => (videoRef.current ? videoRef.current.currentTime : 0);
  const hasWebcam = !!(project.webcam && project.webcam.w);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <Tabs value={tab} onChange={setTab} className="px-2" tabs={[['clip', 'Klip'], ['layout', 'Layout'], ['subs', 'Subtitle'], ['thumb', 'Thumbnail']]} />
      <div className="flex-1 overflow-y-auto">
        {tab === 'clip' && (<>
          <Section title="Judul & deskripsi" right={clip.score != null && <span className={cx('text-[11px] px-1.5 py-0.5 rounded font-semibold', scoreColor(clip.score))}>Skor {clip.score}</span>}>
            <textarea className="input text-[13px] font-semibold" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== clip.title && patch({ title })} />
            <textarea className="input text-[12.5px]" rows={3} placeholder="Deskripsi / caption postingan" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== clip.description && patch({ description: desc })} />
            <button className="btn-soft btn-sm" onClick={onAiTitle} disabled={aiBusy}>{aiBusy ? <Spinner size={12} /> : <Sparkles size={13} />}Tulis ulang judul dengan AI</button>
          </Section>
          <Section title="Rentang video sumber">
            <TimeRow label="Start (dtk)" value={clip.start} onSet={setStart} onPlayhead={() => setStart(playhead())} />
            <TimeRow label="End (dtk)" value={clip.end} onSet={setEnd} onPlayhead={() => setEnd(playhead())} />
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted">Panjang <b className={cx(len > 180 || len < 3 ? 'text-red-500' : 'text-fg')}>{len.toFixed(1)} dtk</b> <span className="text-faint">(3–180)</span></span>
              <button className="btn-danger btn-sm" onClick={onDelete}><Trash2 size={13} />Hapus klip</button>
            </div>
          </Section>
        </>)}

        {tab === 'layout' && (
          <Section title="Layout" right={<ApplyAll n={selectedCount} onClick={() => onApplyAll({ layout: clip.layout, focusX: clip.focusX })} />}>
            <div className="grid grid-cols-3 gap-2">
              {[['split', 'Split', 'Webcam di atas'], ['fill', 'Fill', 'Crop penuh'], ['fit', 'Fit', 'Seluruh frame']].map(([k, n, d]) => (
                <button key={k} onClick={() => { if (k === 'split' && !hasWebcam) { openWebcam(); return; } patch({ layout: k, layoutTouched: true }); }}
                  className={cx('rounded-md border p-2.5 flex flex-col items-center gap-1.5 transition', clip.layout === k ? 'border-accent bg-accent/10' : 'border-line hover:border-faint bg-panel2')}>
                  <LayoutIcon kind={k} />
                  <div className="text-[12px] font-semibold text-fg">{n}</div>
                  <div className="text-[10px] text-muted -mt-1">{k === 'split' && !hasWebcam ? 'Tandai webcam' : d}</div>
                </button>
              ))}
            </div>
            {clip.layout !== 'fit' && (
              <div>
                <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Focus X (geser area crop)</span><span className="font-mono text-muted">{Math.round(clip.focusX * 100)}%</span></div>
                <Slider value={clip.focusX * 100} onChange={(v) => patch({ focusX: v / 100 }, true)} onCommit={(v) => patch({ focusX: v / 100 })} />
              </div>
            )}
            <button className="btn-soft btn-sm" onClick={openWebcam} disabled={!project.video}><Webcam size={13} />{hasWebcam ? 'Ubah area webcam' : 'Tandai area webcam'}</button>
          </Section>
        )}

        {tab === 'subs' && (
          <Section title="Subtitle otomatis" right={<ApplyAll n={selectedCount} onClick={() => onApplyAll({ captionStyle: clip.captionStyle, captionPos: clip.captionPos, burnCaptions: clip.burnCaptions, wordsPerLine: clip.wordsPerLine })} />}>
            <Toggle checked={clip.burnCaptions} onChange={(v) => patch({ burnCaptions: v })} label="Tampilkan subtitle (burn-in)" />
            <div className={cx('grid grid-cols-2 gap-2 transition', !clip.burnCaptions && 'opacity-40 pointer-events-none')}>
              {STYLE_IDS.map((id) => <StyleCard key={id} id={id} active={clip.captionStyle === id} onClick={() => patch({ captionStyle: id })} />)}
            </div>
            <div className={cx(!clip.burnCaptions && 'opacity-40 pointer-events-none', 'space-y-3')}>
              <div>
                <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Posisi vertikal</span><span className="font-mono text-muted">{Math.round(clip.captionPos)}%</span></div>
                <Slider min={10} max={95} value={clip.captionPos} onChange={(v) => patch({ captionPos: v }, true)} onCommit={(v) => patch({ captionPos: v })} />
              </div>
              <div>
                <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Kata per baris</span><span className="font-mono text-muted">{clip.wordsPerLine || 3}</span></div>
                <Slider min={1} max={5} value={clip.wordsPerLine || 3} onChange={(v) => patch({ wordsPerLine: v }, true)} onCommit={(v) => patch({ wordsPerLine: v })} />
              </div>
            </div>
          </Section>
        )}

        {tab === 'thumb' && (
          <Section title="Thumbnail" right={<span className={cx('text-[10.5px] px-1.5 py-0.5 rounded font-semibold', clip.thumbnail ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300')}>{clip.thumbnail ? 'Sudah dibuat' : 'Belum dibuat'}</span>}>
            <div>
              <div className="flex justify-between text-[12px] text-fg2 mb-1"><span>Headline</span><span className="text-muted">{headline.length}/120</span></div>
              <input className="input" maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={() => headline !== clip.thumbHeadline && patch({ thumbHeadline: headline })} placeholder="Judul besar di thumbnail" />
            </div>
            <div className="text-[11.5px] text-muted">Buka tab <b className="text-fg">Thumbnail</b> di pemutar untuk generate dari frame yang sedang tampil.</div>
          </Section>
        )}
      </div>
    </div>
  );
}
