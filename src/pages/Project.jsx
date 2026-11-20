import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Webcam, Sparkles, Download, FolderOpen, Square, AlertTriangle, RotateCw, Settings as Cog, CheckCircle2, Scissors, Film, Type, Music, Stamp, SlidersHorizontal, Undo2 } from 'lucide-react';
import { api, call, fileUrl } from '../lib/api';
import { cx } from '../lib/format';
import { makeThumbnail } from '../lib/draw';
import { buildGroups } from '../lib/captions';
import { buildSequence, getEdit, itemAt, mapWords, insertLen } from '../lib/sequence';
import { cachedImage, loadImage, ensureFonts, rasterize, drawOverlay, drawWatermark } from '../lib/overlay';
import usePlayer from '../lib/usePlayer';
import StepsBar from '../components/StepsBar.jsx';
import ClipList from '../components/ClipList.jsx';
import Player from '../components/Player.jsx';
import ClipPanel from '../components/ClipPanel.jsx';
import Timeline from '../components/Timeline.jsx';
import WebcamModal from '../components/WebcamModal.jsx';
import ThemeMenu from '../components/ThemeMenu.jsx';
import { MediaPanel, TextPanel, AudioPanel, WatermarkPanel, AdjustPanel } from '../components/EditorPanels.jsx';
import { TextInspector, ImageInspector, SceneInspector, MusicInspector } from '../components/Inspectors.jsx';
import { Spinner, toast, Modal } from '../components/ui.jsx';
import PromptSelector from '../components/PromptSelector.jsx';
import { getTemplate } from '../lib/templates';

const STEP_NAMES = { download: 'Download video', transcribe: 'Transkrip audio', highlights: 'Mencari highlight', webcam: 'Webcam' };
const LEFT_TABS = [['clips', 'Klip', Scissors], ['media', 'Media', Film], ['text', 'Teks', Type], ['audio', 'Audio', Music], ['watermark', 'Watermark', Stamp], ['adjust', 'Adjust', SlidersHorizontal]];
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const EMPTY_SEQ = { items: [], total: 0, cuts: [], pieces: [] };

