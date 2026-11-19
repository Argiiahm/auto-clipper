const { fetchRetry } = require('./http');
const { transcriptToText, fmt } = require('./transcribe');

const PROVIDERS = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', chunkTokens: 4200, jsonMode: true, keyUrl: 'https://console.groq.com/keys' },
  gemini: { name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', chunkTokens: 90000, jsonMode: true, keyUrl: 'https://aistudio.google.com/apikey' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', chunkTokens: 24000, jsonMode: false, keyUrl: 'https://openrouter.ai/keys' },
  custom: { name: 'Custom (OpenAI-compatible)', base: '', chunkTokens: 6000, jsonMode: false, keyUrl: '' },
};

function providerConf(settings, override) {
  const id = (override && override.provider) || settings.llmProvider || 'groq';
  const p = PROVIDERS[id] || PROVIDERS.groq;
  const base = id === 'custom' ? String(settings.customBaseUrl || '').replace(/\/+$/, '') : p.base;
  const key = (override && override.key !== undefined ? override.key : (settings.keys || {})[id]) || '';
  const model = (override && override.model) || (settings.models || {})[id] || '';
  return { id, ...p, base, key, model };
}

function headers(conf) {
  const h = { 'Content-Type': 'application/json' };
  if (conf.key) h.Authorization = `Bearer ${conf.key}`;
  if (conf.id === 'openrouter') { h['HTTP-Referer'] = 'https://autoclipper.local'; h['X-Title'] = 'AutoClipper'; }
  return h;
}

async function chat(conf, messages, { json = true, maxTokens = 2500, temperature = 0.4, onWait, signal } = {}) {
  if (!conf.base) throw new Error('Base URL LLM belum diisi (Settings).');
  if (!conf.key && conf.id !== 'custom') throw new Error(`API key ${conf.name} belum diisi. Buka Settings.`);
  if (!conf.model) throw new Error('Model LLM belum dipilih (Settings).');
  const body = { model: conf.model, messages, temperature, max_tokens: maxTokens };
  if (/gpt-oss/i.test(conf.model) && conf.id === 'groq') { body.reasoning_effort = 'low'; delete body.temperature; }
  if (/qwen3/i.test(conf.model) && conf.id === 'groq') body.reasoning_format = 'hidden';
  const tryOnce = (b) => fetchRetry(`${conf.base}/chat/completions`, () => ({ method: 'POST', headers: headers(conf), body: JSON.stringify(b) }), { onWait, signal, retries: 10, maxWaitTotal: 1200 });
  let res;
  if (json && conf.jsonMode) {
    try { res = await tryOnce({ ...body, response_format: { type: 'json_object' } }); }
    catch (e) {
      if (/response_format|json_object|json mode|json_validate_failed|Failed to generate JSON/i.test(e.message)) res = await tryOnce(body);
      else throw e;
    }
  } else res = await tryOnce(body);
  const msg = res && res.choices && res.choices[0] && res.choices[0].message;
  let content = msg ? (msg.content || '') : '';
  if (Array.isArray(content)) content = content.map((c) => c.text || '').join('');
  if (!content && msg && msg.reasoning) content = msg.reasoning;
  if (!json) return content;
  return parseJsonLoose(content);
}

function parseJsonLoose(text) {
  let t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1];
  try { return JSON.parse(t); } catch (_) {}
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch (_) {} }
  const sa = t.indexOf('['); const ea = t.lastIndexOf(']');
  if (sa >= 0 && ea > sa) { try { return { clips: JSON.parse(t.slice(sa, ea + 1)) }; } catch (_) {} }
  throw new Error('Respon LLM bukan JSON valid: ' + t.slice(0, 200));
}

