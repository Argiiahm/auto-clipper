const { spawn } = require('child_process');

const running = new Map(); // jobKey -> Set<ChildProcess>

function track(key, child) {
  if (!key) return;
  if (!running.has(key)) running.set(key, new Set());
  running.get(key).add(child);
  child.on('close', () => running.get(key) && running.get(key).delete(child));
}

function killJob(key) {
  const set = running.get(key);
  if (!set) return;
  for (const c of set) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true });
      else c.kill('SIGKILL');
    } catch (_) {}
  }
  set.clear();
}

/**
 * Run a process, stream lines to onLine, resolve with {code, stdout, stderr}.
 */
function run(cmd, args, { cwd, env, onLine, onStderrLine, jobKey, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) }, windowsHide: true });
    } catch (e) { return reject(e); }
    track(jobKey, child);
    let stdout = '', stderr = '', bufO = '', bufE = '';
    let timer = null;
    if (timeoutMs) timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, timeoutMs);
    const lines = (buf, chunk, cb) => {
      buf += chunk;
      const parts = buf.split(/\r?\n|\r/);
      buf = parts.pop();
      if (cb) parts.forEach((l) => l && cb(l));
      return buf;
    };
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; if (stdout.length > 50e6) stdout = stdout.slice(-25e6); bufO = lines(bufO, s, onLine); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; if (stderr.length > 2e6) stderr = stderr.slice(-1e6); bufE = lines(bufE, s, onStderrLine || onLine); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (bufO && onLine) onLine(bufO);
      if (bufE && (onStderrLine || onLine)) (onStderrLine || onLine)(bufE);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function tail(s, n = 1200) { s = String(s || '').trim(); return s.length > n ? '…' + s.slice(-n) : s; }

module.exports = { run, killJob, tail };
