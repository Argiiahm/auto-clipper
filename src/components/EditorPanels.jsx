import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Film, Image as ImageIco, Music, Plus, Layers, FolderOpen, Copy, X } from 'lucide-react';
import { Empty, Section, SliderRow, Toggle, Segmented, ColorInput, NumInput, Field } from './ui.jsx';
import { TEXT_PRESETS, FONTS } from '../lib/overlay';
import { fileUrl } from '../lib/api';
import { cx, fmtTime } from '../lib/format';

const Head = ({ title, children }) => (
  <div className="h-10 px-3 flex items-center border-b border-line shrink-0"><div className="text-[12.5px] font-semibold text-fg">{title}</div><div className="ml-auto flex items-center gap-1">{children}</div></div>
);

/* ---------------- Media ---------------- */
export function MediaPanel({ project, onImport, onDelete, onInsertScene, onAddOverlay }) {
  const [filter, setFilter] = useState('all');
  const assets = (project.assets || []).filter((a) => a.kind !== 'audio' && (filter === 'all' || a.kind === filter));
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Media"><button className="btn-primary btn-sm" onClick={() => onImport('media')}><Upload size={13} />Impor</button></Head>
      <div className="px-3 py-2 shrink-0"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Semua' }, { value: 'video', label: 'Video' }, { value: 'image', label: 'Gambar' }]} /></div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!assets.length ? (
          <button onClick={() => onImport('media')} className="w-full mt-2 rounded-lg border border-dashed border-line hover:border-accent py-10 flex flex-col items-center gap-2 text-muted hover:text-fg transition">
            <Upload size={20} /><div className="text-[12.5px] font-medium">Impor video atau gambar</div><div className="text-[11px]">Untuk scene tambahan, intro/outro, stiker, logo</div>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((a) => {
              const th = a.kind === 'image' ? fileUrl(project.dir + '/' + a.rel) : a.thumb ? fileUrl(project.dir + '/' + a.thumb) : null;
              return (
                <div key={a.id} className="group">
                  <div className="relative aspect-square rounded-md overflow-hidden bg-stage ring-1 ring-line">
                    {th ? <img src={th} className={cx('w-full h-full', a.kind === 'image' ? 'object-contain checker' : 'object-cover')} /> : <div className="w-full h-full flex items-center justify-center text-faint"><Film size={22} /></div>}
                    <span className="absolute left-1 bottom-1 text-[10px] px-1 rounded bg-black/70 text-white flex items-center gap-1">{a.kind === 'image' ? <ImageIco size={9} /> : <Film size={9} />}{a.kind === 'video' ? fmtTime(a.duration) : 'IMG'}</span>
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1.5 p-2">
                      <button className="w-full h-7 rounded bg-white text-black text-[11px] font-semibold flex items-center justify-center gap-1" onClick={() => onInsertScene(a)}><Plus size={12} />Sisipkan scene</button>
                      {a.kind === 'image' && <button className="w-full h-7 rounded bg-white/90 text-black text-[11px] font-semibold flex items-center justify-center gap-1" onClick={() => onAddOverlay(a)}><Layers size={12} />Jadikan overlay</button>}
                      <button className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white hover:bg-red-600 flex items-center justify-center" title="Hapus dari proyek" onClick={() => onDelete(a)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-fg2 truncate" title={a.name}>{a.name}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted leading-relaxed">Scene disisipkan di posisi playhead pada video utama. Gambar bisa dipakai sebagai overlay (stiker / logo) di atas video.</div>
      </div>
    </div>
  );
}

/* ---------------- Text presets ---------------- */
export function TextPanel({ onAdd }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Teks" />
      <div className="flex-1 overflow-y-auto p-3">
        <button className="w-full h-10 rounded-md bg-panel2 border border-line hover:border-accent text-[12.5px] font-medium text-fg flex items-center justify-center gap-1.5 mb-3" onClick={() => onAdd(TEXT_PRESETS[0])}><Plus size={14} />Tambah teks</button>
        <div className="text-[11px] text-muted mb-2">Gaya</div>
        <div className="grid grid-cols-3 gap-2">
          {TEXT_PRESETS.map((p) => {
            const s = p.style;
            const stroke = s.stroke ? Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `${(Math.cos(a) * 1.4).toFixed(1)}px ${(Math.sin(a) * 1.4).toFixed(1)}px 0 ${s.strokeColor}`; }).join(',') : s.glow ? `0 0 6px ${s.glow}, 0 0 12px ${s.glow}` : s.shadow ? '0 2px 4px rgba(0,0,0,.6)' : 'none';
            return (
              <button key={p.id} onClick={() => onAdd(p)} className="aspect-square rounded-md bg-[#2a2b33] hover:ring-2 hover:ring-accent flex flex-col items-center justify-center gap-1 transition" title={p.label}>
                <span style={{ fontFamily: s.font, fontWeight: s.weight, fontSize: s.font === 'Bangers' ? 22 : 17, color: s.color, textShadow: stroke, background: s.bg ? s.bg : undefined, opacity: 1, padding: s.bg ? '0 5px' : 0, borderRadius: 3 }}>Teks</span>
                <span className="text-[9.5px] text-white/60">{p.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-muted leading-relaxed">Teks ditambahkan di posisi playhead. Geser langsung di pemutar, atur durasinya di timeline.</div>
      </div>
    </div>
  );
}

/* ---------------- Audio ---------------- */
export function MusicControls({ music, asset, onChange }) {
  if (!music) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2 rounded-md bg-panel2 border border-line">
        <div className="w-8 h-8 rounded bg-emerald-600 text-white flex items-center justify-center shrink-0"><Music size={14} /></div>
        <div className="min-w-0 flex-1"><div className="text-[12px] font-medium text-fg truncate">{asset ? asset.name : 'Musik'}</div><div className="text-[11px] text-muted">{asset ? fmtTime(asset.duration) : ''} · diulang otomatis</div></div>
        <button className="icon-btn w-7 h-7" title="Hapus musik" onClick={() => onChange(null)}><X size={14} /></button>
      </div>
      <SliderRow label="Volume musik" value={Math.round((music.volume ?? 0.5) * 100)} min={0} max={200} onChange={(v) => onChange({ volume: v / 100 }, true)} onCommit={(v) => onChange({ volume: v / 100 })} fmt={(v) => `${v}%`} />
      <SliderRow label="Volume suara asli" value={Math.round((music.sourceVolume ?? 1) * 100)} min={0} max={200} onChange={(v) => onChange({ sourceVolume: v / 100 }, true)} onCommit={(v) => onChange({ sourceVolume: v / 100 })} fmt={(v) => `${v}%`} />
      <Field label="Mulai musik dari detik ke-"><NumInput value={music.offset || 0} min={0} step={1} digits={1} onCommit={(v) => onChange({ offset: v })} suffix="dtk" /></Field>
    </div>
  );
}

export function AudioPanel({ project, music, onImport, onUse, onDelete, onMusicChange }) {
  const auds = (project.assets || []).filter((a) => a.kind === 'audio');
  const cur = music && (project.assets || []).find((a) => a.id === music.asset);
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Audio"><button className="btn-primary btn-sm" onClick={() => onImport('audio')}><Upload size={13} />Impor</button></Head>
      <div className="flex-1 overflow-y-auto">
        {music && <Section title="Musik latar klip ini"><MusicControls music={music} asset={cur} onChange={onMusicChange} /></Section>}
        <div className="p-3 space-y-1.5">
          <div className="text-[11px] text-muted mb-1">File audio proyek</div>
          {!auds.length && <Empty icon={<Music size={20} />}>Impor mp3 / wav / m4a untuk musik latar.</Empty>}
          {auds.map((a) => (
            <div key={a.id} className={cx('flex items-center gap-2 p-2 rounded-md border transition', music && music.asset === a.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover')}>
              <Music size={14} className="text-muted shrink-0" />
              <div className="min-w-0 flex-1"><div className="text-[12px] text-fg truncate">{a.name}</div><div className="text-[10.5px] text-muted">{fmtTime(a.duration)}</div></div>
              <button className="btn-soft btn-sm" onClick={() => onUse(a)}>{music && music.asset === a.id ? 'Dipakai' : 'Pakai'}</button>
              <button className="icon-btn w-7 h-7" onClick={() => onDelete(a)} title="Hapus"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Watermark (global) ---------------- */
const POS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export function WatermarkPanel({ wm, setWm, pickImage, clipShows, setClipShows }) {
  const w = wm || {};
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Watermark" />
      <div className="flex-1 overflow-y-auto">
        <Section>
          <Toggle checked={!!w.enabled} onChange={(v) => setWm({ enabled: v })} label="Aktifkan watermark" />
          <div className="text-[11px] text-muted -mt-1">Berlaku untuk semua klip & proyek. Bisa dimatikan per klip.</div>
          <Toggle checked={clipShows} onChange={setClipShows} label="Tampilkan di klip ini" />
        </Section>
        <div className={cx(!w.enabled && 'opacity-45 pointer-events-none')}>
          <Section title="Isi">
            <Segmented full value={w.type || 'text'} onChange={(v) => setWm({ type: v })} options={[{ value: 'text', label: 'Teks' }, { value: 'image', label: 'Logo / gambar' }]} />
            {(w.type || 'text') === 'text' ? (<>
              <input className="input" value={w.text || ''} placeholder="@username" onChange={(e) => setWm({ text: e.target.value }, true)} onBlur={(e) => setWm({ text: e.target.value })} />
              <select className="input" value={w.font || 'Montserrat'} onChange={(e) => setWm({ font: e.target.value, weight: (FONTS.find((f) => f.id === e.target.value) || {}).weights.slice(-1)[0] })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              <div className="flex items-center justify-between"><span className="text-[12px] text-fg2">Warna</span><ColorInput value={w.color || '#FFFFFF'} onChange={(v) => setWm({ color: v }, true)} onCommit={(v) => setWm({ color: v })} /></div>
              <SliderRow label="Ukuran" value={w.size || 46} min={16} max={140} onChange={(v) => setWm({ size: v }, true)} onCommit={(v) => setWm({ size: v })} />
              <div className="flex items-center gap-4">
                <Toggle checked={!!w.shadow} onChange={(v) => setWm({ shadow: v })} label="Bayangan" />
                <Toggle checked={(w.stroke || 0) > 0} onChange={(v) => setWm({ stroke: v ? 3 : 0 })} label="Outline" />
              </div>
            </>) : (<>
              <div className="flex items-center gap-2">
                <div className="w-16 h-16 rounded-md checker ring-1 ring-line overflow-hidden flex items-center justify-center">{w.image ? <img src={fileUrl(w.image)} className="max-w-full max-h-full object-contain" /> : <ImageIco size={18} className="text-white/50" />}</div>
                <button className="btn-soft btn-sm" onClick={pickImage}><FolderOpen size={13} />{w.image ? 'Ganti logo' : 'Pilih logo'}</button>
              </div>
              <SliderRow label="Lebar" value={Math.round((w.imageW || 0.22) * 100)} min={4} max={80} onChange={(v) => setWm({ imageW: v / 100 }, true)} onCommit={(v) => setWm({ imageW: v / 100 })} fmt={(v) => `${v}%`} />
            </>)}
          </Section>
          <Section title="Posisi">
            <div className="grid grid-cols-3 gap-1 w-[120px]">
              {POS.map((p) => <button key={p} onClick={() => setWm({ pos: p })} className={cx('h-9 rounded border flex items-center justify-center', (w.pos || 'tr') === p ? 'border-accent bg-accent/15' : 'border-line bg-panel2 hover:bg-hover')}><span className={cx('w-2 h-2 rounded-full', (w.pos || 'tr') === p ? 'bg-accent' : 'bg-faint')} /></button>)}
            </div>
            <SliderRow label="Jarak tepi" value={w.margin ?? 48} min={0} max={240} onChange={(v) => setWm({ margin: v }, true)} onCommit={(v) => setWm({ margin: v })} />
            <SliderRow label="Opasitas" value={Math.round((w.opacity ?? 0.8) * 100)} min={5} max={100} onChange={(v) => setWm({ opacity: v / 100 }, true)} onCommit={(v) => setWm({ opacity: v / 100 })} fmt={(v) => `${v}%`} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Adjust ---------------- */
export function AdjustPanel({ adjust, onChange, selectedCount, onApplyAll }) {
  const a = adjust || {};
  const row = (k, label) => (
    <SliderRow key={k} label={label} value={Number(a[k]) || 0} min={-100} max={100} resetTo={0}
      onChange={(v) => onChange({ [k]: v }, true)} onCommit={(v) => onChange({ [k]: v })} />
  );
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Penyesuaian warna" />
      <div className="flex-1 overflow-y-auto">
        <Section>
          {row('brightness', 'Kecerahan')}
          {row('contrast', 'Kontras')}
          {row('saturation', 'Saturasi')}
          <div className="flex items-center gap-2 pt-1">
            <button className="btn-soft btn-sm" onClick={() => onChange({ brightness: 0, contrast: 0, saturation: 0 })}>Reset semua</button>
            {selectedCount > 1 && <button className="btn-soft btn-sm" onClick={onApplyAll}><Copy size={12} />Terapkan ke {selectedCount} terpilih</button>}
          </div>
          <div className="text-[11px] text-muted">Berlaku untuk seluruh video utama klip ini (termasuk scene sisipan).</div>
        </Section>
      </div>
    </div>
  );
}
