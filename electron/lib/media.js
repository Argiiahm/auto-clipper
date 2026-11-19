const fs = require('fs');
const path = require('path');
const { run, tail } = require('./proc');
const { resolveBin, isWin } = require('./paths');

function ytdlpBaseArgs(settings) {
  const args = ['--no-update', '--no-playlist', '--no-warnings'];
  // Electron's bundled Node (>=22) acts as the JS runtime yt-dlp needs for YouTube.
  if (process.versions.electron) args.push('--js-runtimes', `node:${process.execPath}`);
  else args.push('--js-runtimes', 'node');
  const ff = resolveBin('ffmpeg');
  if (path.isAbsolute(ff)) args.push('--ffmpeg-location', path.dirname(ff));
  if (settings && settings.cookiesFile && fs.existsSync(settings.cookiesFile)) args.push('--cookies', settings.cookiesFile);
  else if (settings && settings.cookiesBrowser) args.push('--cookies-from-browser', settings.cookiesBrowser);
  return args;
}
function ytdlpEnv() {
  return process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1', PYTHONIOENCODING: 'utf-8' } : { PYTHONIOENCODING: 'utf-8' };
}

async function ytInfo(url, settings, jobKey) {
  const r = await run(resolveBin('yt-dlp'), [...ytdlpBaseArgs(settings), '-J', '--skip-download', url], { env: ytdlpEnv(), jobKey, timeoutMs: 180000 });
  if (r.code !== 0) throw new Error('yt-dlp gagal membaca video: ' + tail(r.stderr, 600));
  const j = JSON.parse(r.stdout);
  return {
    id: j.id, title: j.title, channel: j.channel || j.uploader || '', duration: j.duration, thumbnail: j.thumbnail,
    webpage_url: j.webpage_url || url, language: j.language || null,
    hasSubs: !!(j.subtitles && Object.keys(j.subtitles).length), hasAutoSubs: !!(j.automatic_captions && Object.keys(j.automatic_captions).length),
  };
}

