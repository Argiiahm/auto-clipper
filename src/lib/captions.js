// Mirror of electron/lib/captions.js for live preview (sizes in 1080x1920 space).
export const CAPTION_STYLES = {
  pop:   { label: 'Pop',   font: 'Montserrat', weight: 900, size: 96, k: 0.64, upper: true, color: '#FFFFFF', stroke: '#000', bord: 7, shadow: '0 3px 0 rgba(0,0,0,.5)', active: '#FFE600', scale: 1.1 },
  neon:  { label: 'Neon',  font: 'Montserrat', weight: 800, size: 92, k: 0.64, upper: true, color: '#FFFFFF', stroke: '#00E5FF', bord: 2.5, glow: '#00E5FF', active: '#FF4FD8', activeEdge: '#3A0030' },
  box:   { label: 'Box',   font: 'Montserrat', weight: 900, size: 92, k: 0.64, upper: true, color: '#FFFFFF', stroke: '#000', bord: 6, box: '#E5322D' },
  comic: { label: 'Comic', font: 'Bangers', weight: 400, size: 118, k: 0.57, upper: true, color: '#FFD400', stroke: '#000', bord: 8, shadow: '6px 6px 0 rgba(0,0,0,.5)', active: '#FF3B30', scale: 1.12, spacing: 2 },
  clean: { label: 'Clean', font: 'Montserrat', weight: 600, size: 66, k: 0.64, upper: false, color: '#FFFFFF', stroke: '#000', bord: 3, shadow: '0 2px 2px rgba(0,0,0,.5)', clean: true },
  focus: { label: 'Focus', font: 'Montserrat', weight: 800, size: 92, k: 0.64, upper: true, color: '#FFFFFF', stroke: '#000', bord: 5, dim: true },
};
export const STYLE_IDS = Object.keys(CAPTION_STYLES);

export function groupWords(words, maxWords, maxChars) {
  const groups = []; let cur = [];
  const flush = () => { if (cur.length) groups.push(cur); cur = []; };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && w.s - prev.e > 0.7) flush();
    const chars = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length >= maxWords || (cur.length && chars > maxChars)) flush();
    cur.push(w);
    if (/[.!?…,;:]$/.test(w.w) && cur.length >= Math.min(2, maxWords)) flush();
  }
  flush();
  return groups;
}

/** Build caption groups for a clip (times relative to clip start). */
export function buildGroups(words, clip) {
  const st = CAPTION_STYLES[clip.captionStyle] || CAPTION_STYLES.pop;
  const rel = (words || []).filter((w) => w.e > clip.start && w.s < clip.end)
    .map((w) => ({ w: st.upper ? w.w.toUpperCase() : w.w, s: Math.max(0, w.s - clip.start), e: Math.min(clip.end, w.e) - clip.start }));
  const wpl = clip.wordsPerLine || 3;
  const groups = groupWords(rel, st.clean ? Math.max(4, wpl * 2 + 1) : Math.max(1, wpl), st.clean ? 40 : (st.font === 'Bangers' ? 20 : 16));
  return groups.map((g, gi) => {
    const next = gi + 1 < groups.length ? groups[gi + 1][0].s : Infinity;
    return { words: g, start: g[0].s, end: Math.min(g[g.length - 1].e + 0.35, next, clip.end - clip.start) };
  });
}

export function activeAt(groups, t) {
  for (const g of groups) {
    if (t >= g.start && t < g.end) {
      let ai = 0;
      for (let i = 0; i < g.words.length; i++) if (t >= (i === 0 ? g.start : g.words[i].s)) ai = i;
      return { group: g, ai };
    }
  }
  return null;
}

const strokeShadow = (color, px) => {
  if (!px) return [];
  const out = []; const n = 16;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(`${(Math.cos(a) * px).toFixed(2)}px ${(Math.sin(a) * px).toFixed(2)}px 0 ${color}`); }
  return out;
};

/** Inline style for the caption container (in 1080-space px). */
export function containerStyle(styleId) {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.pop;
  return { fontFamily: st.font, fontWeight: st.weight, fontSize: st.size * st.k, letterSpacing: st.spacing || 0, lineHeight: 1.18, color: st.color, textAlign: 'center' };
}

export function wordStyle(styleId, isActive) {
  const st = CAPTION_STYLES[styleId] || CAPTION_STYLES.pop;
  const s = { color: st.color };
  let shadows = strokeShadow(st.stroke, st.bord);
  if (st.shadow) shadows.push(st.shadow);
  if (styleId === 'neon') {
    const g = isActive ? st.active : st.glow;
    shadows = [...strokeShadow(isActive ? st.activeEdge : st.stroke, st.bord), `0 0 10px ${g}`, `0 0 22px ${g}`, `0 0 36px ${g}`];
    if (isActive) s.color = st.active;
  } else if (styleId === 'box') {
    if (isActive) { s.background = st.box; s.padding = '0 0.14em'; s.margin = '0 -0.14em'; s.borderRadius = 2; }
  } else if (styleId === 'focus') {
    if (!isActive) { s.color = 'rgba(255,255,255,0.4)'; shadows = strokeShadow('rgba(0,0,0,0.32)', st.bord); }
  } else if (st.active && isActive) {
    s.color = st.active; if (st.scale) s.transform = `scale(${st.scale})`;
  }
  s.textShadow = shadows.join(',');
  return s;
}
