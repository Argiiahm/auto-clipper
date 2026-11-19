const fs = require('fs');
const path = require('path');
const { userDataDir, defaultWorkspace } = require('./paths');

let safeStorage = null;
try { safeStorage = require('electron').safeStorage; } catch (_) {}

const DEFAULT_SETTINGS = {
  workspaceDir: '',
  theme: 'system', // system | light | dark
  llmProvider: 'groq', // groq | gemini | openrouter | 9router | custom
  models: {
    groq: 'openai/gpt-oss-120b',
    gemini: 'gemini-2.5-flash',
    openrouter: 'openrouter/free',
    '9router': '',
    custom: 'llama3.1',
  },
  nineRouterBaseUrl: 'http://localhost:20128/v1',
  customBaseUrl: 'http://localhost:11434/v1',
  transcriber: 'groq', // groq | gemini | openai | 9router | custom | youtube
  whisperModel: 'whisper-large-v3-turbo',
  geminiSttModel: 'gemini-2.5-flash',
  customSttUrl: 'http://localhost:20128/v1/audio/transcriptions',
  language: 'auto', // spoken language: auto | id | en | ...
  titleLanguage: 'auto', // language of clip titles: auto = same as video
  clipCount: 10,
  minLen: 20,
  maxLen: 90,
  maxHeight: 1080,
  encoder: 'libx264', // libx264 | h264_nvenc | h264_qsv | h264_amf
  quality: 'high', // fast | balanced | high
  cookiesBrowser: '', // '' | chrome | edge | firefox | brave
  cookiesFile: '',
  defaults: {
    layout: 'fill', // split | fill | fit
    captionStyle: 'pop', // pop | neon | box | comic | clean | focus
    burnCaptions: true,
    captionPos: 75,
    wordsPerLine: 3,
    splitRatio: 42,
  },
  watermark: {
    enabled: false,
    type: 'text', // text | image
    text: '@username',
    font: 'Montserrat', weight: 800, size: 46, color: '#FFFFFF', stroke: 0, strokeColor: '#000000', shadow: true,
    image: '', // absolute path (copied into userData/watermark)
    imageW: 0.22, // width as fraction of 1080
    pos: 'tr', // tl | tc | tr | ml | mc | mr | bl | bc | br
    margin: 48,
    opacity: 0.8,
  },
};

const KEY_NAMES = ['groq', 'gemini', 'openrouter', '9router', 'custom', 'openai'];

function settingsPath() { return path.join(userDataDir(), 'settings.json'); }

function canEncrypt() {
  try { return !!(safeStorage && safeStorage.isEncryptionAvailable()); } catch (_) { return false; }
}

function encodeKey(v) {
  if (!v) return '';
  if (canEncrypt()) return 'enc:' + safeStorage.encryptString(v).toString('base64');
  return 'b64:' + Buffer.from(v, 'utf8').toString('base64');
}
function decodeKey(v) {
  if (!v) return '';
  try {
    if (v.startsWith('enc:')) return canEncrypt() ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : '';
    if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
  } catch (_) { return ''; }
  return v;
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

function loadSettings() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (_) {}
  const s = deepMerge(DEFAULT_SETTINGS, raw);
  s.keys = {};
  for (const k of KEY_NAMES) s.keys[k] = decodeKey((raw.keys || {})[k] || '');
  if (process.env.GROQ_API_KEY && !s.keys.groq) s.keys.groq = process.env.GROQ_API_KEY;
  if (!s.workspaceDir) s.workspaceDir = defaultWorkspace();
  return s;
}

function saveSettings(next) {
  const cur = loadSettings();
  const merged = deepMerge(cur, next || {});
  const toWrite = { ...merged, keys: {} };
  for (const k of KEY_NAMES) toWrite.keys[k] = encodeKey((merged.keys || {})[k] || '');
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2));
  return loadSettings();
}

/* ---------------- projects ---------------- */
function projectsRoot(settings) {
  const s = settings || loadSettings();
  const p = path.join(s.workspaceDir, 'projects');
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function projectDir(id, settings) { return path.join(projectsRoot(settings), id); }

function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function loadProject(id) {
  const f = path.join(projectDir(id), 'project.json');
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  p.dir = projectDir(id);
  return p;
}
function saveProject(p) {
  const dir = projectDir(p.id);
  fs.mkdirSync(dir, { recursive: true });
  const { dir: _d, ...rest } = p;
  rest.updatedAt = Date.now();
  writeJsonAtomic(path.join(dir, 'project.json'), rest);
  return { ...rest, dir };
}
function listProjects() {
  const root = projectsRoot();
  const out = [];
  for (const id of fs.readdirSync(root)) {
    try {
      const p = loadProject(id);
      out.push({
        id: p.id, title: p.title, channel: p.channel, url: p.url, createdAt: p.createdAt, updatedAt: p.updatedAt,
        duration: p.video && p.video.duration, clipCount: (p.clips || []).length, renderCount: (p.renders || []).length,
        steps: p.steps, cover: p.cover ? path.join(p.dir, p.cover) : null, dir: p.dir,
      });
    } catch (_) {}
  }
  return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function deleteProject(id) {
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

function loadTranscript(p) {
  try { return JSON.parse(fs.readFileSync(path.join(p.dir || projectDir(p.id), 'transcript.json'), 'utf8')); } catch (_) { return null; }
}
function saveTranscript(p, t) {
  writeJsonAtomic(path.join(p.dir || projectDir(p.id), 'transcript.json'), t);
}

module.exports = {
  DEFAULT_SETTINGS, loadSettings, saveSettings, projectsRoot, projectDir, loadProject, saveProject, listProjects,
  deleteProject, loadTranscript, saveTranscript, writeJsonAtomic,
};
