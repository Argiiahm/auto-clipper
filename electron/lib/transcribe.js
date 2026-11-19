const fs = require('fs');
const path = require('path');
const { fetchRetry } = require('./http');

const GROQ_STT = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function groqTranscribeChunk(chunk, { apiKey, model, language, onWait, signal }) {
  const buf = fs.readFileSync(chunk.file);
  const json = await fetchRetry(GROQ_STT, () => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), path.basename(chunk.file));
    fd.append('model', model || 'whisper-large-v3-turbo');
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word');
    fd.append('timestamp_granularities[]', 'segment');
    fd.append('temperature', '0');
    if (language && language !== 'auto') fd.append('language', language);
    return { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd };
  }, { onWait, signal, retries: 12, maxWaitTotal: 3700 });
  const off = chunk.start;
  const segments = (json.segments || []).map((s) => ({ s: s.start + off, e: s.end + off, text: String(s.text || '').trim() })).filter((s) => s.text);
  let words = (json.words || []).map((w) => ({ w: String(w.word || '').trim(), s: w.start + off, e: w.end + off })).filter((w) => w.w);
  if (!words.length) words = wordsFromSegments(segments);
  return { language: json.language, segments, words };
}

function wordsFromSegments(segments) {
  const words = [];
  for (const seg of segments) {
    const toks = seg.text.split(/\s+/).filter(Boolean);
    const dur = Math.max(0.01, seg.e - seg.s);
    const total = toks.reduce((a, t) => a + t.length + 1, 0);
    let t = seg.s;
    for (const tok of toks) {
      const d = dur * ((tok.length + 1) / total);
      words.push({ w: tok, s: t, e: t + d });
      t += d;
    }
  }
  return words;
}

/** Make segments from words if the source didn't provide nice ones (sentence-ish, <= ~12s). */
function segmentsFromWords(words) {
  const segs = []; let cur = null;
  for (const w of words) {
    if (!cur) cur = { s: w.s, e: w.e, text: w.w };
    else { cur.text += ' ' + w.w; cur.e = w.e; }
    if (/[.!?…]$/.test(w.w) || cur.e - cur.s > 12) { segs.push(cur); cur = null; }
  }
  if (cur) segs.push(cur);
  return segs;
}

async function transcribeGroq(chunks, opts, onProgress) {
  const all = { language: null, segments: [], words: [] };
  for (let i = 0; i < chunks.length; i++) {
    onProgress && onProgress(i / chunks.length, `Transkrip bagian ${i + 1}/${chunks.length}…`);
    const r = await groqTranscribeChunk(chunks[i], {
      ...opts,
      onWait: (sec, why) => onProgress && onProgress(i / chunks.length, `Menunggu ${why} Groq (${Math.round(sec)} dtk)…`),
    });
    all.language = all.language || r.language;
    // de-duplicate words at chunk boundaries
    const lastEnd = all.words.length ? all.words[all.words.length - 1].e : -1;
    all.words.push(...r.words.filter((w) => w.s >= lastEnd - 0.05));
    all.segments.push(...r.segments);
  }
  onProgress && onProgress(1, 'Selesai');
  return { source: 'groq', ...all };
}

/** Parse YouTube json3 caption file into words + segments */
function parseJson3(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const words = []; const segments = [];
  for (const ev of j.events || []) {
    if (!ev.segs) continue;
    const t0 = (ev.tStartMs || 0) / 1000; const dur = (ev.dDurationMs || 0) / 1000;
    const segs = ev.segs.filter((s) => s.utf8 && s.utf8 !== '\n');
    if (!segs.length) continue;
    const text = segs.map((s) => s.utf8).join('').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (segs.length > 1 || segs[0].tOffsetMs !== undefined) {
      // auto captions: per-word offsets
      const ws = segs.map((s) => ({ w: s.utf8.trim(), s: t0 + (s.tOffsetMs || 0) / 1000 })).filter((x) => x.w);
      ws.forEach((w, i) => { w.e = i + 1 < ws.length ? ws[i + 1].s : t0 + dur; });
      ws.forEach((w) => { w.e = Math.min(w.e, w.s + 1.2); });
      words.push(...ws);
    } else {
      words.push(...wordsFromSegments([{ s: t0, e: t0 + dur, text }]));
    }
  }
  words.sort((a, b) => a.s - b.s);
  // fix overlaps from rolling captions
  for (let i = 0; i < words.length - 1; i++) if (words[i].e > words[i + 1].s) words[i].e = Math.max(words[i].s + 0.05, words[i + 1].s);
  const clean = words.filter((w) => !/^\[.*\]$/.test(w.w));
  segments.push(...segmentsFromWords(clean));
  return { words: clean, segments };
}

function transcriptToText(t, from = 0, to = Infinity, maxSeg = 1e9) {
  return t.segments.filter((s) => s.e > from && s.s < to).slice(0, maxSeg).map((s) => `[${fmt(s.s)}] ${s.text}`).join('\n');
}
function fmt(sec) {
  sec = Math.max(0, sec); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}

module.exports = { transcribeGroq, parseJson3, segmentsFromWords, transcriptToText, fmt };
