// Canvas renderer that mirrors the ffmpeg layouts (fill / fit / split) for live preview & thumbnails.
function drawCover(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, fx = 0.5, fy = 0.5) {
  const ta = dw / dh; const sa = sw / sh;
  let cw = sw, ch = sh, ox = sx, oy = sy;
  if (sa > ta) { cw = sh * ta; ox = sx + (sw - cw) * fx; } else { ch = sw / ta; oy = sy + (sh - ch) * fy; }
  ctx.drawImage(src, ox, oy, cw, ch, dx, dy, dw, dh);
}

export function drawLayout(ctx, video, W, H, { layout, focusX = 0.5 }, webcam, splitRatio = 42) {
  const vw = video.videoWidth || video.naturalWidth || 0, vh = video.videoHeight || video.naturalHeight || 0;
  ctx.save();
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (!vw || !vh) { ctx.restore(); return; }
  if (layout === 'split' && webcam && webcam.w > 0.02) {
    const topH = Math.round((H * splitRatio) / 100);
    drawCover(ctx, video, webcam.x * vw, webcam.y * vh, webcam.w * vw, webcam.h * vh, 0, 0, W, topH);
    drawCover(ctx, video, 0, 0, vw, vh, 0, topH, W, H - topH, focusX);
  } else if (layout === 'fit') {
    ctx.filter = `blur(${Math.round(W / 40)}px) brightness(0.86) saturate(1.1)`;
    drawCover(ctx, video, 0, 0, vw, vh, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
    ctx.filter = 'none';
    const s = Math.min(W / vw, H / vh); const fw = vw * s, fh = vh * s;
    ctx.drawImage(video, (W - fw) / 2, (H - fh) / 2, fw, fh);
  } else {
    drawCover(ctx, video, 0, 0, vw, vh, 0, 0, W, H, focusX);
  }
  ctx.restore();
}

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 1080x1920 thumbnail: frame + gradient + bold headline (last word(s) highlighted). */
export async function makeThumbnail(video, clip, webcam, splitRatio, headline, accent = '#FFE600') {
  await document.fonts.load('900 100px Montserrat');
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  drawLayout(ctx, video, W, H, clip, webcam, splitRatio);
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  const text = String(headline || clip.title || '').toUpperCase().trim();
  if (text) {
    let size = 118; let lines;
    for (;;) {
      ctx.font = `900 ${size}px Montserrat`;
      lines = wrapLines(ctx, text, W - 140);
      if ((lines.length <= 4 && lines.every((l) => ctx.measureText(l).width <= W - 140)) || size < 60) break;
      size -= 6;
    }
    const lh = size * 1.08; const baseY = H * 0.86 - (lines.length - 1) * lh;
    const words = text.split(/\s+/); const hlCount = words.length > 3 ? 2 : 1;
    const hlFrom = words.length - hlCount; let wi = 0;
    ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    lines.forEach((line, li) => {
      const y = baseY + li * lh; const lw = ctx.measureText(line).width; let x = (W - lw) / 2;
      for (const w of line.split(' ')) {
        const ww = ctx.measureText(w).width;
        ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#000'; ctx.strokeText(w, x, y);
        ctx.fillStyle = wi >= hlFrom ? accent : '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 0;
        ctx.fillText(w, x, y); ctx.shadowColor = 'transparent';
        x += ww + ctx.measureText(' ').width; wi++;
      }
    });
  }
  return c.toDataURL('image/png');
}
