import React, { useEffect, useState } from 'react';
import { Trash2, Copy, Crosshair, AlignLeft, AlignCenter, AlignRight, Film, Image as ImageIco, Eye, EyeOff } from 'lucide-react';
import { Section, SliderRow, Toggle, Segmented, ColorInput, NumInput, Field } from './ui.jsx';
import { FONTS } from '../lib/overlay';
import { MusicControls } from './EditorPanels.jsx';
import { fmtTime } from '../lib/format';

const Head = ({ title, icon, children }) => (
  <div className="h-10 px-3 flex items-center gap-2 border-b border-line shrink-0">{icon}<div className="text-[12.5px] font-semibold text-fg">{title}</div><div className="ml-auto flex items-center gap-1">{children}</div></div>
);

function Timing({ o, total, t, change }) {
  return (
    <Section title="Waktu tampil">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Mulai"><NumInput value={o.start} min={0} max={o.end - 0.1} onCommit={(v) => change({ start: v })} suffix="s" /></Field>
        <Field label="Selesai"><NumInput value={o.end} min={o.start + 0.1} max={total} onCommit={(v) => change({ end: v })} suffix="s" /></Field>
      </div>
      <div className="flex gap-1.5">
        <button className="btn-soft btn-sm" onClick={() => t < o.end - 0.1 && change({ start: +t.toFixed(2) })}><Crosshair size={12} />Mulai di playhead</button>
        <button className="btn-soft btn-sm" onClick={() => t > o.start + 0.1 && change({ end: +t.toFixed(2) })}><Crosshair size={12} />Selesai di playhead</button>
      </div>
      <button className="btn-ghost btn-sm" onClick={() => change({ start: 0, end: +total.toFixed(2) })}>Sepanjang klip</button>
    </Section>
  );
}

function Transform({ o, change, image }) {
  return (
    <Section title="Posisi & transformasi">
      {image && <SliderRow label="Lebar" value={Math.round((o.w || 0.3) * 100)} min={3} max={150} onChange={(v) => change({ w: v / 100 }, true)} onCommit={(v) => change({ w: v / 100 })} fmt={(v) => `${v}%`} />}
      <SliderRow label="Posisi X" value={Math.round((o.x ?? 0.5) * 100)} min={-10} max={110} onChange={(v) => change({ x: v / 100 }, true)} onCommit={(v) => change({ x: v / 100 })} fmt={(v) => `${v}%`} resetTo={50} />
      <SliderRow label="Posisi Y" value={Math.round((o.y ?? 0.5) * 100)} min={-10} max={110} onChange={(v) => change({ y: v / 100 }, true)} onCommit={(v) => change({ y: v / 100 })} fmt={(v) => `${v}%`} resetTo={50} />
      <SliderRow label="Rotasi" value={o.rotate || 0} min={-180} max={180} onChange={(v) => change({ rotate: v }, true)} onCommit={(v) => change({ rotate: v })} fmt={(v) => `${v}°`} resetTo={0} />
      <SliderRow label="Opasitas" value={Math.round((o.opacity ?? 1) * 100)} min={0} max={100} onChange={(v) => change({ opacity: v / 100 }, true)} onCommit={(v) => change({ opacity: v / 100 })} fmt={(v) => `${v}%`} />
    </Section>
  );
}

