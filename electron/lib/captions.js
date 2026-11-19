// ASS caption generation for 1080x1920 burn-in. Colors in ASS are &HAABBGGRR.
const W = 1080, H = 1920;

const STYLES = {
  pop:   { font: 'Montserrat Black', size: 96, upper: true, primary: 'FFFFFF', outline: '000000', bord: 7, shad: 3, active: 'FFE600', scale: 110 },
  neon:  { font: 'Montserrat ExtraBold', size: 92, upper: true, primary: 'FFFFFF', outline: '00E5FF', bord: 2.5, shad: 0, active: 'FF4FD8', activeEdge: '3A0030', glow: true },
  box:   { font: 'Montserrat Black', size: 92, upper: true, primary: 'FFFFFF', outline: '000000', bord: 6, shad: 0, boxColor: 'E5322D' },
  comic: { font: 'Bangers', size: 118, upper: true, primary: 'FFD400', outline: '000000', bord: 8, shad: 6, active: 'FF3B30', scale: 112, spacing: 2 },
  clean: { font: 'Montserrat SemiBold', size: 66, upper: false, primary: 'FFFFFF', outline: '000000', bord: 3, shad: 2, clean: true },
  focus: { font: 'Montserrat ExtraBold', size: 92, upper: true, primary: 'FFFFFF', outline: '000000', bord: 5, shad: 0, dim: true },
};

const hex2ass = (hex, alpha = '00') => {
  const h = hex.replace('#', '');
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
const ts = (t) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); const cs = Math.floor((t - Math.floor(t)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
const esc = (s) => String(s).replace(/[{}]/g, '').replace(/\\/g, '').replace(/\n/g, ' ');

/** group words into caption chunks */
function groupWords(words, maxWords, maxChars) {
  const groups = []; let cur = [];
  const flush = () => { if (cur.length) groups.push(cur); cur = []; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    if (prev && (w.s - prev.e > 0.7)) flush();
    const chars = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length >= maxWords || (cur.length && chars > maxChars)) flush();
    cur.push(w);
    if (/[.!?…,;:]$/.test(w.w) && cur.length >= Math.min(2, maxWords)) flush();
  }
  flush();
  return groups;
}

function buildAss({ words, clipStart, clipEnd, styleId = 'pop', posPct = 75, wordsPerLine = 3 }) {
  const st = STYLES[styleId] || STYLES.pop;
  const y = Math.round((H * Math.max(5, Math.min(95, posPct))) / 100);
  const pos = `\\an5\\pos(${W / 2},${y})`;
  const rel = words
    .filter((w) => w.e > clipStart && w.s < clipEnd)
    .map((w) => ({ w: st.upper ? w.w.toUpperCase() : w.w, s: Math.max(0, w.s - clipStart), e: Math.min(clipEnd, w.e) - clipStart }));
  const maxWords = st.clean ? Math.max(4, wordsPerLine * 2 + 1) : Math.max(1, wordsPerLine);
  const maxChars = st.clean ? 40 : (st.font === 'Bangers' ? 20 : 16);
  const groups = groupWords(rel, maxWords, maxChars);

  const styleLine = (name, s, opts = {}) => {
    const borderStyle = opts.borderStyle || 1;
    const bord = opts.bord !== undefined ? opts.bord : s.bord;
    const outline = opts.outline || hex2ass(s.outline);
    const back = opts.back || hex2ass('000000', s.shad ? '80' : '00');
    return `Style: ${name},${s.font},${s.size},${opts.primary || hex2ass(s.primary)},${hex2ass('FFFFFF')},${outline},${back},0,0,0,0,100,100,${s.spacing || 0},0,${borderStyle},${bord},${opts.shad !== undefined ? opts.shad : s.shad},5,60,60,0,1`;
  };

  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', 'YCbCr Matrix: TV.709', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine('Main', st),
    styleLine('Glow', st, { bord: 9, shad: 0 }),
    styleLine('BoxBg', st, { borderStyle: 3, bord: 14, shad: 0, outline: hex2ass(st.boxColor || 'E5322D'), back: hex2ass(st.boxColor || 'E5322D') }),
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const ev = [];
  const dlg = (layer, s, e, style, text) => { if (e - s >= 0.02) ev.push(`Dialogue: ${layer},${ts(s)},${ts(e)},${style},,0,0,0,,${text}`); };

  groups.forEach((g, gi) => {
    const gStart = g[0].s;
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].s : Infinity;
    const gEnd = Math.min(g[g.length - 1].e + 0.35, nextStart, clipEnd - clipStart);
    if (st.clean) { dlg(0, gStart, gEnd, 'Main', `{${pos}\\fad(60,0)}` + g.map((w) => esc(w.w)).join(' ')); return; }
    g.forEach((_, ai) => {
      const s = ai === 0 ? gStart : g[ai].s;
      const e = ai + 1 < g.length ? g[ai + 1].s : gEnd;
      const parts = g.map((w, wi) => {
        const t = esc(w.w);
        const isA = wi === ai;
        if (styleId === 'box') return t;
        if (styleId === 'focus') return isA ? `{\\1a&H00&\\3a&H00&}${t}` : `{\\1a&H9A&\\3a&HB0&}${t}`;
        if (styleId === 'neon') return isA ? `{\\1c${hex2ass(st.active)}\\3c${hex2ass(st.activeEdge)}}${t}{\\1c${hex2ass(st.primary)}\\3c${hex2ass(st.outline)}}` : t;
        if (isA) return `{\\1c${hex2ass(st.active)}\\fscx${st.scale}\\fscy${st.scale}}${t}{\\1c${hex2ass(st.primary)}\\fscx100\\fscy100}`;
        return t;
      });
      const text = parts.join(' ');
      const fadeIn = ai === 0 ? '\\fad(50,0)' : '';
      if (styleId === 'box') {
        const bg = g.map((w, wi) => (wi === ai ? `{\\3a&H00&\\4a&H00&}${esc(w.w)}{\\3a&HFF&\\4a&HFF&}` : esc(w.w))).join(' ');
        dlg(0, s, e, 'BoxBg', `{${pos}\\1a&HFF&\\3a&HFF&\\4a&HFF&}${bg}`);
        dlg(1, s, e, 'Main', `{${pos}}${text}`);
      } else if (styleId === 'neon') {
        const glow = g.map((w, wi) => (wi === ai ? `{\\3c${hex2ass(st.active)}}${esc(w.w)}{\\3c${hex2ass(st.outline)}}` : esc(w.w))).join(' ');
        dlg(0, s, e, 'Glow', `{${pos}${fadeIn}\\1a&HFF&\\blur12}${glow}`);
        dlg(1, s, e, 'Main', `{${pos}${fadeIn}\\blur0.8}${text}`);
      } else {
        dlg(0, s, e, 'Main', `{${pos}${fadeIn}}${text}`);
      }
    });
  });
  return header.concat(ev).join('\n') + '\n';
}

module.exports = { buildAss, STYLES, groupWords };
