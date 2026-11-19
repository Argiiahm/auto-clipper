const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};
const on = (ch, cb) => { const fn = (_e, d) => cb(d); ipcRenderer.on(ch, fn); return () => ipcRenderer.removeListener(ch, fn); };

contextBridge.exposeInMainWorld('api', {
  call, on,
  fileUrl: (p) => (p ? pathToFileURL(p).href : ''),
  join: (...a) => path.join(...a),
  platform: process.platform,
});
