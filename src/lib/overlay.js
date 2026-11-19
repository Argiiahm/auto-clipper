// Canvas drawing for text / image overlays and the watermark.
// Used for the live preview AND for rasterizing PNGs that ffmpeg overlays at render time (WYSIWYG).
// All geometry is in 1080x1920 space; `k` = canvasWidth / 1080.

export const FONTS = [
  { id: 'Montserrat', label: 'Montserrat', weights: [600, 800, 900] },
  { id: 'Anton', label: 'Anton', weights: [400] },
  { id: 'Bangers', label: 'Bangers', weights: [400] },
  { id: 'Segoe UI', label: 'Segoe UI', weights: [400, 600, 700] },
  { id: 'Arial', label: 'Arial', weights: [400, 700] },
  { id: 'Georgia', label: 'Georgia', weights: [400, 700] },
  { id: 'Impact', label: 'Impact', weights: [400] },
  { id: 'Courier New', label: 'Courier New', weights: [400, 700] },
];

export const TEXT_PRESETS = [
  { id: 'plain', label: 'Default', style: { font: 'Montserrat', weight: 800, size: 72, color: '#FFFFFF', stroke: 0, strokeColor: '#000000', bg: '', shadow: true } },
  { id: 'outline', label: 'Outline', style: { font: 'Montserrat', weight: 900, size: 84, color: '#FFFFFF', stroke: 8, strokeColor: '#000000', bg: '', shadow: false } },
  { id: 'yellow', label: 'Kuning', style: { font: 'Montserrat', weight: 900, size: 84, color: '#FFE600', stroke: 8, strokeColor: '#000000', bg: '', shadow: false } },
  { id: 'box', label: 'Kotak', style: { font: 'Montserrat', weight: 800, size: 64, color: '#FFFFFF', stroke: 0, strokeColor: '#000000', bg: '#E5322D', bgOpacity: 1, shadow: false } },
  { id: 'label', label: 'Label', style: { font: 'Montserrat', weight: 800, size: 56, color: '#111111', stroke: 0, strokeColor: '#000000', bg: '#FFFFFF', bgOpacity: 1, shadow: false } },
  { id: 'dark', label: 'Gelap', style: { font: 'Montserrat', weight: 600, size: 52, color: '#FFFFFF', stroke: 0, strokeColor: '#000000', bg: '#000000', bgOpacity: 0.6, shadow: false } },
  { id: 'comic', label: 'Komik', style: { font: 'Bangers', weight: 400, size: 110, color: '#FFD400', stroke: 9, strokeColor: '#000000', bg: '', shadow: true } },
  { id: 'impact', label: 'Tegas', style: { font: 'Anton', weight: 400, size: 104, color: '#FFFFFF', stroke: 6, strokeColor: '#000000', bg: '', shadow: true } },
  { id: 'neon', label: 'Neon', style: { font: 'Montserrat', weight: 800, size: 80, color: '#FFFFFF', stroke: 3, strokeColor: '#00E5FF', bg: '', glow: '#00E5FF', shadow: false } },
];

const fontStr = (o, k) => `${o.italic ? 'italic ' : ''}${o.weight || 700} ${Math.max(1, (o.size || 64) * k)}px "${o.font || 'Montserrat'}"`;

