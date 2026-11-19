const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./lib/store');
const pipeline = require('./lib/pipeline');
const llm = require('./lib/llm');
const media = require('./lib/media');
const { userDataDir } = require('./lib/paths');

let win = null;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
pipeline.setEmitter(send);

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function applyTheme(t) {
  nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system';
  if (win && !win.isDestroyed()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#121214' : '#f2f3f5');
}

function createWindow() {
  try { applyTheme(store.loadSettings().theme); } catch (_) { applyTheme('system'); }
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1180, minHeight: 720, backgroundColor: nativeTheme.shouldUseDarkColors ? '#121214' : '#f2f3f5', title: 'AutoClipper', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.show(); if (process.env.AC_MAXIMIZE !== '0') win.maximize(); });
  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (/^https?:/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools();
  });
}

/** Projects interrupted by a crash/close shouldn't look like they are still running */
function recoverInterrupted() {
  try {
    for (const p of store.listProjects()) {
      const full = store.loadProject(p.id);
      let changed = false;
      for (const k of Object.keys(full.steps || {})) if (full.steps[k].status === 'running') { full.steps[k] = { status: 'error', detail: 'Terhenti (aplikasi ditutup). Klik Ulangi.', progress: 0 }; changed = true; }
      for (const c of full.clips || []) if (c.render && ['queued', 'rendering'].includes(c.render.status)) { c.render = null; changed = true; }
      if (changed) store.saveProject(full);
    }
  } catch (_) {}
}

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) }; }
});

handle('settings:get', () => store.loadSettings());
handle('settings:save', (s) => { const r = store.saveSettings(s); if (s && s.theme !== undefined) applyTheme(r.theme); return r; });
handle('theme:set', (t) => { applyTheme(t); return nativeTheme.shouldUseDarkColors; });
nativeTheme.on('updated', () => send('theme:updated', nativeTheme.shouldUseDarkColors));
handle('projects:list', () => store.listProjects());
handle('project:get', (id) => pipeline.publicProject(store.loadProject(id)));
handle('project:create', (opts) => pipeline.createProject(opts));
handle('project:delete', (id) => { pipeline.cancel(id); store.deleteProject(id); send('projects:changed'); return true; });
handle('project:run', (id, from, only) => { pipeline.runPipeline(id, from, only).catch(() => {}); return true; });
handle('project:cancel', (id) => { pipeline.cancel(id); return true; });
handle('project:rename', async (id, title) => { const p = store.loadProject(id); p.title = title; return store.saveProject(p); });
handle('transcript:get', (id) => store.loadTranscript(store.loadProject(id)));
handle('clip:patch', (id, clipId, patch) => pipeline.patchClip(id, clipId, patch));
handle('clips:patch', (id, clipIds, patch) => pipeline.patchClips(id, clipIds, patch));
handle('clip:add', (id, range) => pipeline.addClip(id, range));
handle('clip:delete', (id, clipId) => pipeline.deleteClip(id, clipId));
handle('clip:aiTitle', async (id, clipId) => {
  const p = store.loadProject(id); const t = store.loadTranscript(p); const c = p.clips.find((x) => x.id === clipId);
  if (!t || !c) throw new Error('Transkrip tidak ada');
  const text = t.words.filter((w) => w.s >= c.start && w.e <= c.end).map((w) => w.w).join(' ');
  if (!text.trim()) throw new Error('Tidak ada ucapan di rentang klip ini');
  const r = await llm.suggestTitle({ settings: store.loadSettings(), text, titleLang: store.loadSettings().titleLanguage });
  return pipeline.patchClip(id, clipId, { title: r.title || c.title, description: r.description || c.description, hook: r.hook || c.hook, thumbHeadline: r.hook || c.thumbHeadline });
});
handle('webcam:set', (id, rect) => pipeline.setWebcam(id, rect));
handle('render:start', (id, clipIds, rasters) => { pipeline.renderClips(id, clipIds, rasters).catch((e) => send('render:finished', { id, error: e.message })); return true; });
handle('render:delete', (id, renderId) => pipeline.deleteRender(id, renderId));
handle('asset:import', async (id, kinds) => {
  const filters = {
    media: [{ name: 'Video / Gambar', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    image: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    audio: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'] }],
  }[kinds || 'media'];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled || !r.filePaths.length) return [];
  return pipeline.importAssets(id, r.filePaths);
});
handle('asset:delete', (id, assetId) => pipeline.deleteAsset(id, assetId));
handle('raster:save', (id, clipId, list) => pipeline.saveRasters(id, clipId, list));
handle('watermark:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = path.join(userDataDir(), 'watermark'); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} }
  const dst = path.join(dir, 'logo_' + Date.now() + path.extname(r.filePaths[0]).toLowerCase());
  fs.copyFileSync(r.filePaths[0], dst);
  return dst;
});
handle('thumb:save', (id, clipId, dataUrl) => pipeline.saveThumbnail(id, clipId, dataUrl));
handle('llm:models', (override) => llm.listModels(store.loadSettings(), override));
handle('llm:test', (override) => llm.testConnection(store.loadSettings(), override));
handle('llm:providers', () => llm.PROVIDERS);
handle('sys:versions', () => media.versions());
handle('sys:updateYtdlp', () => media.updateYtDlp(path.join(userDataDir(), 'bin')));
handle('sys:info', () => ({ version: app.getVersion(), userData: userDataDir(), platform: process.platform }));
handle('dialog:openVideo', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'flv', 'ts'] }] });
  return r.canceled ? null : r.filePaths[0];
});
handle('dialog:pickFolder', async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
handle('dialog:pickFile', async (filters) => { const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] }); return r.canceled ? null : r.filePaths[0]; });
handle('shell:open', (p) => shell.openPath(p));
handle('shell:show', (p) => { if (fs.existsSync(p)) shell.showItemInFolder(p); else shell.openPath(path.dirname(p)); return true; });
handle('shell:external', (u) => shell.openExternal(u));
handle('fs:exists', (p) => fs.existsSync(p));

app.whenReady().then(() => { recoverInterrupted(); createWindow(); });
app.on('window-all-closed', () => {
  for (const id of pipeline.active.keys()) pipeline.cancel(id);
  app.quit();
});