export default function Project({ id, settings, saveSettings, setTheme, back, openSettings }) {
  const [project, setProjectState] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [progress, setProgress] = useState({});
  const [renderProg, setRenderProg] = useState({});
  const [activeId, setActiveIdState] = useState(null);
  const [tab, setTab] = useState('clips');
  const [sortBy, setSortBy] = useState('time');
  const [view, setView] = useState('preview');
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [findModalOpen, setFindModalOpen] = useState(false);
  const [reTemplate, setReTemplate] = useState('viral');
  const [reCustomPrompt, setReCustomPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [leftTab, setLeftTab] = useState('clips');
  const [inspTab, setInspTab] = useState('clip');
  const [selection, setSelection] = useState(null);
  const [vol, setVol] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tlH, setTlH] = useState(250);
  const [, setHistTick] = useState(0);
  const [wm, setWmState] = useState(settings.watermark || {});
  const videoRef = useRef(null); const insRef = useRef(null); const musicRef = useRef(null);
  const pending = useRef({}); const timers = useRef({});
  const projectRef = useRef(null); const activeRef = useRef(null);
  const dragBase = useRef({});
  const hist = useRef({ undo: [], redo: [] });
  const wmRef = useRef(wm); wmRef.current = wm;

  const setProject = (p) => { projectRef.current = p; setProjectState(p); };
  const setActiveId = (cid) => { activeRef.current = cid; setActiveIdState(cid); setSelection(null); };

  const applyPending = (p) => {
    if (!p) return p;
    const pend = pending.current;
    if (!Object.keys(pend).length) return p;
    return { ...p, clips: p.clips.map((c) => (pend[c.id] ? { ...c, ...pend[c.id] } : c)) };
  };

  useEffect(() => {
    let alive = true;
    call('project:get', id).then((p) => alive && setProject(p)).catch((e) => toast(e.message, 'error'));
    const offs = [
      api.on('project:updated', (p) => { if (p.id === id) setProject(applyPending(p)); }),
      api.on('project:progress', (d) => { if (d.id === id) setProgress((x) => ({ ...x, [d.step]: d })); }),
      api.on('render:progress', (d) => { if (d.id === id) setRenderProg((x) => ({ ...x, [d.clipId]: d.progress })); }),
      api.on('render:finished', (d) => {
        if (d.id !== id) return;
        if (d.error) toast(d.error, 'error');
        else toast(`Ekspor selesai: ${d.done} berhasil${d.failed ? `, ${d.failed} gagal` : ''}`, d.failed ? 'error' : 'success');
      }),
    ];
    return () => { alive = false; offs.forEach((f) => f()); };
  }, [id]);
  useEffect(() => { if (JSON.stringify(settings.watermark || {}) !== JSON.stringify(wmRef.current)) setWmState(settings.watermark || {}); }, [settings.watermark]);

  const tDone = project && project.steps.transcribe.status === 'done';
  useEffect(() => { if (tDone) call('transcript:get', id).then(setTranscript).catch(() => {}); }, [tDone, id]);

  useEffect(() => {
    if (!project) return;
    if ((!activeId || !project.clips.find((c) => c.id === activeId)) && project.clips.length) {
      const best = [...project.clips].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
      setActiveId(best.id);
    }
  }, [project]);

  const clip = project && project.clips.find((c) => c.id === activeId);
  const edit = getEdit(clip);
  const seqKey = clip ? JSON.stringify([clip.start, clip.end, edit.cuts, edit.splits, edit.inserts]) : '';
  const seq = useMemo(() => (clip ? buildSequence(clip) : EMPTY_SEQ), [seqKey]);
  const assetsMap = useMemo(() => Object.fromEntries(((project && project.assets) || []).map((a) => [a.id, a])), [project && project.assets]);
  const assetsRef = useRef(assetsMap); assetsRef.current = assetsMap;
  const dirRef = useRef(''); dirRef.current = project ? project.dir : '';
  const assetUrl = useCallback((aid) => { const a = assetsRef.current[aid]; return a ? fileUrl(dirRef.current + '/' + a.rel) : ''; }, []);
  const imgs = useMemo(() => ({ get: (aid) => cachedImage(assetUrl(aid)) }), [assetUrl]);
  const musicAsset = edit.music && assetsMap[edit.music.asset];
  const musicInfo = musicAsset ? { url: assetUrl(musicAsset.id), offset: edit.music.offset || 0, volume: edit.music.volume ?? 0.5, name: musicAsset.name } : null;
  const groups = useMemo(() => (clip && transcript ? buildGroups(mapWords(transcript.words, seq), { ...clip, start: 0, end: seq.total }) : []),
    [seq, transcript, clip && clip.captionStyle, clip && clip.wordsPerLine]);
  const player = usePlayer({ videoRef, insRef, musicRef, seq, clipId: clip && clip.id, assetUrl, music: musicInfo, active: view === 'preview' && !!clip });

  /* ---------- patching with undo ---------- */
  const patchClipFields = useCallback((cid, fields, localOnly = false, record = true) => {
    const p = projectRef.current; if (!p) return;
    const cur = p.clips.find((c) => c.id === cid); if (!cur) return;
    if (record) {
      if (localOnly) {
        const b = dragBase.current[cid] || (dragBase.current[cid] = {});
        for (const k of Object.keys(fields)) if (!(k in b)) b[k] = clone(cur[k]);
      } else {
        const b = dragBase.current[cid] || {};
        const before = {};
        for (const k of Object.keys(fields)) before[k] = k in b ? b[k] : clone(cur[k]);
        delete dragBase.current[cid];
        if (JSON.stringify(before) !== JSON.stringify(fields)) {
          hist.current.undo.push({ cid, before, after: clone(fields) });
          if (hist.current.undo.length > 200) hist.current.undo.shift();
          hist.current.redo = [];
          setHistTick((x) => x + 1);
        }
      }
    }
    setProject({ ...p, clips: p.clips.map((c) => (c.id === cid ? { ...c, ...fields } : c)) });
    pending.current[cid] = { ...(pending.current[cid] || {}), ...fields };
    if (localOnly) return;
    clearTimeout(timers.current[cid]);
    timers.current[cid] = setTimeout(async () => {
      const f = pending.current[cid]; delete pending.current[cid];
      try { await call('clip:patch', id, cid, f); } catch (e) { toast(e.message, 'error'); }
    }, 250);
  }, [id]);
  /** optimistic patch; `localOnly` = slider drag (sent later on commit) */
  const patch = useCallback((fields, localOnly = false) => { if (activeRef.current) patchClipFields(activeRef.current, fields, localOnly); }, [patchClipFields]);
  const curClip = () => projectRef.current && projectRef.current.clips.find((c) => c.id === activeRef.current);
  const patchEdit = useCallback((fn, localOnly = false) => {
    const c = curClip(); if (!c) return;
    const ed = getEdit(c);
    patchClipFields(c.id, { edit: typeof fn === 'function' ? fn(ed) : { ...ed, ...fn } }, localOnly);
  }, [patchClipFields]);
  const onOverlayChange = useCallback((oid, f, lo) => patchEdit((ed) => ({ ...ed, overlays: ed.overlays.map((o) => (o.id === oid ? { ...o, ...f } : o)) }), lo), [patchEdit]);
  const onInsertChange = useCallback((iid, f, lo) => patchEdit((ed) => ({ ...ed, inserts: ed.inserts.map((o) => (o.id === iid ? { ...o, ...f } : o)) }), lo), [patchEdit]);
  const onMusicChange = useCallback((f, lo) => patchEdit((ed) => ({ ...ed, music: f === null ? null : { ...(ed.music || {}), ...f } }), lo), [patchEdit]);

  const undo = () => {
    const e = hist.current.undo.pop(); if (!e) return;
    if (e.cid !== activeRef.current) setActiveId(e.cid);
    patchClipFields(e.cid, e.before, false, false); hist.current.redo.push(e); setHistTick((x) => x + 1);
  };
  const redo = () => {
    const e = hist.current.redo.pop(); if (!e) return;
    if (e.cid !== activeRef.current) setActiveId(e.cid);
    patchClipFields(e.cid, e.after, false, false); hist.current.undo.push(e); setHistTick((x) => x + 1);
  };

  /* ---------- transcript / subtitle manual edits ---------- */
  const updateTranscriptWord = useCallback(async (origIdx, newText) => {
    if (!transcript || !transcript.words || origIdx == null) return;
    const clean = String(newText || '').trim();
    if (!clean) return;
    const nextWords = [...transcript.words];
    if (!nextWords[origIdx]) return;
    nextWords[origIdx] = { ...nextWords[origIdx], w: clean };
    const nextT = { ...transcript, words: nextWords };
    setTranscript(nextT);
    try {
      await call('transcript:updateWord', id, origIdx, clean);
      toast('Kata subtitle diperbarui', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }, [id, transcript]);

  const updateTranscriptSentence = useCallback(async (wordsList, newSentence) => {
    if (!transcript || !transcript.words || !wordsList || !wordsList.length) return;
    const newWords = String(newSentence || '').trim().split(/\s+/).filter(Boolean);
    if (!newWords.length) return;
    const nextWords = [...transcript.words];
    wordsList.forEach((wItem, i) => {
      const idx = wItem.origIdx;
      if (idx != null && nextWords[idx]) {
        if (i < newWords.length) nextWords[idx] = { ...nextWords[idx], w: newWords[i] };
      }
    });
    if (newWords.length > wordsList.length) {
      const lastIdx = wordsList[wordsList.length - 1].origIdx;
      if (lastIdx != null && nextWords[lastIdx]) {
        nextWords[lastIdx] = { ...nextWords[lastIdx], w: newWords.slice(wordsList.length - 1).join(' ') };
      }
    }
    const nextT = { ...transcript, words: nextWords };
    setTranscript(nextT);
    try {
      await call('transcript:save', id, nextT);
      toast('Subtitle berhasil diperbarui', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }, [id, transcript]);

  const replaceTranscriptWords = useCallback(async (findText, replaceWith, matchCase = false) => {
    if (!findText || !findText.trim()) return;
    try {
      const res = await call('transcript:replaceWords', id, findText, replaceWith, matchCase);
      if (res && res.transcript) {
        setTranscript(res.transcript);
        toast(`${res.count} kata subtitle berhasil diganti`, 'success');
      }
    } catch (e) { toast(e.message, 'error'); }
  }, [id]);

  /* ---------- editor actions ---------- */
  const addText = (preset) => {
    if (!clip) return;
    const total = seq.total; const t0 = Math.min(player.tRef.current, Math.max(0, total - 1));
    const o = { id: uid(), type: 'text', text: 'Teks baru', ...preset.style, align: 'center', x: 0.5, y: 0.4, start: +t0.toFixed(2), end: +Math.min(total, t0 + 3).toFixed(2), opacity: 1, rotate: 0 };
    patchEdit((ed) => ({ ...ed, overlays: [...ed.overlays, o] }));
    setSelection({ type: 'ov', id: o.id });
  };
  const addImageOverlay = (a) => {
    if (!clip) return;
    const total = seq.total; const t0 = Math.min(player.tRef.current, Math.max(0, total - 1));
    const o = { id: uid(), type: 'image', asset: a.id, w: 0.35, x: 0.5, y: 0.3, start: +t0.toFixed(2), end: +Math.min(total, t0 + 5).toFixed(2), opacity: 1, rotate: 0 };
    patchEdit((ed) => ({ ...ed, overlays: [...ed.overlays, o] }));
    setSelection({ type: 'ov', id: o.id });
  };
  /** source position + array index for inserting at the playhead */
  const insertPoint = () => {
    const r = itemAt(seq, player.tRef.current);
    if (!r) return { at: clip.start, after: null };
    if (r.item.type === 'src') { const off = player.tRef.current - r.item.os; return { at: +(off < 0.05 ? r.item.s : r.item.s + off).toFixed(3), after: null }; }
    return { at: r.item.ins.at, after: r.item.ins.id };
  };
  const placeInsert = (ed, x, after) => {
    const arr = ed.inserts.filter((i) => i.id !== x.id);
    const idx = after ? arr.findIndex((i) => i.id === after) : -1;
    if (idx >= 0) arr.splice(idx + 1, 0, x); else arr.push(x);
    return { ...ed, inserts: arr };
  };
  const insertScene = (a) => {
    if (!clip) return;
    const { at, after } = insertPoint();
    const x = { id: uid(), asset: a.id, kind: a.kind, at, fit: 'fit', mute: false, ...(a.kind === 'image' ? { dur: 3 } : { in: 0, out: +Math.min(a.duration || 5, 600).toFixed(2) }) };
    patchEdit((ed) => placeInsert(ed, x, after));
    setSelection({ type: 'ins', id: x.id });
    toast(`Scene ditambahkan (${insertLen(x).toFixed(1)} dtk)`, 'success');
  };
  const moveInsertToPlayhead = (iid) => {
    const { at, after } = insertPoint();
    if (after === iid) return;
    patchEdit((ed) => { const x = ed.inserts.find((i) => i.id === iid); return x ? placeInsert(ed, { ...x, at }, after) : ed; });
  };
  const dupInsert = (iid) => patchEdit((ed) => { const x = ed.inserts.find((i) => i.id === iid); return x ? placeInsert(ed, { ...x, id: uid() }, iid) : ed; });
  const dupOverlay = (oid) => {
    const nid = uid();
    patchEdit((ed) => { const o = ed.overlays.find((i) => i.id === oid); return o ? { ...ed, overlays: [...ed.overlays, { ...o, id: nid, x: Math.min(0.95, (o.x ?? 0.5) + 0.03), y: Math.min(0.95, (o.y ?? 0.5) + 0.03) }] } : ed; });
    setSelection({ type: 'ov', id: nid });
  };

  const split = () => {
    if (!clip) return;
    const tt = player.tRef.current;
    if (selection && selection.type === 'ov') {
      const o = edit.overlays.find((x) => x.id === selection.id);
      if (o && tt > o.start + 0.1 && tt < o.end - 0.1) {
        const b = { ...o, id: uid(), start: +tt.toFixed(2) };
        patchEdit((ed) => { const arr = []; for (const x of ed.overlays) { if (x.id === o.id) { arr.push({ ...x, end: +tt.toFixed(2) }, b); } else arr.push(x); } return { ...ed, overlays: arr }; });
        return;
      }
    }
    const r = itemAt(seq, tt); if (!r) return;
    const it = r.item; const off = tt - it.os; const len = it.oe - it.os;
    if (off < 0.1 || len - off < 0.1) return toast('Geser playhead ke tengah segmen untuk split.', 'info');
    if (it.type === 'src') {
      const st = +(it.s + off).toFixed(3);
      patchEdit((ed) => ({ ...ed, splits: [...(ed.splits || []), st] }));
      setSelection({ type: 'src', id: 'src:' + st.toFixed(2) });
    } else {
      const x = it.ins; const nid = uid();
      const A = x.kind === 'image' ? { ...x, dur: +off.toFixed(2) } : { ...x, out: +((Number(x.in) || 0) + off).toFixed(3) };
      const B = x.kind === 'image' ? { ...x, id: nid, dur: +(len - off).toFixed(2) } : { ...x, id: nid, in: +((Number(x.in) || 0) + off).toFixed(3) };
      patchEdit((ed) => { const arr = []; for (const i of ed.inserts) { if (i.id === x.id) arr.push(A, B); else arr.push(i); } return { ...ed, inserts: arr }; });
      setSelection({ type: 'ins', id: nid });
    }
  };
  const deleteSel = () => {
    if (!selection || !clip) return;
    if (selection.type === 'ov') patchEdit((ed) => ({ ...ed, overlays: ed.overlays.filter((o) => o.id !== selection.id) }));
    else if (selection.type === 'ins') patchEdit((ed) => ({ ...ed, inserts: ed.inserts.filter((o) => o.id !== selection.id) }));
    else if (selection.type === 'music') patchEdit((ed) => ({ ...ed, music: null }));
    else if (selection.type === 'src') {
      const it = seq.items.find((i) => i.id === selection.id);
      if (!it) return;
      if (seq.items.length <= 1) return toast('Minimal harus ada satu segmen di timeline.', 'error');
      patchEdit((ed) => ({ ...ed, cuts: [...(ed.cuts || []), { s: it.s, e: it.e }] }));
    }
    setSelection(null);
  };
  const restoreCuts = () => patchEdit((ed) => ({ ...ed, cuts: [], splits: [] }));

  const importAssets = async (kind) => {
    try { const added = await call('asset:import', id, kind); if (added && added.length) toast(`${added.length} file diimpor`, 'success'); return added || []; }
    catch (e) { toast(e.message, 'error'); return []; }
  };
  const deleteAsset = async (a) => {
    const used = (projectRef.current.clips || []).some((c) => c.edit && (JSON.stringify(c.edit).includes(`"${a.id}"`)));
    if (!confirm(used ? `"${a.name}" dipakai di klip. Hapus dari proyek dan semua klip?` : `Hapus "${a.name}" dari proyek?`)) return;
    try { await call('asset:delete', id, a.id); setSelection(null); } catch (e) { toast(e.message, 'error'); }
  };
  const useMusic = (a) => onMusicChange({ asset: a.id, volume: (edit.music && edit.music.volume) ?? 0.5, sourceVolume: (edit.music && edit.music.sourceVolume) ?? 1, offset: 0 });

  const setWm = (p, localOnly) => {
    const next = { ...wmRef.current, ...p };
    wmRef.current = next; setWmState(next);
    if (!localOnly) saveSettings({ watermark: next }).catch((e) => toast(e.message, 'error'));
  };
  const pickWm = async () => { const f = await call('watermark:pick'); if (f) setWm({ image: f, type: 'image' }); };

  // keyboard shortcuts
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (ctrl && e.key.toLowerCase() === 'b') { e.preventDefault(); split(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (selection) { e.preventDefault(); deleteSel(); } }
      else if (e.key === 'ArrowLeft' && view === 'preview') { e.preventDefault(); player.seek(player.tRef.current - (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'ArrowRight' && view === 'preview') { e.preventDefault(); player.seek(player.tRef.current + (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  // timeline resize
  const startResize = (e) => {
    e.preventDefault(); const y0 = e.clientY; const h0 = tlH;
    const mv = (ev) => setTlH(Math.max(150, Math.min(window.innerHeight - 320, h0 - (ev.clientY - y0))));
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };

  if (!project) return <div className="h-full flex items-center justify-center text-muted"><Spinner className="mr-2" />Memuat proyek…</div>;

  const running = project.running;
  const selected = project.clips.filter((c) => c.selected);
  const renderingClips = project.clips.filter((c) => c.render && ['queued', 'rendering'].includes(c.render.status));
  const doneCount = project.clips.filter((c) => c.render && c.render.status === 'done').length;
  const failedStep = Object.entries(project.steps).find(([, s]) => s.status === 'error' || s.status === 'cancelled');
  const runningStep = Object.entries(project.steps).find(([, s]) => s.status === 'running');
  const hlDone = project.steps.highlights.status === 'done' || project.clips.length > 0;

  const retry = (step) => call('project:run', id, step).catch((e) => toast(e.message, 'error'));
  const openFindModal = () => {
    setReTemplate(project.promptTemplate || 'viral');
    setReCustomPrompt(project.customPrompt || '');
    setFindModalOpen(true);
  };
  const confirmFindHighlights = () => {
    if (reTemplate === 'custom' && !reCustomPrompt.trim()) {
      return toast('Tulis instruksi prompt kustom untuk mencari klip.', 'error');
    }
    setFindModalOpen(false);
    call('project:run', id, 'highlights', true, {
      promptTemplate: reTemplate,
      customPrompt: reCustomPrompt.trim(),
    }).catch((e) => toast(e.message, 'error'));
    toast(`Mencari highlight (${getTemplate(reTemplate).label})…`, 'info');
  };
  const toggleClip = (cid, v) => {
    const p = projectRef.current; setProject({ ...p, clips: p.clips.map((c) => (c.id === cid ? { ...c, selected: v } : c)) });
    call('clip:patch', id, cid, { selected: v });
  };
  const selectAll = (v) => {
    const p = projectRef.current; setProject({ ...p, clips: p.clips.map((c) => ({ ...c, selected: v })) });
    call('clips:patch', id, project.clips.map((c) => c.id), { selected: v });
  };
  const addClip = async () => {
    const t = videoRef.current ? videoRef.current.currentTime : 0;
    const dur = project.video.duration;
    const start = Math.min(t, Math.max(0, dur - 30));
    const p = await call('clip:add', id, { start: +start.toFixed(2), end: +Math.min(dur, start + 30).toFixed(2) });
    setTab('clips'); if (p && p.lastAddedClip) { setActiveId(p.lastAddedClip); setView('preview'); }
  };
  const delClip = async () => {
    if (!clip || !confirm(`Hapus klip "${clip.title}"?`)) return;
    await call('clip:delete', id, clip.id); setActiveId(null);
  };
  const aiTitle = async () => {
    setAiBusy(true);
    try { await call('clip:aiTitle', id, clip.id); toast('Judul diperbarui', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setAiBusy(false); }
  };
  const applyAll = async (fields) => {
    const ids = selected.map((c) => c.id);
    if (fields.layout === 'split' && !(project.webcam && project.webcam.w)) delete fields.layout;
    await call('clips:patch', id, ids, fields);
    toast(`Diterapkan ke ${ids.length} klip`, 'success');
  };
  const applyAdjustAll = async () => {
    for (const c of selected) if (c.id !== clip.id) await call('clip:patch', id, c.id, { edit: { ...getEdit(c), adjust: { ...(edit.adjust || {}) } } });
    toast(`Diterapkan ke ${selected.length} klip`, 'success');
  };

  /** rasterize overlays + watermark for a clip -> saved PNG list */
  const buildRasters = async (c) => {
    const ed = getEdit(c); const s = buildSequence(c);
    const list = [];
    const ovs = (ed.overlays || []).filter((o) => o.visible !== false && o.end > o.start && o.start < s.total);
    await Promise.all(ovs.filter((o) => o.type === 'image').map((o) => loadImage(assetUrl(o.asset))));
    const groupsOv = [];
    for (const o of ovs) { const g = groupsOv[groupsOv.length - 1]; if (g && g.start === o.start && g.end === o.end) g.list.push(o); else groupsOv.push({ start: o.start, end: o.end, list: [o] }); }
    for (const g of groupsOv) list.push({ dataUrl: rasterize((ctx) => g.list.forEach((o) => drawOverlay(ctx, o, 1, imgs))), start: g.start, end: Math.min(g.end, s.total) });
    const w = wmRef.current;
    if (w && w.enabled && ed.watermark !== false) {
      const img = w.type === 'image' && w.image ? await loadImage(fileUrl(w.image)) : null;
      if (w.type !== 'image' || img) list.push({ dataUrl: rasterize((ctx) => drawWatermark(ctx, w, 1, img)), start: 0, end: s.total });
    }
    return list.length ? call('raster:save', id, c.id, list) : [];
  };
  const startRender = async () => {
    if (!selected.length) return toast('Centang klip yang mau diekspor dulu.', 'error');
    // flush pending edits first
    for (const cid of Object.keys(pending.current)) { clearTimeout(timers.current[cid]); const f = pending.current[cid]; delete pending.current[cid]; await call('clip:patch', id, cid, f); }
    setRenderProg({});
    setExporting(true);
    const map = {};
    try {
      await ensureFonts();
      const fresh = projectRef.current.clips.filter((c) => c.selected).sort((a, b) => a.start - b.start);
      for (const c of fresh) map[c.id] = await buildRasters(c);
      call('render:start', id, fresh.map((c) => c.id), map).catch((e) => toast(e.message, 'error'));
    } catch (e) { toast(e.message, 'error'); } finally { setExporting(false); }
  };
  const genThumb = async () => {
    if (!clip || !videoRef.current) return;
    setThumbBusy(true);
    try {
      const v = videoRef.current;
      if (v.currentTime < clip.start || v.currentTime > clip.end) { v.currentTime = clip.start + Math.min(2, (clip.end - clip.start) / 3); await new Promise((r) => v.addEventListener('seeked', r, { once: true })); }
      const data = await makeThumbnail(v, clip, project.webcam, settings.defaults.splitRatio || 42, clip.thumbHeadline || clip.title);
      await call('thumb:save', id, clip.id, data);
      await call('clip:patch', id, clip.id, { thumbAt: Date.now() });
      toast('Thumbnail tersimpan', 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setThumbBusy(false); }
  };
  const show = (p) => call('shell:show', /^[a-zA-Z]:|^\//.test(p) ? p : project.dir + '/' + p);

  const curRendering = project.clips.find((c) => c.render && c.render.status === 'rendering');

  /* ---------- inspector ---------- */
  let inspector = null;
  if (clip) {
    const selOv = selection && selection.type === 'ov' && edit.overlays.find((o) => o.id === selection.id);
    const selIns = selection && selection.type === 'ins' && edit.inserts.find((o) => o.id === selection.id);
    if (selOv && selOv.type === 'text') inspector = <TextInspector o={selOv} total={seq.total} t={player.t} change={(f, lo) => onOverlayChange(selOv.id, f, lo)} onDelete={deleteSel} onDuplicate={() => dupOverlay(selOv.id)} />;
    else if (selOv) inspector = <ImageInspector o={selOv} asset={assetsMap[selOv.asset]} total={seq.total} t={player.t} change={(f, lo) => onOverlayChange(selOv.id, f, lo)} onDelete={deleteSel} onDuplicate={() => dupOverlay(selOv.id)} />;
    else if (selIns) inspector = <SceneInspector ins={selIns} asset={assetsMap[selIns.asset]} change={(f, lo) => onInsertChange(selIns.id, f, lo)} onDelete={deleteSel} onMoveToPlayhead={() => moveInsertToPlayhead(selIns.id)} onDuplicate={() => dupInsert(selIns.id)} />;
    else if (selection && selection.type === 'music' && edit.music) inspector = <MusicInspector music={edit.music} asset={musicAsset} onChange={onMusicChange} />;
    else inspector = (
      <div className="flex flex-col h-full min-h-0">
        {(edit.cuts || []).length > 0 && (
          <div className="px-3 py-2 border-b border-line bg-fuchsia-500/10 text-[11.5px] text-fg flex items-center gap-2">
            <Scissors size={12} className="text-fuchsia-500" />{seq.cuts.length} bagian dipotong dari video sumber
            <button className="ml-auto text-accent-300 hover:underline inline-flex items-center gap-1" onClick={restoreCuts}><Undo2 size={11} />Pulihkan</button>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <ClipPanel project={project} clip={clip} patch={patch} videoRef={videoRef} onDelete={delClip} onAiTitle={aiTitle} aiBusy={aiBusy} openWebcam={() => setWebcamOpen(true)} onApplyAll={applyAll} selectedCount={selected.length} tab={inspTab} setTab={setInspTab} groups={groups} onUpdateWord={updateTranscriptWord} onUpdateSentence={updateTranscriptSentence} onReplaceWords={replaceTranscriptWords} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      {/* top bar */}
      <div className="h-12 px-2 flex items-center gap-2 border-b border-line bg-panel shrink-0">
        <button className="icon-btn" title="Kembali ke beranda" onClick={back}><ArrowLeft size={17} /></button>
        <div className="min-w-0 flex-1 pl-1">
          <div className="text-[13px] font-semibold text-fg truncate flex items-center gap-2">
            <span className="truncate">{project.title}</span>
            {project.promptTemplate && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium border border-accent/20 shrink-0">
                {getTemplate(project.promptTemplate).label}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted flex items-center gap-1.5 truncate">
            <span>{project.channel || (project.source === 'local' ? 'Video lokal' : '')}</span>
            {project.url && <button className="hover:text-accent-300 inline-flex items-center gap-1 truncate" onClick={() => call('shell:external', project.url)}>{project.url}<ExternalLink size={10} /></button>}
          </div>
        </div>
        <button className="btn-ghost btn-sm" disabled={!project.video} onClick={() => setWebcamOpen(true)}><Webcam size={14} />Webcam <span className="text-[11px] text-muted">{project.webcam ? 'ditandai' : '—'}</span></button>
        {running === 'pipeline'
          ? <button className="btn-soft btn-sm text-red-500" onClick={() => call('project:cancel', id)}><Square size={12} />Batalkan</button>
          : <button className="btn-ghost btn-sm" disabled={!tDone || !!running} onClick={openFindModal}><Sparkles size={14} className="text-accent" />Cari highlight lagi</button>}
        <div className="w-px h-5 bg-line mx-0.5" />
        <button className="icon-btn" title="Buka folder proyek" onClick={() => call('shell:open', project.dir)}><FolderOpen size={16} /></button>
        <ThemeMenu value={settings.theme} onChange={setTheme} />
        <button className="icon-btn" title="Pengaturan" onClick={() => openSettings()}><Cog size={16} /></button>
        {running === 'render' ? (
          <div className="flex items-center gap-2 pl-1">
            <div className="flex items-center gap-2 h-8 px-3 rounded-md bg-accent/10 text-[12px] text-fg">
              <Spinner size={12} className="text-accent" />
              <span className="max-w-[200px] truncate">{curRendering ? curRendering.title : 'Menyiapkan'}</span>
              <span className="font-mono text-accent-300">{Math.round(((curRendering && renderProg[curRendering.id]) || 0) * 100)}%</span>
              <span className="text-muted">· sisa {renderingClips.length}</span>
            </div>
            <button className="btn-soft btn-sm text-red-500" onClick={() => call('project:cancel', id)}><Square size={12} />Stop</button>
          </div>
        ) : (
          <button className="btn-primary ml-1 px-4" disabled={!hlDone || !selected.length || !!running || exporting} onClick={startRender}>
            {exporting ? <Spinner size={13} /> : <Download size={15} />}Ekspor{selected.length ? ` (${selected.length})` : ''}
          </button>
        )}
      </div>

      <StepsBar project={project} progress={progress} onRetry={retry} />

      {!hlDone ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="card w-full max-w-lg p-7 text-center fade-in">
            {failedStep ? (<>
              <AlertTriangle className="mx-auto text-red-500 mb-3" size={30} />
              <div className="text-fg font-semibold text-[15px]">{STEP_NAMES[failedStep[0]]} gagal</div>
              <div className="mt-3 text-[12px] text-fg2 bg-red-500/10 border border-red-500/25 rounded-md p-3 text-left whitespace-pre-wrap break-words max-h-48 overflow-auto font-mono select-text">{failedStep[1].detail}</div>
              <div className="mt-5 flex justify-center gap-2">
                <button className="btn-soft" onClick={() => openSettings()}><Cog size={14} />Pengaturan</button>
                <button className="btn-primary" onClick={() => retry(failedStep[0])}><RotateCw size={14} />Ulangi</button>
              </div>
            </>) : runningStep ? (<>
              <Spinner size={28} className="mx-auto text-accent mb-4" />
              <div className="text-fg font-semibold text-[15px]">{STEP_NAMES[runningStep[0]]}…</div>
              <div className="mt-1.5 text-[12px] text-muted min-h-[18px]">{(progress[runningStep[0]] || {}).detail || runningStep[1].detail}</div>
              <div className="mt-5 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${Math.max(3, ((progress[runningStep[0]] || {}).progress || 0) * 100)}%` }} /></div>
              <div className="mt-4 text-[11.5px] text-muted">Proses jalan di background. Kamu bisa kembali ke beranda.</div>
            </>) : (<>
              <div className="text-fg font-semibold">Proyek belum diproses</div>
              <button className="btn-primary mt-4" onClick={() => retry('download')}>Mulai proses</button>
            </>)}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            {/* left: tool tabs + panel */}
            <div className="w-[330px] shrink-0 flex flex-col bg-panel min-h-0">
              <div className="h-14 flex items-stretch border-b border-line shrink-0 px-1">
                {LEFT_TABS.map(([k, l, I]) => (
                  <button key={k} onClick={() => setLeftTab(k)} className={cx('flex-1 flex flex-col items-center justify-center gap-1 text-[10.5px] transition relative', leftTab === k ? 'text-accent-300' : 'text-fg2 hover:text-fg')}>
                    <I size={17} />{l}
                    {leftTab === k && <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded" />}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0">
                {leftTab === 'clips' && <ClipList project={project} tab={tab} setTab={setTab} sortBy={sortBy} setSortBy={setSortBy} activeId={activeId} setActiveId={(cid) => { setActiveId(cid); setView('preview'); }}
                  onToggle={toggleClip} onAll={selectAll} onAdd={addClip} renderProg={renderProg}
                  onPlayRender={(r) => { setActiveId(r.clipId); setView('rendered'); }} onDeleteRender={async (r) => { if (confirm('Hapus file hasil ekspor ini?')) await call('render:delete', id, r.id); }} onShow={show} />}
                {leftTab === 'media' && <MediaPanel project={project} onImport={importAssets} onDelete={deleteAsset} onInsertScene={insertScene} onAddOverlay={addImageOverlay} />}
                {leftTab === 'text' && <TextPanel onAdd={addText} />}
                {leftTab === 'audio' && <AudioPanel project={project} music={edit.music} onImport={importAssets} onUse={useMusic} onDelete={deleteAsset} onMusicChange={onMusicChange} />}
                {leftTab === 'watermark' && <WatermarkPanel wm={wm} setWm={setWm} pickImage={pickWm} clipShows={edit.watermark !== false} setClipShows={(v) => patchEdit({ watermark: v })} />}
                {leftTab === 'adjust' && <AdjustPanel adjust={edit.adjust} onChange={(f, lo) => patchEdit((ed) => ({ ...ed, adjust: { ...(ed.adjust || {}), ...f } }), lo)} selectedCount={selected.length} onApplyAll={applyAdjustAll} />}
              </div>
            </div>

            <Player project={project} clip={clip} seq={seq} groups={groups} player={player} videoRef={videoRef} insRef={insRef} musicRef={musicRef} view={view} setView={setView}
              overlays={edit.overlays} selection={selection} setSelection={setSelection} onOverlayChange={onOverlayChange} imgs={imgs} assetUrl={assetUrl}
              watermark={wm && wm.enabled && edit.watermark !== false ? wm : null} wmUrl={wm && wm.type === 'image' && wm.image ? fileUrl(wm.image) : null}
              adjust={edit.adjust} splitRatio={(clip && clip.splitRatio) || (settings && settings.defaults && settings.defaults.splitRatio) || 42} onGenThumb={genThumb} genBusy={thumbBusy} onShow={show}
              onPatchClip={patch} onUpdateWord={updateTranscriptWord} onUpdateSentence={updateTranscriptSentence}
              onSplitRatioChange={(sr) => { patch({ splitRatio: sr }); saveSettings({ defaults: { ...((settings && settings.defaults) || {}), splitRatio: sr } }); }}
              vol={vol} setVol={setVol} muted={muted} setMuted={setMuted} sourceVolume={edit.music && edit.music.asset ? (edit.music.sourceVolume ?? 1) : 1} />

            {/* right: inspector */}
            <div className="w-[330px] shrink-0 bg-panel min-h-0">{inspector}</div>
          </div>

          {/* timeline */}
          <div className="h-1 cursor-ns-resize bg-bg hover:bg-accent/40 shrink-0" onMouseDown={startResize} />
          <div className="shrink-0" style={{ height: tlH }}>
            {clip ? (
              <Timeline project={project} clip={clip} seq={seq} t={player.t} seek={player.seek} playing={player.playing} selection={selection} setSelection={setSelection}
                overlays={edit.overlays} onOverlayChange={onOverlayChange} onTrim={(f, lo) => patch(f, lo)} onInsertChange={onInsertChange} assetsMap={assetsMap}
                captionGroups={groups} music={musicInfo} onSplit={split} onDelete={deleteSel} onUndo={undo} onRedo={redo} canUndo={hist.current.undo.length > 0} canRedo={hist.current.redo.length > 0}
                onAddText={() => { setLeftTab('text'); }} onOpenMedia={() => setLeftTab('media')} onOpenAudio={() => setLeftTab('audio')} />
            ) : <div className="h-full bg-panel border-t border-line" />}
          </div>
        </div>
      )}

      {/* status bar */}
      <div className="h-7 px-3 flex items-center gap-4 border-t border-line bg-panel text-[11.5px] text-muted shrink-0">
        <span>{selected.length} klip dipilih</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className={doneCount ? 'text-emerald-500' : ''} />{doneCount} sudah diekspor</span>
        <span className="hidden lg:inline">1080×1920 MP4 · ekspor berurutan</span>
        <button className="ml-auto hover:text-fg inline-flex items-center gap-1.5" onClick={() => call('shell:open', project.dir + '/renders').catch(() => call('shell:open', project.dir))}><FolderOpen size={12} />Folder hasil ekspor</button>
      </div>

      <WebcamModal open={webcamOpen} onClose={() => setWebcamOpen(false)} project={project} startTime={clip ? clip.start + 1 : 0}
        onSave={async (rect) => { await call('webcam:set', id, rect); toast(rect ? 'Webcam disimpan, layout Split aktif' : 'Webcam dihapus', 'success'); }} />

      <Modal
        open={findModalOpen}
        onClose={() => setFindModalOpen(false)}
        title="Cari Ulang Highlight dengan AI"
        width="max-w-2xl"
        footer={
          <>
            <button className="btn-ghost btn-sm" onClick={() => setFindModalOpen(false)}>Batal</button>
            <button className="btn-primary btn-sm" onClick={confirmFindHighlights}>
              <Sparkles size={13} />
              Mulai Cari Klip ({getTemplate(reTemplate).label})
            </button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div className="text-[12px] text-muted leading-relaxed">
            Pilih gaya atau template klip yang ingin dicari AI. Klip hasil AI saat ini akan diganti sesuai hasil pencarian baru (klip buatan manual Anda tetap tersimpan).
          </div>
          <PromptSelector
            template={reTemplate}
            onSelectTemplate={setReTemplate}
            customPrompt={reCustomPrompt}
            onChangePrompt={setReCustomPrompt}
            title="Pilih Gaya Klip & Prompt AI"
          />
        </div>
      </Modal>
    </div>
  );
}
