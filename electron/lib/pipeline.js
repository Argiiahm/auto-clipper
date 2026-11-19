const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const media = require('./media');
const { transcribeGroq, parseJson3 } = require('./transcribe');
const llm = require('./llm');
const { buildAss } = require('./captions');
const { renderClip, renderClipEdited } = require('./render');
const seqLib = require('./sequence');
const { killJob } = require('./proc');
const { fontsDir } = require('./paths');

const STEP_KEYS = ['download', 'transcribe', 'highlights', 'webcam'];
let emit = () => {};
function setEmitter(fn) { emit = fn; }

const active = new Map(); // projectId -> {abort: AbortController, kind}
const locks = new Map(); // projectId -> promise chain to serialize writes

function uid(n = 8) { return crypto.randomBytes(n).toString('hex').slice(0, n); }
function slug(s) { return String(s || 'clip').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'clip'; }

/** serialized read-modify-write on project.json */
function update(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(() => {
    const p = store.loadProject(id);
    const res = fn(p);
    const saved = store.saveProject(res || p);
    emit('project:updated', publicProject(saved));
    return saved;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

function publicProject(p) {
  return { ...p, running: active.has(p.id) ? active.get(p.id).kind : null };
}

function newClip(c, defaults) {
  return {
    id: uid(), start: c.start, end: c.end, title: c.title || 'Klip baru', description: c.description || '', hook: c.hook || c.title || '',
    score: c.score ?? null, source: c.source || 'llm', selected: true,
    layout: defaults.layout || 'fill', focusX: 0.5, captionStyle: defaults.captionStyle || 'pop', burnCaptions: defaults.burnCaptions !== false,
    captionPos: defaults.captionPos ?? 75, wordsPerLine: defaults.wordsPerLine || 3, thumbHeadline: (c.hook || c.title || '').slice(0, 120),
    render: null,
  };
}

function ensureFonts(dir) {
  const fd = path.join(dir, 'fonts');
  fs.mkdirSync(fd, { recursive: true });
  const src = fontsDir();
  try { for (const f of fs.readdirSync(src)) if (/\.(ttf|otf)$/i.test(f) && !fs.existsSync(path.join(fd, f))) fs.copyFileSync(path.join(src, f), path.join(fd, f)); } catch (_) {}
}

async function createProject({ url, localPath }) {
  const settings = store.loadSettings();
  const id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + uid(6);
  const p = {
    id, createdAt: Date.now(), url: url || null, localPath: localPath || null, source: url ? 'youtube' : 'local',
    title: url ? 'Memuat…' : path.basename(localPath), channel: '', video: null, cover: null,
    steps: Object.fromEntries(STEP_KEYS.map((k) => [k, { status: 'pending', detail: '', progress: 0 }])),
    webcam: null, webcamMode: 'auto', clips: [], renders: [], settingsSnapshot: { language: settings.language },
  };
  const saved = store.saveProject(p);
  ensureFonts(saved.dir);
  emit('projects:changed');
  runPipeline(id, 'download');
  return publicProject(saved);
}

function setStep(id, key, patch) {
  return update(id, (p) => { p.steps[key] = { ...p.steps[key], ...patch }; return p; });
}

let lastEmit = 0;
function stepProgress(id, key, progress, detail) {
  // lightweight progress event (not persisted every tick)
  const now = Date.now();
  if (now - lastEmit < 150 && progress < 1) return;
  lastEmit = now;
  emit('project:progress', { id, step: key, progress, detail });
}

async function runPipeline(id, fromStep = 'download', onlyStep = false) {
  if (active.has(id)) throw new Error('Proyek sedang berjalan');
  const ac = new AbortController();
  active.set(id, { abort: ac, kind: 'pipeline' });
  const idx = STEP_KEYS.indexOf(fromStep);
  const steps = onlyStep ? [fromStep] : STEP_KEYS.slice(idx < 0 ? 0 : idx);
  let current = null;
  try {
    await update(id, (p) => { for (const k of steps) p.steps[k] = { status: 'pending', detail: '', progress: 0 }; return p; });
    for (const key of steps) {
      current = key;
      if (ac.signal.aborted) throw new Error('Dibatalkan');
      await setStep(id, key, { status: 'running', detail: 'Memulai…', progress: 0, startedAt: Date.now() });
      const detail = await STEP_FN[key](id, ac.signal);
      await setStep(id, key, { status: 'done', detail: detail || 'Selesai', progress: 1, finishedAt: Date.now() });
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (current) await setStep(id, current, { status: ac.signal.aborted ? 'cancelled' : 'error', detail: ac.signal.aborted ? 'Dibatalkan' : msg, progress: 0 });
  } finally {
    active.delete(id);
    const p = store.loadProject(id);
    emit('project:updated', publicProject(p));
    emit('projects:changed');
  }
}

const STEP_FN = {
  async download(id, signal) {
    let p = store.loadProject(id);
    const settings = store.loadSettings();
    const src = path.join(p.dir, 'source.mp4');
    if (p.source === 'youtube') {
      stepProgress(id, 'download', 0, 'Membaca info video…');
      const info = await media.ytInfo(p.url, settings, id);
      await update(id, (q) => { q.title = info.title; q.channel = info.channel; q.ytId = info.id; q.ytHasAutoSubs = info.hasAutoSubs; q.ytLanguage = info.language; return q; });
      if (!fs.existsSync(src)) {
        await media.ytDownload(p.url, p.dir, settings, (pr) => stepProgress(id, 'download', pr.pct / 100, pr.detail), id);
      }
    } else {
      stepProgress(id, 'download', 0.1, 'Menyalin video lokal…');
      if (!fs.existsSync(src)) {
        const meta = await media.probe(p.localPath);
        if (/^(h264|hevc|vp9|av1|vp8)$/.test(meta.vcodec || '') && /\.(mp4|mov|m4v|webm|mkv)$/i.test(p.localPath)) {
          // remux to mp4 (fast) so the preview player can read it
          const { run } = require('./proc'); const { resolveBin } = require('./paths');
          const r = await run(resolveBin('ffmpeg'), ['-y', '-v', 'error', '-i', p.localPath, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', src], { jobKey: id });
          if (r.code !== 0 || meta.vcodec === 'hevc') { try { fs.unlinkSync(src); } catch (_) {} }
        }
        if (!fs.existsSync(src)) {
          stepProgress(id, 'download', 0.2, 'Konversi video ke H.264 (sekali saja)…');
          const { run } = require('./proc'); const { resolveBin } = require('./paths');
          const r = await run(resolveBin('ffmpeg'), ['-y', '-v', 'error', '-progress', 'pipe:1', '-i', p.localPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', src], {
            jobKey: id, onLine: (l) => { const m = l.match(/^out_time_us=(\d+)/); if (m && meta.duration) stepProgress(id, 'download', Math.min(0.99, m[1] / 1e6 / meta.duration), 'Konversi video…'); },
          });
          if (r.code !== 0) throw new Error('Gagal konversi video lokal');
        }
      }
    }
    if (signal.aborted) throw new Error('Dibatalkan');
    const meta = await media.probe(src);
    const coverPath = path.join(p.dir, 'cover.jpg');
    if (!fs.existsSync(coverPath)) { try { await media.extractFrame(src, Math.min(meta.duration * 0.2, 60), coverPath, 640); } catch (_) {} }
    await update(id, (q) => { q.video = { path: 'source.mp4', ...meta }; q.cover = fs.existsSync(coverPath) ? 'cover.jpg' : null; return q; });
    return `${(fs.statSync(src).size / 1e6).toFixed(0)} MB · ${meta.width}x${meta.height} · ${meta.duration < 60 ? Math.round(meta.duration) + " dtk" : Math.round(meta.duration / 60) + " menit"}`;
  },

  async transcribe(id, signal) {
    const p = store.loadProject(id);
    const settings = store.loadSettings();
    const lang = settings.language;
    let t;
    const useYt = settings.transcriber === 'youtube' && p.source === 'youtube';
    if (useYt) {
      stepProgress(id, 'transcribe', 0.2, 'Mengambil caption YouTube…');
      try {
        const sub = await media.ytSubtitles(p.url, p.dir, lang, settings, id);
        const parsed = parseJson3(sub.file);
        if (parsed.words.length < 10) throw new Error('Caption terlalu sedikit');
        t = { source: 'youtube', language: sub.lang, ...parsed };
      } catch (e) {
        if (!settings.keys.groq) throw e;
        stepProgress(id, 'transcribe', 0.1, 'Caption YouTube tidak ada, pakai Groq Whisper…');
      }
    }
    if (!t) {
      if (!settings.keys.groq) throw new Error('API key Groq belum diisi (dibutuhkan untuk Whisper). Buka Settings → API Keys, atau pilih "Caption YouTube".');
      const chunks = await media.extractAudioChunks(path.join(p.dir, p.video.path), path.join(p.dir, 'audio'), p.video.duration, 600,
        (f) => stepProgress(id, 'transcribe', f * 0.15, 'Menyiapkan audio…'), id);
      t = await transcribeGroq(chunks, { apiKey: settings.keys.groq, model: settings.whisperModel, language: lang, signal },
        (f, d) => stepProgress(id, 'transcribe', 0.15 + f * 0.85, d));
    }
    if (signal.aborted) throw new Error('Dibatalkan');
    store.saveTranscript(p, t);
    await update(id, (q) => { q.language = t.language; q.transcriptSource = t.source; return q; });
    return `${t.words.length} kata, bahasa ${t.language || '?'} (${t.source === 'youtube' ? 'caption YouTube' : 'Groq Whisper'})`;
  },

  async highlights(id, signal) {
    const p = store.loadProject(id);
    const settings = store.loadSettings();
    const t = store.loadTranscript(p);
    if (!t || !t.segments.length) throw new Error('Transkrip kosong');
    const clips = await llm.findHighlights({ settings, transcript: t, duration: p.video.duration, videoTitle: p.title, signal,
      onProgress: (f, d) => stepProgress(id, 'highlights', f, d) });
    await update(id, (q) => {
      const manual = (q.clips || []).filter((c) => c.source === 'manual');
      const defaults = { ...settings.defaults };
      if (q.webcam && q.webcam.w) defaults.layout = 'split';
      q.clips = [...manual, ...clips.map((c) => newClip({ ...c, source: 'llm' }, defaults))].sort((a, b) => a.start - b.start);
      return q;
    });
    const { providerConf } = llm; const conf = providerConf(settings);
    return `${clips.length} klip (llm, ${conf.model})`;
  },

  async webcam(id) {
    const p = store.loadProject(id);
    if (p.webcam && p.webcam.w) return 'manual rect tersimpan';
    return 'Belum ditandai — klik "Webcam" untuk layout Split';
  },
};

function cancel(id) {
  const a = active.get(id);
  if (a) { a.abort.abort(); killJob(id); }
  if (renderQueue.id === id) { renderQueue.cancel = true; killJob('render:' + id); }
}

/* ---------------- rendering (sequential) ---------------- */
const renderQueue = { id: null, cancel: false };

async function renderClips(id, clipIds, rastersMap) {
  rastersMap = rastersMap || {};
  if (active.has(id)) throw new Error('Proyek sedang berjalan');
  active.set(id, { abort: new AbortController(), kind: 'render' });
  renderQueue.id = id; renderQueue.cancel = false;
  const settings = store.loadSettings();
  let done = 0; let failed = 0;
  try {
    let p = store.loadProject(id);
    ensureFonts(p.dir);
    fs.mkdirSync(path.join(p.dir, 'renders'), { recursive: true });
    const t = store.loadTranscript(p) || { words: [] };
    await update(id, (q) => { q.clips.forEach((c) => { if (clipIds.includes(c.id)) c.render = { status: 'queued', progress: 0 }; }); return q; });
    for (const cid of clipIds) {
      if (renderQueue.cancel) break;
      p = store.loadProject(id);
      const clip = p.clips.find((c) => c.id === cid);
      if (!clip) continue;
      const idx = p.clips.indexOf(clip) + 1;
      await update(id, (q) => { const c = q.clips.find((x) => x.id === cid); if (c) c.render = { status: 'rendering', progress: 0 }; return q; });
      try {
        const base = `${String(idx).padStart(2, '0')}_${slug(clip.title)}_${uid(4)}`;
        const outRel = path.join('renders', base + '.mp4');
        const layout = clip.layout === 'split' && !(p.webcam && p.webcam.w) ? 'fill' : clip.layout;
        const rasters = (rastersMap[cid] || []).filter((r) => r && r.rel && fs.existsSync(path.join(p.dir, r.rel)));
        let out;
        if (seqLib.hasEdits(clip, rasters)) {
          // manual edits (scenes / cuts / overlays / watermark / music / adjust)
          const seq = seqLib.buildSequence(clip);
          if (!seq.items.length || seq.total < 0.2) throw new Error('Timeline kosong');
          const ed = seqLib.getEdit(clip);
          const words = seqLib.mapWords(t.words, seq);
          const assText = clip.burnCaptions && words.length ? buildAss({ words, clipStart: 0, clipEnd: seq.total, styleId: clip.captionStyle, posPct: clip.captionPos, wordsPerLine: clip.wordsPerLine || 3 }) : null;
          const assets = {};
          for (const a of p.assets || []) assets[a.id] = a;
          const mus = ed.music && ed.music.asset && assets[ed.music.asset] ? { ...ed.music, rel: assets[ed.music.asset].rel } : null;
          out = await renderClipEdited({
            projectDir: p.dir, srcRel: p.video.path, video: p.video, clip: { ...clip, layout }, webcam: p.webcam, assText, outRel,
            encoder: settings.encoder, quality: settings.quality, splitRatio: (settings.defaults || {}).splitRatio || 42, jobKey: 'render:' + id,
            items: seq.items, total: seq.total, assets, rasters, music: mus, adjust: ed.adjust,
            onProgress: (f, d) => emit('render:progress', { id, clipId: cid, progress: f, detail: d }),
          });
        } else {
          const assText = clip.burnCaptions && t.words.length ? buildAss({ words: t.words, clipStart: clip.start, clipEnd: clip.end, styleId: clip.captionStyle, posPct: clip.captionPos, wordsPerLine: clip.wordsPerLine || 3 }) : null;
          out = await renderClip({
            projectDir: p.dir, srcRel: p.video.path, video: p.video, clip: { ...clip, layout }, webcam: p.webcam, assText, outRel,
            encoder: settings.encoder, quality: settings.quality, splitRatio: (settings.defaults || {}).splitRatio || 42, jobKey: 'render:' + id,
            onProgress: (f, d) => emit('render:progress', { id, clipId: cid, progress: f, detail: d }),
          });
        }
        // write description/caption text file next to video for easy posting
        const txt = `${clip.title}\n\n${clip.description || ''}\n\nSumber: ${p.url || p.title}`;
        fs.writeFileSync(out.replace(/\.mp4$/i, '.txt'), txt, 'utf8');
        const assPath = out.replace(/\.mp4$/i, '.ass'); try { fs.unlinkSync(assPath); } catch (_) {}
        await update(id, (q) => {
          const c = q.clips.find((x) => x.id === cid);
          if (c) c.render = { status: 'done', progress: 1, path: outRel, at: Date.now() };
          q.renders = [{ id: uid(), clipId: cid, title: clip.title, path: outRel, start: clip.start, end: clip.end, layout, captionStyle: clip.captionStyle, createdAt: Date.now(), thumb: clip.thumbnail || null }, ...(q.renders || [])];
          return q;
        });
        done++;
      } catch (e) {
        failed++;
        await update(id, (q) => { const c = q.clips.find((x) => x.id === cid); if (c) c.render = { status: renderQueue.cancel ? 'cancelled' : 'error', error: e.message, progress: 0 }; return q; });
      }
    }
    await update(id, (q) => { q.clips.forEach((c) => { if (c.render && c.render.status === 'queued') c.render = null; }); return q; });
  } finally {
    active.delete(id); renderQueue.id = null;
    const p = store.loadProject(id);
    emit('project:updated', publicProject(p));
    emit('render:finished', { id, done, failed });
  }
  return { done, failed };
}

/* ---------------- clip editing ---------------- */
async function patchClip(id, clipId, patch) {
  return update(id, (p) => {
    const c = p.clips.find((x) => x.id === clipId);
    if (c) Object.assign(c, patch);
    return p;
  });
}
async function patchClips(id, clipIds, patch) {
  return update(id, (p) => { p.clips.forEach((c) => { if (clipIds.includes(c.id)) Object.assign(c, patch); }); return p; });
}
async function addClip(id, { start, end }) {
  const settings = store.loadSettings();
  return update(id, (p) => {
    const d = { ...settings.defaults }; if (p.webcam && p.webcam.w) d.layout = 'split';
    const c = newClip({ start, end, title: 'Klip manual', source: 'manual', score: null }, d);
    p.clips.push(c); p.clips.sort((a, b) => a.start - b.start);
    p.lastAddedClip = c.id;
    return p;
  });
}
async function deleteClip(id, clipId) {
  return update(id, (p) => { p.clips = p.clips.filter((c) => c.id !== clipId); return p; });
}
async function setWebcam(id, rect) {
  const p = await update(id, (q) => {
    q.webcam = rect && rect.w > 0.02 ? rect : null;
    q.webcamMode = q.webcam ? 'manual' : 'none';
    q.steps.webcam = { status: 'done', progress: 1, detail: q.webcam ? 'manual rect tersimpan' : 'tanpa webcam' };
    if (q.webcam) q.clips.forEach((c) => { if (c.layout === 'fill' && !c.layoutTouched) c.layout = 'split'; });
    return q;
  });
  return p;
}
async function deleteRender(id, renderId) {
  return update(id, (p) => {
    const r = (p.renders || []).find((x) => x.id === renderId);
    if (r) { for (const f of [r.path, r.path.replace(/\.mp4$/i, '.txt')]) { try { fs.unlinkSync(path.join(p.dir, f)); } catch (_) {} } }
    p.renders = (p.renders || []).filter((x) => x.id !== renderId);
    return p;
  });
}
async function saveThumbnail(id, clipId, dataUrl) {
  const p = store.loadProject(id);
  const clip = p.clips.find((c) => c.id === clipId);
  fs.mkdirSync(path.join(p.dir, 'renders'), { recursive: true });
  const rel = path.join('renders', `thumb_${slug(clip ? clip.title : 'clip')}_${uid(4)}.png`);
  fs.writeFileSync(path.join(p.dir, rel), Buffer.from(dataUrl.split(',')[1], 'base64'));
  await update(id, (q) => { const c = q.clips.find((x) => x.id === clipId); if (c) { if (c.thumbnail) { try { fs.unlinkSync(path.join(q.dir, c.thumbnail)); } catch (_) {} } c.thumbnail = rel; } return q; });
  return path.join(p.dir, rel);
}

/* ---------------- manual editor: assets & rasters ---------------- */
const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif)$/i;
const AUD_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i;
async function importAssets(id, files) {
  const p = store.loadProject(id);
  const dir = path.join(p.dir, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const added = [];
  for (const f of files || []) {
    if (!f || !fs.existsSync(f)) continue;
    const aid = uid(8);
    const ext = path.extname(f).toLowerCase();
    const kind = IMG_EXT.test(f) ? 'image' : AUD_EXT.test(f) ? 'audio' : 'video';
    let rel = path.join('assets', `${aid}${ext}`);
    if (kind === 'image' && !/\.(png|jpe?g)$/i.test(ext)) {
      // webp / gif / bmp -> png so ffmpeg's image2 demuxer can loop it
      rel = path.join('assets', `${aid}.png`);
      const { run } = require('./proc'); const { resolveBin } = require('./paths');
      const r = await run(resolveBin('ffmpeg'), ['-y', '-v', 'error', '-i', f, '-frames:v', '1', path.join(p.dir, rel)]);
      if (r.code !== 0) throw new Error(`Gambar tidak bisa dibaca: ${path.basename(f)}`);
    } else fs.copyFileSync(f, path.join(p.dir, rel));
    let meta = {};
    try { meta = await media.probe(path.join(p.dir, rel)); } catch (e) { if (kind !== 'image') { try { fs.unlinkSync(path.join(p.dir, rel)); } catch (_) {} throw new Error(`File tidak bisa dibaca: ${path.basename(f)}`); } }
    let thumb = null;
    if (kind === 'video') {
      const th = path.join('assets', `${aid}_thumb.jpg`);
      try { await media.extractFrame(path.join(p.dir, rel), Math.min(1, (meta.duration || 0) / 3), path.join(p.dir, th), 320); thumb = th.replace(/\\/g, '/'); } catch (_) {}
    }
    added.push({ id: aid, name: path.basename(f), rel: rel.replace(/\\/g, '/'), kind, thumb, width: meta.width || 0, height: meta.height || 0, duration: kind === 'image' ? 0 : (meta.duration || 0), hasAudio: !!meta.hasAudio, addedAt: Date.now() });
  }
  await update(id, (q) => { q.assets = [...(q.assets || []), ...added]; return q; });
  return added;
}
async function deleteAsset(id, assetId) {
  return update(id, (p) => {
    const a = (p.assets || []).find((x) => x.id === assetId);
    if (a) { for (const f of [a.rel, a.thumb]) if (f) { try { fs.unlinkSync(path.join(p.dir, f)); } catch (_) {} } }
    p.assets = (p.assets || []).filter((x) => x.id !== assetId);
    for (const c of p.clips || []) {
      if (!c.edit) continue;
      c.edit.inserts = (c.edit.inserts || []).filter((x) => x.asset !== assetId);
      c.edit.overlays = (c.edit.overlays || []).filter((x) => x.asset !== assetId);
      if (c.edit.music && c.edit.music.asset === assetId) c.edit.music = null;
    }
    return p;
  });
}
/** Save rasterized overlay PNGs for a clip (replaces previous ones). */
function saveRasters(id, clipId, list) {
  const p = store.loadProject(id);
  const dir = path.join(p.dir, 'edit');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.startsWith(clipId + '_')) { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} }
  return (list || []).map((r, i) => {
    const rel = `edit/${clipId}_${i}_${uid(4)}.png`;
    fs.writeFileSync(path.join(p.dir, rel), Buffer.from(String(r.dataUrl).split(',')[1], 'base64'));
    return { rel, start: r.start, end: r.end };
  });
}

module.exports = {
  importAssets, deleteAsset, saveRasters,
  setEmitter, createProject, runPipeline, cancel, renderClips, patchClip, patchClips, addClip, deleteClip, setWebcam, deleteRender,
  saveThumbnail, publicProject, active, STEP_KEYS,
};