async function ytDownload(url, dir, settings, onProgress, jobKey) {
  const h = settings.maxHeight || 1080;
  const fmt = `bv*[height<=${h}][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=${h}][vcodec!^=av01]+ba/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
  const args = [
    ...ytdlpBaseArgs(settings), url, '-f', fmt, '--merge-output-format', 'mp4', '--remux-video', 'mp4',
    '-o', path.join(dir, 'source.%(ext)s'), '--newline', '--no-part', '--force-overwrites', '--concurrent-fragments', '4',
    '--progress-template', 'download:[dl] %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--write-thumbnail', '--convert-thumbnails', 'jpg',
  ];
  let stage = 0; let lastPct = -1;
  const r = await run(resolveBin('yt-dlp'), args, {
    env: ytdlpEnv(), jobKey,
    onLine: (l) => {
      const m = l.match(/^\[dl\]\s*([\d.]+)%\|([^|]*)\|(.*)$/);
      if (m) {
        const pct = parseFloat(m[1]);
        if (pct < lastPct - 50) stage++;
        lastPct = pct;
        onProgress && onProgress({ pct: Math.min(99, stage === 0 ? pct * 0.85 : 85 + pct * 0.14), detail: `${pct.toFixed(1)}% · ${m[2].trim()} · ETA ${m[3].trim()}` });
      } else if (/\[Merger\]|\[VideoRemuxer\]/.test(l)) onProgress && onProgress({ pct: 99, detail: 'Menggabungkan video + audio…' });
    },
  });
  const out = path.join(dir, 'source.mp4');
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error('Download gagal: ' + tail(r.stderr, 800));
  const thumb = ['source.jpg', 'source.webp', 'source.png'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (thumb && !thumb.endsWith('cover.jpg')) { try { fs.renameSync(thumb, path.join(dir, 'cover.jpg')); } catch (_) {} }
  return out;
}

/** Fetch YouTube captions (manual or auto) as json3 with word timings. */
async function ytSubtitles(url, dir, lang, settings, jobKey) {
  const langs = lang && lang !== 'auto' ? `${lang}.*,${lang}` : 'id.*,id,en.*,en,.*-orig';
  const args = [...ytdlpBaseArgs(settings), url, '--skip-download', '--write-subs', '--write-auto-subs', '--sub-format', 'json3',
    '--sub-langs', langs, '-o', path.join(dir, 'subs.%(ext)s')];
  const r = await run(resolveBin('yt-dlp'), args, { env: ytdlpEnv(), jobKey, timeoutMs: 180000 });
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('subs.') && f.endsWith('.json3'));
  if (!files.length) throw new Error('Caption YouTube tidak tersedia untuk video ini. Gunakan Groq Whisper. ' + tail(r.stderr, 300));
  // prefer "-orig" (original-language auto captions), then manual
  files.sort((a, b) => (b.includes('orig') ? 1 : 0) - (a.includes('orig') ? 1 : 0));
  return { file: path.join(dir, files[0]), lang: files[0].split('.').slice(1, -1).join('.') };
}

async function probe(file) {
  const r = await run(resolveBin('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) throw new Error('ffprobe gagal: ' + tail(r.stderr));
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  const a = (j.streams || []).find((s) => s.codec_type === 'audio');
  let fps = 30;
  if (v && v.avg_frame_rate && v.avg_frame_rate.includes('/')) { const [n, d] = v.avg_frame_rate.split('/').map(Number); if (d) fps = n / d; }
  let w = v ? v.width : 0, hgt = v ? v.height : 0;
  const rot = v && ((v.tags && Number(v.tags.rotate)) || ((v.side_data_list || []).find((x) => x.rotation !== undefined) || {}).rotation || 0);
  if (Math.abs(rot) === 90 || Math.abs(rot) === 270) [w, hgt] = [hgt, w];
  return { duration: parseFloat(j.format.duration) || 0, width: w, height: hgt, fps: Math.round(fps * 100) / 100, hasAudio: !!a, vcodec: v && v.codec_name };
}

/** Extract mono 16k low-bitrate audio chunks for Whisper upload (<25MB each). */
async function extractAudioChunks(src, outDir, duration, chunkSec, onProgress, jobKey) {
  fs.mkdirSync(outDir, { recursive: true });
  const chunks = [];
  const n = Math.max(1, Math.ceil(duration / chunkSec));
  for (let i = 0; i < n; i++) {
    const start = i * chunkSec;
    const len = Math.min(chunkSec, duration - start);
    if (len < 0.5) break;
    const out = path.join(outDir, `chunk_${String(i).padStart(3, '0')}.mp3`);
    if (!fs.existsSync(out) || fs.statSync(out).size < 1000) {
      const r = await run(resolveBin('ffmpeg'), ['-y', '-v', 'error', '-ss', String(start), '-t', String(len), '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', out], { jobKey });
      if (r.code !== 0) throw new Error('Ekstrak audio gagal: ' + tail(r.stderr));
    }
    chunks.push({ file: out, start, len });
    onProgress && onProgress((i + 1) / n);
  }
  return chunks;
}

async function extractFrame(src, t, out, width = 1280) {
  const r = await run(resolveBin('ffmpeg'), ['-y', '-v', 'error', '-ss', String(Math.max(0, t)), '-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', out]);
  if (r.code !== 0) throw new Error('Gagal ambil frame: ' + tail(r.stderr));
  return out;
}

async function versions() {
  const out = {};
  for (const [name, args] of [['ffmpeg', ['-version']], ['ffprobe', ['-version']], ['yt-dlp', ['--version']]]) {
    try {
      const r = await run(resolveBin(name), args, { timeoutMs: 20000 });
      out[name] = r.code === 0 ? (r.stdout.split('\n')[0] || '').replace(/Copyright.*/, '').trim() : null;
      out[name + 'Path'] = resolveBin(name);
    } catch (_) { out[name] = null; }
  }
  return out;
}

async function updateYtDlp(userBinDir) {
  // Copy bundled yt-dlp into a writable user dir then self-update there.
  fs.mkdirSync(userBinDir, { recursive: true });
  const target = path.join(userBinDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const cur = resolveBin('yt-dlp');
  if (!fs.existsSync(target) && fs.existsSync(cur)) fs.copyFileSync(cur, target);
  if (!fs.existsSync(target)) throw new Error('yt-dlp tidak ditemukan');
  const r = await run(target, ['-U'], { timeoutMs: 300000 });
  return tail(r.stdout + '\n' + r.stderr, 800);
}

module.exports = { ytInfo, ytDownload, ytSubtitles, probe, extractAudioChunks, extractFrame, versions, updateYtDlp, ytdlpEnv };
