const fs = require('fs');
const path = require('path');
const { fetchRetry } = require('./http');

const GROQ_STT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const OPENAI_STT = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Universal OpenAI-compatible Whisper transcription (Groq, OpenAI, 9Router, Custom server).
 */
async function whisperTranscribeChunk(chunk, { endpoint, apiKey, model, language, onWait, signal }) {
  const buf = fs.readFileSync(chunk.file);
  const ep = endpoint || GROQ_STT;
  const json = await fetchRetry(ep, () => {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), path.basename(chunk.file));
    if (model) fd.append('model', model);
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word');
    fd.append('timestamp_granularities[]', 'segment');
    fd.append('temperature', '0');
    if (language && language !== 'auto') fd.append('language', language);
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return { method: 'POST', headers, body: fd };
  }, { onWait, signal, retries: 8, maxWaitTotal: 3700, timeoutMs: 65000 });

  const off = chunk.start;
  let segments = [];
  let words = [];

  if (Array.isArray(json.segments)) {
    segments = json.segments.map((s) => ({
      s: (Number(s.start) || 0) + off,
      e: (Number(s.end) || 0) + off,
      text: String(s.text || '').trim(),
    })).filter((s) => s.text);
  }

  if (Array.isArray(json.words)) {
    words = json.words.map((w) => ({
      w: String(w.word || '').trim(),
      s: (Number(w.start) || 0) + off,
      e: (Number(w.end) || 0) + off,
    })).filter((w) => w.w);
  }

  // Fallback if provider only returned simple { text: "..." }
  if (!segments.length && json.text) {
    segments = [{ s: off, e: off + (chunk.len || 10), text: String(json.text).trim() }];
  }
  if (!words.length && segments.length) {
    words = wordsFromSegments(segments);
  }

  return { language: json.language, segments, words };
}

/**
 * Google Gemini multimodal audio transcription (Free, accurate, multilingual).
 */
async function geminiTranscribeChunk(chunk, { apiKey, model = 'gemini-2.5-flash', language, onWait, signal }) {
  if (!apiKey) throw new Error('API key Google Gemini belum diisi. Buka Settings.');
  const buf = fs.readFileSync(chunk.file);
  const b64 = buf.toString('base64');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const langInstruction = language && language !== 'auto' ? ` The spoken audio is in ${language}.` : '';
  const prompt = `Transcribe this audio recording accurately.${langInstruction}
Return ONLY a valid JSON object matching this exact schema:
{
  "language": "id",
  "segments": [
    {"start": 0.0, "end": 3.5, "text": "transcribed speech..."},
    {"start": 3.5, "end": 7.0, "text": "next phrase..."}
  ]
}
Requirements:
1. start and end are floating point numbers in seconds relative to the audio start (0.0 to ${Math.round(chunk.len || 600)}).
2. Group spoken words into short natural sentences or phrases (2-6 seconds each).
3. Transcribe all spoken words accurately without omitting anything.
4. Output strictly valid JSON without markdown wrapping.`;

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'audio/mp3', data: b64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      temperature: 0.1,
    },
  };

  const res = await fetchRetry(url, () => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), { onWait, signal, retries: 5, maxWaitTotal: 1800, timeoutMs: 90000 });

  let rawText = '';
  if (res && res.candidates && res.candidates[0] && res.candidates[0].content) {
    const parts = res.candidates[0].content.parts || [];
    rawText = parts.map((p) => p.text || '').join('');
  }

  if (!rawText.trim()) throw new Error('Respon transkrip Gemini kosong');

  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim());
  } catch (e) {
    throw new Error('Gagal memproses JSON transkrip Gemini: ' + rawText.slice(0, 150));
  }

  const off = chunk.start;
  const rawSegs = Array.isArray(parsed.segments) ? parsed.segments : [];
  const segments = rawSegs.map((s) => ({
    s: (Number(s.start) || 0) + off,
    e: (Number(s.end) || 0) + off,
    text: String(s.text || '').trim(),
  })).filter((s) => s.text);

  const words = wordsFromSegments(segments);
  return { language: parsed.language || language, segments, words };
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

/**
 * Unified multi-provider transcription runner (Groq, Gemini, OpenAI, 9Router, Custom).
 */
async function transcribe(chunks, opts = {}, onProgress) {
  const { provider = 'groq', apiKey, model, language, endpoint, signal } = opts;
  const all = { language: null, segments: [], words: [] };

  const provLabels = {
    groq: 'Groq Whisper',
    gemini: 'Google Gemini',
    openai: 'OpenAI Whisper',
    '9router': '9Router Whisper',
    custom: 'Custom STT',
  };
  const label = provLabels[provider] || provider;

  for (let i = 0; i < chunks.length; i++) {
    onProgress && onProgress(i / chunks.length, `Transkrip bagian ${i + 1}/${chunks.length} via ${label}…`);

    let r;
    if (provider === 'gemini') {
      r = await geminiTranscribeChunk(chunks[i], {
        apiKey,
        model: model || 'gemini-2.5-flash',
        language,
        onWait: (sec, why) => onProgress && onProgress(i / chunks.length, `Menunggu ${why} Gemini (${Math.round(sec)} dtk)…`),
        signal,
      });
    } else {
      const ep = endpoint || (
        provider === 'openai' ? OPENAI_STT
        : provider === '9router' ? 'http://localhost:20128/v1/audio/transcriptions'
        : GROQ_STT
      );
      const mod = model || (provider === 'openai' ? 'whisper-1' : 'whisper-large-v3-turbo');
      r = await whisperTranscribeChunk(chunks[i], {
        endpoint: ep,
        apiKey,
        model: mod,
        language,
        onWait: (sec, why) => onProgress && onProgress(i / chunks.length, `Menunggu ${why} ${label} (${Math.round(sec)} dtk)…`),
        signal,
      });
    }

    all.language = all.language || r.language;
    // de-duplicate words at chunk boundaries
    const lastEnd = all.words.length ? all.words[all.words.length - 1].e : -1;
    all.words.push(...r.words.filter((w) => w.s >= lastEnd - 0.05));
    all.segments.push(...r.segments);
  }

  onProgress && onProgress(1, 'Selesai');
  return { source: provider, ...all };
}

/** Backward compatibility alias */
async function transcribeGroq(chunks, opts, onProgress) {
  return transcribe(chunks, { provider: 'groq', ...opts }, onProgress);
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

module.exports = { transcribe, transcribeGroq, parseJson3, segmentsFromWords, wordsFromSegments, transcriptToText, fmt };
