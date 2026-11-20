import React, { useEffect, useState } from 'react';
import { Minus, Plus, Trash2, Sparkles, Crosshair, Copy, Webcam, Edit3, Check as CheckIco, Replace, Type, Search, SlidersHorizontal } from 'lucide-react';
import { Check, Slider, Spinner, Tabs, Section, Toggle, Segmented } from './ui.jsx';
import { CAPTION_STYLES, STYLE_IDS, containerStyle, wordStyle } from '../lib/captions';
import { cx, fmtTime, scoreColor } from '../lib/format';

function SubtitleWordEditor({ groups = [], onUpdateWord, onUpdateSentence, onReplaceWords }) {
  const [editingWordIdx, setEditingWordIdx] = useState(null);
  const [wordVal, setWordVal] = useState('');
  const [editingLineIdx, setEditingLineIdx] = useState(null);
  const [lineVal, setLineVal] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [busy, setBusy] = useState(false);

  const startEditWord = (w) => {
    if (w.origIdx == null) return;
    setEditingLineIdx(null);
    setEditingWordIdx(w.origIdx);
    setWordVal(w.rawW || w.w || '');
  };

  const commitWord = (idx) => {
    if (idx != null && wordVal.trim() && onUpdateWord) {
      onUpdateWord(idx, wordVal.trim());
    }
    setEditingWordIdx(null);
  };

  const startEditLine = (gi, g) => {
    setEditingWordIdx(null);
    setEditingLineIdx(gi);
    setLineVal(g.words.map((w) => w.rawW || w.w).join(' '));
  };

  const commitLine = (g) => {
    if (lineVal.trim() && onUpdateSentence) {
      onUpdateSentence(g.words, lineVal.trim());
    }
    setEditingLineIdx(null);
  };

  const doReplace = async () => {
    if (!findText.trim() || !onReplaceWords) return;
    setBusy(true);
    try {
      await onReplaceWords(findText.trim(), replaceText.trim());
      setFindText('');
      setReplaceText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Find & Replace card */}
      <div className="p-3 rounded-lg border border-line bg-panel2 space-y-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
          <Replace size={13} className="text-accent" />
          <span>Cari & Ganti Kata Typo</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <input
            className="input text-[12px] font-mono"
            placeholder="Cari kata typo…"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
          />
          <input
            className="input text-[12px] font-mono"
            placeholder="Ganti dengan…"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
        </div>
        <button
          className="btn-soft btn-sm w-full justify-center"
          disabled={!findText.trim() || busy}
          onClick={doReplace}
        >
          {busy ? <Spinner size={12} /> : <CheckIco size={12} />}
          Ganti di Seluruh Transkrip
        </button>
      </div>

      {/* Words per group */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11.5px] text-muted">
          <span>Daftar dialog ({groups.length} baris)</span>
          <span className="text-[10.5px]">Klik kata untuk koreksi langsung</span>
        </div>

        {!groups.length ? (
          <div className="text-muted text-center py-4 text-[12px] border border-dashed border-line rounded">
            Tidak ada ucapan di rentang klip ini
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {groups.map((g, gi) => {
              const isEditingThisLine = editingLineIdx === gi;
              return (
                <div key={gi} className="p-2 rounded border border-line bg-panel2/60 hover:bg-panel2 transition">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10.5px] text-accent-300">
                      {fmtTime(g.start)} – {fmtTime(g.end)}
                    </span>
                    <button
                      className="text-[11px] text-muted hover:text-fg inline-flex items-center gap-1 px-1 rounded hover:bg-hover"
                      onClick={() => isEditingThisLine ? commitLine(g) : startEditLine(gi, g)}
                      title="Edit seluruh baris ini"
                    >
                      {isEditingThisLine ? <CheckIco size={11} className="text-emerald-500" /> : <Edit3 size={11} />}
                      <span>{isEditingThisLine ? 'Selesai' : 'Edit baris'}</span>
                    </button>
                  </div>

                  {isEditingThisLine ? (
                    <div className="flex gap-1.5">
                      <input
                        className="input text-[12.5px] flex-1 font-medium"
                        value={lineVal}
                        onChange={(e) => setLineVal(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && commitLine(g)}
                        autoFocus
                      />
                      <button className="btn-primary btn-sm px-2.5" onClick={() => commitLine(g)}>
                        <CheckIco size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 items-center">
                      {g.words.map((w, wi) => {
                        const isEditingThisWord = editingWordIdx === w.origIdx;
                        if (isEditingThisWord) {
                          return (
                            <input
                              key={wi}
                              className="input text-[12px] h-6 px-1.5 w-24 font-semibold text-accent border-accent"
                              value={wordVal}
                              onChange={(e) => setWordVal(e.target.value)}
                              onBlur={() => commitWord(w.origIdx)}
                              onKeyDown={(e) => e.key === 'Enter' && commitWord(w.origIdx)}
                              autoFocus
                            />
                          );
                        }
                        return (
                          <button
                            key={wi}
                            onClick={() => startEditWord(w)}
                            className="px-1.5 py-0.5 rounded text-[12px] bg-hover hover:bg-accent/20 hover:text-accent-300 transition text-fg2 font-medium"
                            title="Klik untuk edit kata ini"
                          >
                            {w.rawW || w.w}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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

export default function ClipPanel({ project, clip, patch, videoRef, onDelete, onAiTitle, aiBusy, openWebcam, onApplyAll, selectedCount, tab, setTab, groups = [], onUpdateWord, onUpdateSentence, onReplaceWords }) {
  const [title, setTitle] = useState(clip.title);
  const [desc, setDesc] = useState(clip.description || '');
  const [headline, setHeadline] = useState(clip.thumbHeadline || '');
  const [subsMode, setSubsMode] = useState('style'); // 'style' | 'words'
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
                <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Focus X (bisa juga digeser langsung di canvas)</span><span className="font-mono text-muted">{Math.round(clip.focusX * 100)}%</span></div>
                <Slider value={clip.focusX * 100} onChange={(v) => patch({ focusX: v / 100 }, true)} onCommit={(v) => patch({ focusX: v / 100 })} />
              </div>
            )}
            <button className="btn-soft btn-sm" onClick={openWebcam} disabled={!project.video}><Webcam size={13} />{hasWebcam ? 'Ubah area webcam' : 'Tandai area webcam'}</button>
          </Section>
        )}

        {tab === 'subs' && (
          <Section title="Subtitle" right={<ApplyAll n={selectedCount} onClick={() => onApplyAll({ captionStyle: clip.captionStyle, captionPos: clip.captionPos, burnCaptions: clip.burnCaptions, wordsPerLine: clip.wordsPerLine, letterSpacing: clip.letterSpacing, wordSpacing: clip.wordSpacing, lineHeight: clip.lineHeight, captionAnimation: clip.captionAnimation })} />}>
            <Toggle checked={clip.burnCaptions} onChange={(v) => patch({ burnCaptions: v })} label="Tampilkan subtitle (burn-in)" />

            <div className="pt-1">
              <Segmented
                full
                value={subsMode}
                onChange={setSubsMode}
                options={[
                  { value: 'style', label: 'Gaya & Posisi' },
                  { value: 'words', label: 'Koreksi Teks' },
                ]}
              />
            </div>

            {subsMode === 'style' ? (
              <div className={cx(!clip.burnCaptions && 'opacity-40 pointer-events-none', 'space-y-4 pt-1')}>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_IDS.map((id) => <StyleCard key={id} id={id} active={clip.captionStyle === id} onClick={() => patch({ captionStyle: id })} />)}
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Posisi vertikal (bisa juga digeser di canvas)</span><span className="font-mono text-muted">{Math.round(clip.captionPos)}%</span></div>
                    <Slider min={10} max={95} value={clip.captionPos} onChange={(v) => patch({ captionPos: v }, true)} onCommit={(v) => patch({ captionPos: v })} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[12px] text-fg2 mb-1.5"><span>Kata per baris</span><span className="font-mono text-muted">{clip.wordsPerLine || 3}</span></div>
                    <Slider min={1} max={5} value={clip.wordsPerLine || 3} onChange={(v) => patch({ wordsPerLine: v }, true)} onCommit={(v) => patch({ wordsPerLine: v })} />
                  </div>

                  <div>
                    <div className="flex justify-between text-[12px] text-fg2 mb-1.5">
                      <span className="flex items-center gap-1 font-medium">
                        <Sparkles size={12} className="text-violet-400" />
                        Animasi saat ada suara
                      </span>
                    </div>
                    <Segmented
                      full
                      size="sm"
                      value={clip.captionAnimation || 'pop'}
                      onChange={(v) => patch({ captionAnimation: v })}
                      options={[
                        { value: 'pop', label: 'Pop Bounce' },
                        { value: 'pulse', label: 'Pulse' },
                        { value: 'jump', label: 'Jump' },
                        { value: 'highlight', label: 'Highlight' },
                        { value: 'none', label: 'Statis' },
                      ]}
                    />
                  </div>

                  <div className="pt-2 border-t border-line/60 space-y-3">
                    <div className="text-[11.5px] font-semibold text-fg flex items-center gap-1.5">
                      <SlidersHorizontal size={13} className="text-violet-400" />
                      <span>Jarak Antar Teks</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[12px] text-fg2 mb-1.5">
                        <span>Jarak Antar Huruf (Letter Spacing)</span>
                        <span className="font-mono text-muted">{clip.letterSpacing ?? 0}px</span>
                      </div>
                      <Slider min={-2} max={16} step={1} value={clip.letterSpacing ?? 0} onChange={(v) => patch({ letterSpacing: v }, true)} onCommit={(v) => patch({ letterSpacing: v })} />
                    </div>

                    <div>
                      <div className="flex justify-between text-[12px] text-fg2 mb-1.5">
                        <span>Jarak Antar Kata (Word Spacing)</span>
                        <span className="font-mono text-muted">{clip.wordSpacing ?? 0}px</span>
                      </div>
                      <Slider min={0} max={30} step={2} value={clip.wordSpacing ?? 0} onChange={(v) => patch({ wordSpacing: v }, true)} onCommit={(v) => patch({ wordSpacing: v })} />
                    </div>

                    <div>
                      <div className="flex justify-between text-[12px] text-fg2 mb-1.5">
                        <span>Jarak Antar Baris (Line Spacing)</span>
                        <span className="font-mono text-muted">{(clip.lineHeight ?? 1.2).toFixed(2)}x</span>
                      </div>
                      <Slider min={1.0} max={1.8} step={0.05} value={clip.lineHeight ?? 1.2} onChange={(v) => patch({ lineHeight: +v.toFixed(2) }, true)} onCommit={(v) => patch({ lineHeight: +v.toFixed(2) })} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-1">
                <SubtitleWordEditor
                  groups={groups}
                  onUpdateWord={onUpdateWord}
                  onUpdateSentence={onUpdateSentence}
                  onReplaceWords={onReplaceWords}
                />
              </div>
            )}
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