function hexA(hex, a) {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Measure a text overlay. Returns size in 1080-space. */
export function measureText(ctx, o) {
  ctx.save();
  ctx.font = fontStr(o, 1);
  const lines = String(o.text || '').split('\n');
  const lh = (o.size || 64) * (o.lineHeight || 1.15);
  const w = Math.max(10, ...lines.map((l) => ctx.measureText(l || ' ').width));
  ctx.restore();
  const padX = o.bg ? (o.size || 64) * 0.35 : 0; const padY = o.bg ? (o.size || 64) * 0.18 : 0;
  return { w: w + padX * 2 + (o.stroke || 0) * 2, h: lines.length * lh + padY * 2 + (o.stroke || 0) * 2, lines, lh, padX, padY };
}

/** Bounding box (1080-space, centered at x,y) for selection handles */
export function overlayBox(ctx, o, imgs) {
  if (o.type === 'image') {
    const img = imgs && imgs.get(o.asset);
    const w = (o.w || 0.3) * 1080;
    const ar = img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
    return { cx: (o.x ?? 0.5) * 1080, cy: (o.y ?? 0.5) * 1920, w, h: w * ar };
  }
  const m = measureText(ctx, o);
  return { cx: (o.x ?? 0.5) * 1080, cy: (o.y ?? 0.5) * 1920, w: m.w, h: m.h };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw a text overlay centered at (cx, cy) in 1080-space, scaled by k. */
export function drawTextAt(ctx, o, cx, cy, k) {
  const m = measureText(ctx, o);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity ?? 1));
  ctx.translate(cx * k, cy * k);
  if (o.rotate) ctx.rotate((o.rotate * Math.PI) / 180);
  ctx.font = fontStr(o, k);
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  const W = m.w * k, H = m.h * k;
  if (o.bg) {
    ctx.fillStyle = hexA(o.bg, o.bgOpacity ?? 1);
    roundRect(ctx, -W / 2, -H / 2, W, H, Math.min(H / 2, (o.size || 64) * 0.18 * k));
    ctx.fill();
  }
  const innerW = (m.w - m.padX * 2 - (o.stroke || 0) * 2) * k;
  const ax = ctx.textAlign === 'left' ? -innerW / 2 : ctx.textAlign === 'right' ? innerW / 2 : 0;
  const top = -((m.lines.length - 1) * m.lh * k) / 2;
  m.lines.forEach((line, i) => {
    const y = top + i * m.lh * k;
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 24 * k; }
    else if (o.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowOffsetY = 5 * k; ctx.shadowBlur = 10 * k; }
    if (o.stroke > 0) { ctx.lineWidth = o.stroke * 2 * k; ctx.strokeStyle = o.strokeColor || '#000'; ctx.strokeText(line, ax, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(line, ax, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

export function drawImageAt(ctx, img, o, cx, cy, wPx, k) {
  if (!img || !img.naturalWidth) return;
  const h = wPx * (img.naturalHeight / img.naturalWidth);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, o.opacity ?? 1));
  ctx.translate(cx * k, cy * k);
  if (o.rotate) ctx.rotate((o.rotate * Math.PI) / 180);
  ctx.drawImage(img, (-wPx / 2) * k, (-h / 2) * k, wPx * k, h * k);
  ctx.restore();
}

export function drawOverlay(ctx, o, k, imgs) {
  if (o.type === 'image') drawImageAt(ctx, imgs && imgs.get(o.asset), o, (o.x ?? 0.5) * 1080, (o.y ?? 0.5) * 1920, (o.w || 0.3) * 1080, k);
  else drawTextAt(ctx, o, (o.x ?? 0.5) * 1080, (o.y ?? 0.5) * 1920, k);
}

/** overlays visible at output time t */
export function drawOverlays(ctx, overlays, t, k, imgs) {
  for (const o of overlays || []) if (o.visible !== false && t >= o.start && t < o.end) drawOverlay(ctx, o, k, imgs);
}

/** watermark placement (center point in 1080-space) */
export function watermarkPlacement(ctx, wm, img) {
  let w, h;
  if (wm.type === 'image') {
    w = (wm.imageW || 0.22) * 1080;
    h = img && img.naturalWidth ? w * (img.naturalHeight / img.naturalWidth) : w * 0.4;
  } else { const m = measureText(ctx, wm); w = m.w; h = m.h; }
  const mg = wm.margin ?? 48;
  const pos = wm.pos || 'tr';
  const col = pos[1], row = pos[0];
  const cx = col === 'l' ? mg + w / 2 : col === 'r' ? 1080 - mg - w / 2 : 540;
  const cy = row === 't' ? mg + 60 + h / 2 : row === 'b' ? 1920 - mg - 60 - h / 2 : 960;
  return { cx, cy, w, h };
}

export function drawWatermark(ctx, wm, k, img) {
  if (!wm || !wm.enabled) return;
  if (wm.type === 'image' && !(img && img.naturalWidth)) return;
  if (wm.type !== 'image' && !String(wm.text || '').trim()) return;
  const p = watermarkPlacement(ctx, wm, img);
  if (wm.type === 'image') drawImageAt(ctx, img, { opacity: wm.opacity }, p.cx, p.cy, p.w, k);
  else drawTextAt(ctx, { ...wm, align: 'center', opacity: wm.opacity, shadow: wm.shadow, stroke: wm.stroke || 0 }, p.cx, p.cy, k);
}

/* ---------------- image cache ---------------- */
const cache = new Map(); // url -> {img, promise}
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  const c = cache.get(url);
  if (c) return c.promise;
  const img = new Image();
  const promise = new Promise((res) => { img.onload = () => res(img); img.onerror = () => res(null); });
  img.src = url;
  cache.set(url, { img, promise });
  return promise;
}
export function cachedImage(url) {
  const c = cache.get(url);
  if (!c) { loadImage(url); return null; }
  return c.img.complete && c.img.naturalWidth ? c.img : null;
}

let fontsReady = null;
export function ensureFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all(['600 40px Montserrat', '800 40px Montserrat', '900 40px Montserrat', '40px Bangers', '40px Anton'].map((f) => document.fonts.load(f).catch(() => {})));
  }
  return fontsReady;
}

/** Rasterize a group of overlays (and/or watermark) to a transparent 1080x1920 PNG data URL. */
export function rasterize(draw) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const ctx = c.getContext('2d');
  draw(ctx);
  return c.toDataURL('image/png');
}
