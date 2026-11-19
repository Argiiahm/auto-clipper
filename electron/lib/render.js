const fs = require('fs');
const path = require('path');
const { run, tail } = require('./proc');
const { resolveBin } = require('./paths');

const OW = 1080, OH = 1920;
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const clamp01 = (v, d = 0.5) => (isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

function coverFilter(srcW, srcH, tw, th, fx = 0.5, fy = 0.5) {
  const s = Math.max(tw / srcW, th / srcH);
  let sw = even(srcW * s); let sh = even(srcH * s);
  if (sw < tw) sw = tw; if (sh < th) sh = th;
  const cx = Math.round((sw - tw) * clamp01(fx)); const cy = Math.round((sh - th) * clamp01(fy));
  return `scale=${sw}:${sh}:flags=lanczos,crop=${tw}:${th}:${cx}:${cy}`;
}

function buildFilter({ layout, width: W, height: H, focusX = 0.5, webcam, splitRatio = 42, assRel }) {
  let g;
  const fx = clamp01(focusX);
  if (layout === 'split' && webcam && webcam.w > 0.02 && webcam.h > 0.02) {
    const topH = even((OH * Math.max(20, Math.min(70, splitRatio))) / 100);
    const botH = OH - topH;
    const cw = even(webcam.w * W); const ch = even(webcam.h * H);
    const cx = Math.max(0, Math.min(W - cw, Math.round(webcam.x * W))); const cy = Math.max(0, Math.min(H - ch, Math.round(webcam.y * H)));
    g = `[0:v]split=2[a][b];[a]crop=${cw}:${ch}:${cx}:${cy},${coverFilter(cw, ch, OW, topH)}[top];[b]${coverFilter(W, H, OW, botH, fx)}[bot];[top][bot]vstack=inputs=2,setsar=1[v]`;
  } else if (layout === 'fit') {
    const s = Math.min(OW / W, OH / H);
    const fw = even(W * s); const fh = even(H * s);
    g = `[0:v]split=2[a][b];[a]${coverFilter(W, H, 270, 480)},boxblur=12:2,eq=brightness=-0.12:saturation=1.1,scale=${OW}:${OH}:flags=bicubic[bg];[b]scale=${fw}:${fh}:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
  } else {
    g = `[0:v]${coverFilter(W, H, OW, OH, fx)},setsar=1[v]`;
  }
  if (assRel) g += `;[v]ass=filename=${assRel}:fontsdir=fonts[vo]`;
  else g += ';[v]null[vo]';
  return g;
}

function encoderArgs(encoder, quality) {
  const q = { fast: 0, balanced: 1, high: 2 }[quality] ?? 1;
  switch (encoder) {
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', ['p3', 'p5', 'p6'][q], '-rc', 'vbr', '-cq', ['25', '22', '19'][q], '-b:v', '0', '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-preset', ['veryfast', 'medium', 'slow'][q], '-global_quality', ['26', '23', '20'][q], '-pix_fmt', 'nv12'];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-quality', ['speed', 'balanced', 'quality'][q], '-rc', 'cqp', '-qp_i', ['26', '23', '20'][q], '-qp_p', ['28', '25', '22'][q], '-pix_fmt', 'yuv420p'];
    default: return ['-c:v', 'libx264', '-preset', ['veryfast', 'faster', 'medium'][q], '-crf', ['23', '21', '19'][q], '-profile:v', 'high', '-pix_fmt', 'yuv420p'];
  }
}

/**
 * Render one clip. cwd = project dir so relative ASS/font paths avoid Windows drive-letter escaping.
 */
async function renderClip({ projectDir, srcRel, video, clip, webcam, assText, outRel, encoder, quality, splitRatio, onProgress, jobKey }) {
  const dur = Math.max(0.5, clip.end - clip.start);
  let assRel = null;
  if (assText) {
    assRel = outRel.replace(/\.mp4$/i, '.ass').replace(/\\/g, '/');
    fs.writeFileSync(path.join(projectDir, assRel), assText, 'utf8');
  }
  const filter = buildFilter({ layout: clip.layout, width: video.width, height: video.height, focusX: clip.focusX, webcam, splitRatio, assRel });
  const fpsArgs = video.fps > 60.5 ? ['-r', '60'] : [];
  const mk = (enc) => [
    '-y', '-hide_banner', '-nostats', '-progress', 'pipe:1',
    '-ss', clip.start.toFixed(3), '-i', srcRel, '-t', dur.toFixed(3),
    '-filter_complex', filter, '-map', '[vo]', '-map', '0:a:0?',
    ...encoderArgs(enc, quality), ...fpsArgs,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-af', 'aresample=async=1',
    '-movflags', '+faststart', outRel.replace(/\\/g, '/'),
  ];
  const attempt = async (enc) => run(resolveBin('ffmpeg'), mk(enc), {
    cwd: projectDir, jobKey,
    onLine: (l) => {
      const m = l.match(/^out_time_(?:us|ms)=(\d+)/);
      if (m && onProgress) onProgress(Math.min(0.99, Number(m[1]) / 1e6 / dur));
    },
    onStderrLine: () => {},
  });
  let r = await attempt(encoder || 'libx264');
  if (r.code !== 0 && encoder && encoder !== 'libx264' && !r.signal) {
    onProgress && onProgress(0, `Encoder ${encoder} gagal, fallback ke CPU (libx264)…`);
    r = await attempt('libx264');
  }
  if (r.code !== 0) throw new Error(r.signal ? 'Dibatalkan' : 'Render gagal: ' + tail(r.stderr, 900));
  onProgress && onProgress(1);
  return path.join(projectDir, outRel);
}

/* ------------------------------------------------------------------ */
/* Edit-aware render: scenes (cuts + inserted media), adjust, captions,  */
/* rasterized overlays/watermark, background music.                     */
/* ------------------------------------------------------------------ */

/** layout chain for one input label -> out label (unique suffix u) */
function layoutChain(inp, out, { layout, W, H, focusX = 0.5, webcam, splitRatio = 42 }, u) {
  const fx = clamp01(focusX);
  if (layout === 'split' && webcam && webcam.w > 0.02 && webcam.h > 0.02) {
    const topH = even((OH * Math.max(20, Math.min(70, splitRatio))) / 100);
    const botH = OH - topH;
    const cw = even(webcam.w * W); const ch = even(webcam.h * H);
    const cx = Math.max(0, Math.min(W - cw, Math.round(webcam.x * W))); const cy = Math.max(0, Math.min(H - ch, Math.round(webcam.y * H)));
    return `${inp}split=2[sa${u}][sb${u}];[sa${u}]crop=${cw}:${ch}:${cx}:${cy},${coverFilter(cw, ch, OW, topH)}[st${u}];[sb${u}]${coverFilter(W, H, OW, botH, fx)}[sm${u}];[st${u}][sm${u}]vstack=inputs=2,setsar=1${out}`;
  }
  if (layout === 'fit') {
    const s = Math.min(OW / W, OH / H);
    const fw = even(W * s); const fh = even(H * s);
    return `${inp}split=2[fa${u}][fb${u}];[fa${u}]${coverFilter(W, H, 270, 480)},boxblur=12:2,eq=brightness=-0.12:saturation=1.1,scale=${OW}:${OH}:flags=bicubic[fg${u}];[fb${u}]scale=${fw}:${fh}:flags=lanczos[ff${u}];[fg${u}][ff${u}]overlay=(W-w)/2:(H-h)/2,setsar=1${out}`;
  }
  return `${inp}${coverFilter(W, H, OW, OH, fx)},setsar=1${out}`;
}

function adjustChain(a) {
  const f = (v, k) => Math.max(0, 1 + (Number(v) || 0) / 100 * k);
  const b = f(a && a.brightness, 0.6), c = f(a && a.contrast, 0.6), s = f(a && a.saturation, 1);
  const parts = ['format=gbrp'];
  if (Math.abs(b - 1) > 1e-3) parts.push(`colorchannelmixer=rr=${b.toFixed(4)}:gg=${b.toFixed(4)}:bb=${b.toFixed(4)}`);
  if (Math.abs(c - 1) > 1e-3) { const e = `clip((val-128)*${c.toFixed(4)}+128\\,0\\,255)`; parts.push(`lutrgb=r=${e}:g=${e}:b=${e}`); }
  if (Math.abs(s - 1) > 1e-3) {
    const m = (x) => x.toFixed(4);
    parts.push(`colorchannelmixer=rr=${m(0.213 + 0.787 * s)}:rg=${m(0.715 - 0.715 * s)}:rb=${m(0.072 - 0.072 * s)}:gr=${m(0.213 - 0.213 * s)}:gg=${m(0.715 + 0.285 * s)}:gb=${m(0.072 - 0.072 * s)}:br=${m(0.213 - 0.213 * s)}:bg=${m(0.715 - 0.715 * s)}:bb=${m(0.072 + 0.928 * s)}`);
  }
  return parts.length > 1 ? parts.join(',') : null;
}

/**
 * items: output of buildSequence().items
 * assets: map assetId -> {rel, kind, width, height, duration, hasAudio}
 * rasters: [{rel, start, end}] full-frame transparent PNGs (overlays + watermark) on the output timeline
 * music: {rel, volume, sourceVolume, offset} | null
 */
async function renderClipEdited({ projectDir, srcRel, video, clip, webcam, assText, outRel, encoder, quality, splitRatio, items, total, assets, rasters, music, adjust, onProgress, jobKey }) {
  const dur = Math.max(0.3, total);
  const F = video.fps > 60.5 ? 60 : (video.fps > 1 ? video.fps : 30);
  const Fs = String(Math.round(F * 1000) / 1000);
  const inputs = []; const g = []; const pairs = [];
  let n = 0;
  const addInput = (args) => { inputs.push(...args); return n++; };
  const vnorm = (len) => `fps=${Fs},format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS`;
  const anorm = (len) => `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${len.toFixed(3)},asetpts=PTS-STARTPTS`;
  const silence = (len, lab) => g.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${len.toFixed(3)},aformat=sample_fmts=fltp:channel_layouts=stereo${lab}`);

  items.forEach((it, i) => {
    const len = it.oe - it.os;
    if (it.type === 'src') {
      const k = addInput(['-ss', it.s.toFixed(3), '-t', (len + 0.05).toFixed(3), '-i', srcRel]);
      g.push(layoutChain(`[${k}:v]`, `[l${i}]`, { layout: clip.layout, W: video.width, H: video.height, focusX: clip.focusX, webcam, splitRatio }, `x${i}`));
      g.push(`[l${i}]${vnorm(len)}[v${i}]`);
      if (video.hasAudio) g.push(`[${k}:a]${anorm(len)}[a${i}]`); else silence(len, `[a${i}]`);
    } else {
      const ins = it.ins; const a = assets[ins.asset];
      if (!a) throw new Error('File scene tidak ditemukan: ' + (ins.name || ins.asset));
      let k;
      if (a.kind === 'image') k = addInput(['-f', 'image2', '-loop', '1', '-framerate', Fs, '-t', (len + 0.1).toFixed(3), '-i', a.rel]);
      else k = addInput(['-ss', Number(ins.in || 0).toFixed(3), '-t', (len + 0.05).toFixed(3), '-i', a.rel]);
      const aw = a.width || video.width; const ah = a.height || video.height;
      g.push(layoutChain(`[${k}:v]`, `[l${i}]`, { layout: ins.fit === 'fill' ? 'fill' : 'fit', W: aw, H: ah, focusX: 0.5 }, `x${i}`));
      g.push(`[l${i}]${vnorm(len)}[v${i}]`);
      if (a.kind === 'video' && a.hasAudio && !ins.mute) g.push(`[${k}:a]${anorm(len)}[a${i}]`); else silence(len, `[a${i}]`);
    }
    pairs.push(`[v${i}][a${i}]`);
  });
  g.push(`${pairs.join('')}concat=n=${items.length}:v=1:a=1[cv0][ca0]`);
  let cv = '[cv0]'; let step = 0;
  const nextV = () => `[cv${++step}]`;
  const adj = adjustChain(adjust);
  if (adj) { const o = nextV(); g.push(`${cv}${adj},format=yuv420p${o}`); cv = o; }
  let assRel = null;
  if (assText) {
    assRel = outRel.replace(/\.mp4$/i, '.ass').replace(/\\/g, '/');
    fs.writeFileSync(path.join(projectDir, assRel), assText, 'utf8');
    const o = nextV(); g.push(`${cv}ass=filename=${assRel}:fontsdir=fonts${o}`); cv = o;
  }
  for (const r of rasters || []) {
    const s = Math.max(0, Number(r.start) || 0); const e = Math.min(dur, Number(r.end) || dur);
    if (e - s < 0.04) continue;
    const k = addInput(['-f', 'image2', '-loop', '1', '-framerate', Fs, '-t', (dur + 0.2).toFixed(3), '-i', r.rel.replace(/\\/g, '/')]);
    const o = nextV();
    const en = s <= 0.001 && e >= dur - 0.001 ? '' : `:enable='between(t,${s.toFixed(3)},${e.toFixed(3)})'`;
    g.push(`${cv}[${k}:v]overlay=0:0:format=auto${en}${o}`); cv = o;
  }
  g.push(`${cv}format=yuv420p[vo]`);
  // audio
  const sv = music && music.rel ? Math.max(0, Number(music.sourceVolume ?? 1)) : 1;
  if (music && music.rel) {
    const k = addInput(['-stream_loop', '-1', '-ss', Math.max(0, Number(music.offset) || 0).toFixed(3), '-i', music.rel.replace(/\\/g, '/')]);
    const mv = Math.max(0, Number(music.volume ?? 0.5));
    const fadeSt = Math.max(0, dur - 1.2).toFixed(3);
    g.push(`[ca0]volume=${sv.toFixed(3)}[cs]`);
    g.push(`[${k}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${mv.toFixed(3)},afade=t=out:st=${fadeSt}:d=1.2[mus]`);
    g.push(`[cs][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[ao]`);
  } else g.push(`[ca0]anull[ao]`);

  const mk = (enc) => [
    '-y', '-hide_banner', '-nostats', '-progress', 'pipe:1',
    ...inputs,
    '-filter_complex', g.join(';'), '-map', '[vo]', '-map', '[ao]',
    ...encoderArgs(enc, quality), '-r', Fs,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', dur.toFixed(3),
    '-movflags', '+faststart', outRel.replace(/\\/g, '/'),
  ];
  const attempt = async (enc) => run(resolveBin('ffmpeg'), mk(enc), {
    cwd: projectDir, jobKey,
    onLine: (l) => {
      const m = l.match(/^out_time_(?:us|ms)=(\d+)/);
      if (m && onProgress) onProgress(Math.min(0.99, Number(m[1]) / 1e6 / dur));
    },
    onStderrLine: () => {},
  });
  let r = await attempt(encoder || 'libx264');
  if (r.code !== 0 && encoder && encoder !== 'libx264' && !r.signal) {
    onProgress && onProgress(0, `Encoder ${encoder} gagal, fallback ke CPU (libx264)…`);
    r = await attempt('libx264');
  }
  if (r.code !== 0) throw new Error(r.signal ? 'Dibatalkan' : 'Render gagal: ' + tail(r.stderr, 900));
  onProgress && onProgress(1);
  return path.join(projectDir, outRel);
}

module.exports = { renderClip, renderClipEdited, buildFilter, coverFilter, layoutChain, adjustChain };