function parseTime(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').trim().replace(/[\[\]]/g, '');
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const parts = s.split(':').map(parseFloat);
  if (parts.some(isNaN)) return NaN;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

const LANG_NAMES = { id: 'Bahasa Indonesia', en: 'English', ms: 'Bahasa Melayu', jv: 'Basa Jawa', su: 'Basa Sunda', es: 'Español', pt: 'Português', ja: '日本語', ko: '한국어', th: 'ไทย', vi: 'Tiếng Việt', hi: 'Hindi', ar: 'Arabic', zh: '中文' };

function buildPrompt({ transcriptText, minLen, maxLen, want, titleLang, videoTitle, from, to }) {
  const langLine = titleLang && titleLang !== 'auto'
    ? `Write "title", "description" and "hook" in ${LANG_NAMES[titleLang] || titleLang}.`
    : 'Write "title", "description" and "hook" in the SAME language as the transcript (e.g. Indonesian transcript → Indonesian, casual/gaul is fine).';
  const system = `You are a world-class short-form video editor (TikTok, Instagram Reels, YouTube Shorts). You find the most viral, self-contained moments in long videos (podcasts, streams, gaming, vlogs, talks).
Rules for every clip:
- Length MUST be between ${minLen} and ${maxLen} seconds.
- Start exactly where a sentence or a strong hook begins (no mid-sentence start). The first 3 seconds must grab attention.
- End at a natural payoff / punchline / conclusion. The clip must make sense without extra context.
- Prefer: strong emotions, funny reactions, hot takes, surprising facts, conflicts, clutch/epic moments, quotable lines, useful tips, storytelling with payoff.
- Clips must not overlap each other.
- "score" = predicted virality 0-100 (be honest and discriminating, spread scores).
- "title" = catchy short-video title, max 70 chars, can include 1 emoji at most.
- "description" = 1-2 sentences: what happens and why it's engaging.
- "hook" = punchy thumbnail/opening headline, max 8 words.
${langLine}
Return ONLY JSON: {"clips":[{"start":"m:ss","end":"m:ss","title":"...","description":"...","hook":"...","score":85}]}
Use timestamps from the transcript (format [m:ss] or [h:mm:ss]).`;
  const user = `Video title: ${videoTitle || '-'}
Transcript window: ${fmt(from)} – ${fmt(to)}
Find up to ${want} of the best clips inside this window (fewer if the content is weak).

TRANSCRIPT:
${transcriptText}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Split transcript segments into windows that fit the provider's token budget. */
function windows(transcript, chunkTokens) {
  const segs = transcript.segments;
  const out = []; let cur = []; let tok = 0;
  const overlapSegs = 6;
  for (const s of segs) {
    const t = Math.ceil((s.text.length + 10) / 3.3);
    if (tok + t > chunkTokens && cur.length) {
      out.push(cur);
      cur = cur.slice(-overlapSegs); tok = cur.reduce((a, x) => a + Math.ceil((x.text.length + 10) / 3.3), 0);
    }
    cur.push(s); tok += t;
  }
  if (cur.length) out.push(cur);
  return out;
}

function snapClip(c, words, duration, minLen, maxLen) {
  let { start, end } = c;
  if (words && words.length) {
    // snap start to the nearest word start (prefer slightly before)
    let best = null;
    for (const w of words) { if (w.s >= start - 1.5 && w.s <= start + 1.5) { if (!best || Math.abs(w.s - start) < Math.abs(best.s - start)) best = w; } if (w.s > start + 2) break; }
    if (best) start = Math.max(0, best.s - 0.12);
    let bestE = null;
    for (const w of words) { if (w.e >= end - 1.5 && w.e <= end + 2) { if (!bestE || Math.abs(w.e - end) < Math.abs(bestE.e - end)) bestE = w; } if (w.s > end + 3) break; }
    if (bestE) end = bestE.e + 0.25;
  }
  if (end - start < minLen) end = start + minLen;
  if (end - start > maxLen) end = start + maxLen;
  end = Math.min(end, duration || end);
  return { ...c, start: +start.toFixed(2), end: +end.toFixed(2) };
}

function dedupe(clips) {
  const sorted = [...clips].sort((a, b) => b.score - a.score);
  const kept = [];
  for (const c of sorted) {
    const overlaps = kept.some((k) => {
      const ov = Math.min(k.end, c.end) - Math.max(k.start, c.start);
      return ov > 0.35 * Math.min(k.end - k.start, c.end - c.start);
    });
    if (!overlaps) kept.push(c);
  }
  return kept;
}

async function findHighlights({ settings, transcript, duration, videoTitle, onProgress, signal }) {
  const conf = providerConf(settings);
  const minLen = Number(settings.minLen) || 20; const maxLen = Number(settings.maxLen) || 90;
  const target = Math.max(1, Number(settings.clipCount) || 10);
  const wins = windows(transcript, conf.chunkTokens);
  const all = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const from = w[0].s; const to = w[w.length - 1].e;
    const share = (to - from) / Math.max(1, duration || to);
    const want = Math.max(2, Math.min(12, Math.ceil(target * share * 1.8)));
    onProgress && onProgress(i / wins.length, `Analisa bagian ${i + 1}/${wins.length} dengan ${conf.name} (${conf.model})…`);
    const text = w.map((s) => `[${fmt(s.s)}] ${s.text}`).join('\n');
    let res;
    try {
      res = await chat(conf, buildPrompt({ transcriptText: text, minLen, maxLen, want, titleLang: settings.titleLanguage, videoTitle, from, to }), {
        maxTokens: conf.id === 'groq' ? 2200 : 4000, signal,
        onWait: (sec, why) => onProgress && onProgress(i / wins.length, `Menunggu ${why} ${conf.name} (${Math.round(sec)} dtk)… bagian ${i + 1}/${wins.length}`),
      });
    } catch (e) {
      if (/Dibatalkan|API key|harian/i.test(e.message) || wins.length === 1) throw e;
      onProgress && onProgress(i / wins.length, `Bagian ${i + 1} gagal: ${e.message.slice(0, 80)} — lanjut`);
      continue;
    }
    const arr = Array.isArray(res) ? res : (res.clips || res.highlights || res.moments || []);
    for (const c of arr) {
      const start = parseTime(c.start); const end = parseTime(c.end);
      if (!isFinite(start) || !isFinite(end) || end <= start) continue;
      if (start < from - 5 || start > to + 5) continue;
      all.push({ start, end, title: String(c.title || '').slice(0, 120), description: String(c.description || c.reason || '').slice(0, 400), hook: String(c.hook || c.title || '').slice(0, 120), score: Math.max(0, Math.min(100, Math.round(Number(c.score) || 50))) });
    }
  }
  onProgress && onProgress(1, 'Menyusun hasil…');
  const snapped = all.map((c) => snapClip(c, transcript.words, duration, minLen, maxLen));
  const final = dedupe(snapped).slice(0, target).sort((a, b) => a.start - b.start);
  if (!final.length) throw new Error('LLM tidak menemukan klip. Coba model lain atau ubah durasi min/max.');
  return final;
}

async function suggestTitle({ settings, text, titleLang }) {
  const conf = providerConf(settings);
  const lang = titleLang && titleLang !== 'auto' ? (LANG_NAMES[titleLang] || titleLang) : 'the same language as the text';
  const res = await chat(conf, [
    { role: 'system', content: `You write viral short-video titles. Reply ONLY JSON {"title":"...","description":"...","hook":"..."} in ${lang}. title max 70 chars, hook max 8 words.` },
    { role: 'user', content: text.slice(0, 6000) },
  ], { maxTokens: 600 });
  return { title: String(res.title || ''), description: String(res.description || ''), hook: String(res.hook || '') };
}

async function listModels(settings, override) {
  const conf = providerConf(settings, override);
  if (!conf.base) throw new Error('Base URL kosong');
  const res = await fetchRetry(`${conf.base}/models`, () => ({ headers: headers(conf) }), { retries: 1 });
  let items = (res.data || res.models || []).map((m) => ({
    id: String(m.id || m.name || '').replace(/^models\//, ''),
    free: conf.id === 'openrouter' ? (/:free$/.test(m.id) || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)) : undefined,
    ctx: m.context_length || m.context_window || undefined,
  })).filter((m) => m.id);
  if (conf.id === 'groq') items = items.filter((m) => !/whisper|tts|orpheus|guard|playai|distil/i.test(m.id));
  if (conf.id === 'gemini') items = items.filter((m) => /gemini|gemma/i.test(m.id) && !/embedding|image|tts|live|audio|veo|imagen/i.test(m.id));
  if (conf.id === 'openrouter') items = items.filter((m) => m.free);
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

async function testConnection(settings, override) {
  const conf = providerConf(settings, override);
  const t0 = Date.now();
  const r = await chat(conf, [{ role: 'user', content: 'Reply with JSON {"ok":true}' }], { maxTokens: 300 });
  return { ok: true, ms: Date.now() - t0, provider: conf.name, model: conf.model, reply: r };
}

module.exports = { PROVIDERS, providerConf, chat, findHighlights, suggestTitle, listModels, testConnection, parseTime, windows, snapClip, dedupe, parseJsonLoose };
