const path = require('path');
const fs = require('fs');

let electronApp = null;
try { electronApp = require('electron').app; } catch (_) { electronApp = null; }

const isWin = process.platform === 'win32';
const exe = (n) => (isWin ? `${n}.exe` : n);
const appRoot = path.join(__dirname, '..', '..');

function isPackaged() {
  return !!(electronApp && electronApp.isPackaged);
}

function userDataDir() {
  if (process.env.AUTOCLIPPER_DATA) return process.env.AUTOCLIPPER_DATA;
  if (electronApp && electronApp.getPath) return electronApp.getPath('userData');
  return path.join(require('os').homedir(), '.autoclipper');
}

function defaultWorkspace() {
  if (process.env.AUTOCLIPPER_WORKSPACE) return process.env.AUTOCLIPPER_WORKSPACE;
  try {
    if (electronApp && electronApp.getPath) return path.join(electronApp.getPath('documents'), 'AutoClipper');
  } catch (_) {}
  return path.join(require('os').homedir(), 'AutoClipper');
}

function binDirs() {
  const dirs = [path.join(userDataDir(), 'bin')];
  if (process.resourcesPath && isPackaged()) dirs.push(path.join(process.resourcesPath, 'bin'));
  dirs.push(path.join(appRoot, 'resources', isWin ? 'bin-win' : `bin-${process.platform}`));
  return dirs;
}

/** Resolve a binary: user-updated copy > bundled > system PATH */
function resolveBin(name) {
  for (const d of binDirs()) {
    const p = path.join(d, exe(name));
    if (fs.existsSync(p)) return p;
  }
  return exe(name); // rely on PATH
}

function fontsDir() {
  if (process.resourcesPath && isPackaged()) {
    const p = path.join(process.resourcesPath, 'fonts');
    if (fs.existsSync(p)) return p;
  }
  return path.join(appRoot, 'resources', 'fonts');
}

module.exports = { isWin, exe, appRoot, userDataDir, defaultWorkspace, resolveBin, fontsDir, binDirs };
