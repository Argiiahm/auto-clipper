const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfter(res, bodyText) {
  const h = res && res.headers && (res.headers.get('retry-after') || res.headers.get('x-ratelimit-reset-requests') || res.headers.get('x-ratelimit-reset-tokens'));
  let sec = 0;
  if (h) {
    if (/^\d+(\.\d+)?$/.test(h)) sec = parseFloat(h);
    else sec = parseDuration(h);
  }
  const m = String(bodyText || '').match(/try again in\s+([\dhms.]+)/i);
  if (m) sec = Math.max(sec, parseDuration(m[1]));
  return sec;
}
function parseDuration(s) {
  let t = 0; const re = /([\d.]+)\s*(ms|h|m|s)/g; let m;
  while ((m = re.exec(s))) t += parseFloat(m[1]) * ({ ms: 0.001, h: 3600, m: 60, s: 1 }[m[2]]);
  return t;
}

/**
 * fetch with retries for 429/5xx/network errors.
 * onWait(sec, reason) is called when sleeping for rate limits.
 */
async function fetchRetry(url, makeInit, { retries = 8, onWait, signal, maxWaitTotal = 900 } = {}) {
  let waited = 0; let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new Error('Dibatalkan');
    let res, text;
    try {
      res = await fetch(url, { ...makeInit(), signal });
      text = await res.text();
    } catch (e) {
      if (signal && signal.aborted) throw new Error('Dibatalkan');
      lastErr = e; const w = Math.min(30, 2 ** attempt);
      onWait && onWait(w, 'koneksi gagal, mencoba lagi');
      await sleep(w * 1000); waited += w; continue;
    }
    if (res.ok) {
      try { return JSON.parse(text); } catch (_) { return text; }
    }
    let msg = text;
    try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || j.message || text; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch (_) {}
    if (res.status === 401 || res.status === 403) throw new Error(`API key ditolak (${res.status}): ${msg}`);
    if (res.status === 413) throw new Error(`Request terlalu besar (413): ${msg}`);
    if (res.status === 429 || res.status >= 500) {
      if (res.status === 429 && /per day|daily|RPD|TPD|ASD|quota/i.test(msg) && !/minute/i.test(msg)) {
        const w = parseRetryAfter(res, msg);
        if (!w || w > 600) throw new Error(`Limit harian API habis: ${msg}`);
      }
      let w = parseRetryAfter(res, msg) || Math.min(60, 3 * 2 ** attempt);
      w = Math.min(Math.ceil(w + 1), 120);
      if (waited + w > maxWaitTotal) throw new Error(`Rate limit terlalu lama (${res.status}): ${msg}`);
      onWait && onWait(w, res.status === 429 ? 'rate limit' : `server error ${res.status}`);
      await sleep(w * 1000); waited += w; lastErr = new Error(msg); continue;
    }
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  throw lastErr || new Error('Request gagal');
}

module.exports = { fetchRetry, sleep };