export function TextInspector({ o, total, t, change, onDelete, onDuplicate }) {
  const [txt, setTxt] = useState(o.text || '');
  useEffect(() => setTxt(o.text || ''), [o.id, o.text]);
  const font = FONTS.find((f) => f.id === o.font) || FONTS[0];
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Teks">
        <button className="icon-btn w-7 h-7" title={o.visible === false ? 'Tampilkan' : 'Sembunyikan'} onClick={() => change({ visible: o.visible === false })}>{o.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button className="icon-btn w-7 h-7" title="Duplikat" onClick={onDuplicate}><Copy size={14} /></button>
        <button className="icon-btn w-7 h-7 hover:text-red-500" title="Hapus" onClick={onDelete}><Trash2 size={14} /></button>
      </Head>
      <div className="flex-1 overflow-y-auto">
        <Section>
          <textarea className="input text-[13px]" rows={3} value={txt} placeholder="Ketik teks…" onChange={(e) => { setTxt(e.target.value); change({ text: e.target.value }, true); }} onBlur={() => txt !== o.text && change({ text: txt })} />
        </Section>
        <Section title="Gaya">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <select className="input" value={font.id} onChange={(e) => { const f = FONTS.find((x) => x.id === e.target.value); change({ font: f.id, weight: f.weights.includes(o.weight) ? o.weight : f.weights[f.weights.length - 1] }); }}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <select className="input" value={o.weight || 700} onChange={(e) => change({ weight: +e.target.value })}>
              {font.weights.map((w) => <option key={w} value={w}>{{ 400: 'Regular', 600: 'Semibold', 700: 'Bold', 800: 'Extra', 900: 'Black' }[w] || w}</option>)}
            </select>
          </div>
          <SliderRow label="Ukuran" value={o.size || 64} min={14} max={260} onChange={(v) => change({ size: v }, true)} onCommit={(v) => change({ size: v })} />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-fg2">Warna</span>
            <ColorInput value={o.color || '#FFFFFF'} onChange={(v) => change({ color: v }, true)} onCommit={(v) => change({ color: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-fg2">Rata</span>
            <Segmented value={o.align || 'center'} onChange={(v) => change({ align: v })} options={[{ value: 'left', icon: <AlignLeft size={13} />, title: 'Kiri' }, { value: 'center', icon: <AlignCenter size={13} />, title: 'Tengah' }, { value: 'right', icon: <AlignRight size={13} />, title: 'Kanan' }]} />
          </div>
          <div className="flex items-center gap-4">
            <Toggle checked={!!o.italic} onChange={(v) => change({ italic: v })} label="Miring" />
            <Toggle checked={!!o.shadow} onChange={(v) => change({ shadow: v })} label="Bayangan" />
          </div>
        </Section>
        <Section title="Outline">
          <SliderRow label="Ketebalan" value={o.stroke || 0} min={0} max={20} onChange={(v) => change({ stroke: v }, true)} onCommit={(v) => change({ stroke: v })} />
          {(o.stroke || 0) > 0 && <div className="flex items-center justify-between"><span className="text-[12px] text-fg2">Warna outline</span><ColorInput value={o.strokeColor || '#000000'} onChange={(v) => change({ strokeColor: v }, true)} onCommit={(v) => change({ strokeColor: v })} /></div>}
        </Section>
        <Section title="Latar">
          <Toggle checked={!!o.bg} onChange={(v) => change({ bg: v ? '#000000' : '', bgOpacity: o.bgOpacity ?? 0.7 })} label="Kotak latar" />
          {!!o.bg && (<>
            <div className="flex items-center justify-between"><span className="text-[12px] text-fg2">Warna latar</span><ColorInput value={o.bg} onChange={(v) => change({ bg: v }, true)} onCommit={(v) => change({ bg: v })} /></div>
            <SliderRow label="Opasitas latar" value={Math.round((o.bgOpacity ?? 1) * 100)} min={0} max={100} onChange={(v) => change({ bgOpacity: v / 100 }, true)} onCommit={(v) => change({ bgOpacity: v / 100 })} fmt={(v) => `${v}%`} />
          </>)}
        </Section>
        <Transform o={o} change={change} />
        <Timing o={o} total={total} t={t} change={change} />
      </div>
    </div>
  );
}

export function ImageInspector({ o, asset, total, t, change, onDelete, onDuplicate }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Overlay gambar" icon={<ImageIco size={14} className="text-muted" />}>
        <button className="icon-btn w-7 h-7" title={o.visible === false ? 'Tampilkan' : 'Sembunyikan'} onClick={() => change({ visible: o.visible === false })}>{o.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button className="icon-btn w-7 h-7" title="Duplikat" onClick={onDuplicate}><Copy size={14} /></button>
        <button className="icon-btn w-7 h-7 hover:text-red-500" title="Hapus" onClick={onDelete}><Trash2 size={14} /></button>
      </Head>
      <div className="flex-1 overflow-y-auto">
        <Section><div className="text-[12px] text-fg2 truncate">{asset ? asset.name : 'File tidak ditemukan'}</div></Section>
        <Transform o={o} change={change} image />
        <Timing o={o} total={total} t={t} change={change} />
      </div>
    </div>
  );
}

export function SceneInspector({ ins, asset, change, onDelete, onMoveToPlayhead, onDuplicate }) {
  const isImg = ins.kind === 'image';
  const len = isImg ? Number(ins.dur) || 3 : (Number(ins.out) || 0) - (Number(ins.in) || 0);
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Scene sisipan" icon={isImg ? <ImageIco size={14} className="text-muted" /> : <Film size={14} className="text-muted" />}>
        <button className="icon-btn w-7 h-7" title="Duplikat" onClick={onDuplicate}><Copy size={14} /></button>
        <button className="icon-btn w-7 h-7 hover:text-red-500" title="Hapus" onClick={onDelete}><Trash2 size={14} /></button>
      </Head>
      <div className="flex-1 overflow-y-auto">
        <Section>
          <div className="text-[12.5px] font-medium text-fg truncate">{asset ? asset.name : 'File tidak ditemukan'}</div>
          <div className="text-[11.5px] text-muted">{isImg ? 'Gambar' : `Video · ${fmtTime(asset ? asset.duration : 0)}`} · durasi di timeline {len.toFixed(1)} dtk</div>
        </Section>
        <Section title="Durasi">
          {isImg ? (
            <Field label="Durasi tampil"><NumInput value={ins.dur || 3} min={0.3} max={600} step={0.5} onCommit={(v) => change({ dur: v })} suffix="dtk" /></Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Mulai dari"><NumInput value={ins.in || 0} min={0} max={(ins.out || 0) - 0.3} onCommit={(v) => change({ in: v })} suffix="s" /></Field>
              <Field label="Sampai"><NumInput value={ins.out || 0} min={(ins.in || 0) + 0.3} max={asset ? asset.duration : 1e9} onCommit={(v) => change({ out: v })} suffix="s" /></Field>
            </div>
          )}
        </Section>
        <Section title="Tampilan">
          <Segmented full value={ins.fit === 'fill' ? 'fill' : 'fit'} onChange={(v) => change({ fit: v })} options={[{ value: 'fit', label: 'Fit (latar blur)' }, { value: 'fill', label: 'Fill (crop penuh)' }]} />
          {!isImg && asset && asset.hasAudio && <Toggle checked={!ins.mute} onChange={(v) => change({ mute: !v })} label="Pakai suara scene" />}
        </Section>
        <Section title="Posisi di timeline">
          <button className="btn-soft btn-sm" onClick={onMoveToPlayhead}><Crosshair size={12} />Pindahkan ke posisi playhead</button>
          <div className="text-[11px] text-muted">Letakkan playhead di video utama, lalu klik tombol di atas.</div>
        </Section>
      </div>
    </div>
  );
}

export function MusicInspector({ music, asset, onChange }) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <Head title="Musik latar" />
      <div className="flex-1 overflow-y-auto"><Section><MusicControls music={music} asset={asset} onChange={onChange} /></Section></div>
    </div>
  );
}
