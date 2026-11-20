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

function buildAss({
  words,
  clipStart,
  clipEnd,
  styleId = 'pop',
  posPct = 75,
  wordsPerLine = 3,
  letterSpacing = 0,
  wordSpacing = 0,
  lineHeight = 1.2,
  animation = 'pop',
}) {
  const st = STYLES[styleId] || STYLES.pop;
  const y = Math.round((H * Math.max(5, Math.min(95, posPct))) / 100);
  const pos = `\\an5\\pos(${W / 2},${y})`;
  const rel = words
    .filter((w) => w.e > clipStart && w.s < clipEnd)
    .map((w) => ({ w: st.upper ? w.w.toUpperCase() : w.w, s: Math.max(0, w.s - clipStart), e: Math.min(clipEnd, w.e) - clipStart }));
  const maxWords = st.clean ? Math.max(4, wordsPerLine * 2 + 1) : Math.max(1, wordsPerLine);
  const maxChars = st.clean ? 40 : (st.font === 'Bangers' ? 20 : 16);
  const groups = groupWords(rel, maxWords, maxChars);

  const effSpacing = letterSpacing !== undefined && letterSpacing !== null ? letterSpacing : (st.spacing || 0);
  const styleLine = (name, s, opts = {}) => {
    const borderStyle = opts.borderStyle || 1;
    const bord = opts.bord !== undefined ? opts.bord : s.bord;
    const outline = opts.outline || hex2ass(s.outline);
    const back = opts.back || hex2ass('000000', s.shad ? '80' : '00');
    return `Style: ${name},${s.font},${s.size},${opts.primary || hex2ass(s.primary)},${hex2ass('FFFFFF')},${outline},${back},0,0,0,0,100,100,${effSpacing},0,${borderStyle},${bord},${opts.shad !== undefined ? opts.shad : s.shad},5,60,60,0,1`;
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

  const separator = (wordSpacing && wordSpacing >= 16) ? ' \\h ' : ' ';

  groups.forEach((g, gi) => {
    const gStart = g[0].s;
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].s : Infinity;
    const gEnd = Math.min(g[g.length - 1].e + 0.35, nextStart, clipEnd - clipStart);

    if (st.clean) {
      dlg(0, gStart, gEnd, 'Main', `{${pos}\\fad(60,0)}` + g.map((w) => esc(w.w)).join(separator));
      return;
    }

    const formatText = (activeIdx, isActiveVoice) => {
      const parts = g.map((w, wi) => {
        const t = esc(w.w);
        const isA = wi === activeIdx;

        if (styleId === 'box') return t;
        if (styleId === 'focus') {
          return isA ? `{\\1a&H00&\\3a&H00&}${t}` : `{\\1a&H9A&\\3a&HB0&}${t}`;
        }
        if (styleId === 'neon') {
          return isA ? `{\\1c${hex2ass(st.active)}\\3c${hex2ass(st.activeEdge)}}${t}{\\1c${hex2ass(st.primary)}\\3c${hex2ass(st.outline)}}` : t;
        }

        if (isA) {
          if (!isActiveVoice || animation === 'none' || animation === 'highlight') {
            return `{\\1c${hex2ass(st.active)}}${t}{\\1c${hex2ass(st.primary)}}`;
          }
          if (animation === 'jump') {
            return `{\\1c${hex2ass(st.active)}\\t(0,70,\\fscy${Math.round(st.scale * 1.15)}\\frz-2)\\t(70,150,\\fscy${st.scale}\\frz0)}${t}{\\1c${hex2ass(st.primary)}\\fscx100\\fscy100\\frz0}`;
          }
          if (animation === 'pulse') {
            return `{\\1c${hex2ass(st.active)}\\t(0,100,\\fscx${st.scale}\\fscy${st.scale})}${t}{\\1c${hex2ass(st.primary)}\\fscx100\\fscy100}`;
          }
          if (animation === 'fade') {
            return `{\\1c${hex2ass(st.active)}\\fad(50,0)}${t}{\\1c${hex2ass(st.primary)}}`;
          }
          // Default 'pop': Pop & Bounce
          const peakScale = Math.round(st.scale * 1.18);
          return `{\\1c${hex2ass(st.active)}\\t(0,80,\\fscx${peakScale}\\fscy${peakScale})\\t(80,160,\\fscx${st.scale}\\fscy${st.scale})}${t}{\\1c${hex2ass(st.primary)}\\fscx100\\fscy100}`;
        }
        return t;
      });
      return parts.join(separator);
    };

    // If there's silence before first spoken word in group
    if (g[0].s - gStart >= 0.08) {
      dlg(0, gStart, g[0].s, 'Main', `{${pos}\\fad(40,0)}` + g.map((w) => esc(w.w)).join(separator));
    }

    g.forEach((w, ai) => {
      const wordStart = w.s;
      const wordEnd = Math.max(w.s + 0.15, w.e);
      const nextWordStart = ai + 1 < g.length ? g[ai + 1].s : gEnd;
      const voiceEnd = Math.min(nextWordStart, wordEnd + 0.08);

      // 1. Voice IS active for word ai
      if (voiceEnd - wordStart >= 0.03) {
        const text = formatText(ai, true);
        const fadeIn = (ai === 0 && wordStart - gStart < 0.08) ? '\\fad(50,0)' : '';

        if (styleId === 'box') {
          const bg = g.map((bw, bwi) => (bwi === ai ? `{\\3a&H00&\\4a&H00&}${esc(bw.w)}{\\3a&HFF&\\4a&HFF&}` : esc(bw.w))).join(separator);
          dlg(0, wordStart, voiceEnd, 'BoxBg', `{${pos}\\1a&HFF&\\3a&HFF&\\4a&HFF&}${bg}`);
          dlg(1, wordStart, voiceEnd, 'Main', `{${pos}}${text}`);
        } else if (styleId === 'neon') {
          const glow = g.map((gw, gwi) => (gwi === ai ? `{\\3c${hex2ass(st.active)}}${esc(gw.w)}{\\3c${hex2ass(st.outline)}}` : esc(gw.w))).join(separator);
          dlg(0, wordStart, voiceEnd, 'Glow', `{${pos}${fadeIn}\\1a&HFF&\\blur12}${glow}`);
          dlg(1, wordStart, voiceEnd, 'Main', `{${pos}${fadeIn}\\blur0.8}${text}`);
        } else {
          dlg(0, wordStart, voiceEnd, 'Main', `{${pos}${fadeIn}}${text}`);
        }
      }

      // 2. Pause/silence between word ai and nextWordStart
      if (nextWordStart - voiceEnd >= 0.1) {
        const textRest = formatText(ai, false);
        if (styleId === 'box') {
          const bg = g.map((bw, bwi) => (bwi === ai ? `{\\3a&H00&\\4a&H00&}${esc(bw.w)}{\\3a&HFF&\\4a&HFF&}` : esc(bw.w))).join(separator);
          dlg(0, voiceEnd, nextWordStart, 'BoxBg', `{${pos}\\1a&HFF&\\3a&HFF&\\4a&HFF&}${bg}`);
          dlg(1, voiceEnd, nextWordStart, 'Main', `{${pos}}${textRest}`);
        } else if (styleId === 'neon') {
          dlg(1, voiceEnd, nextWordStart, 'Main', `{${pos}\\blur0.8}${textRest}`);
        } else {
          dlg(0, voiceEnd, nextWordStart, 'Main', `{${pos}}${textRest}`);
        }
      }
    });
  });
  return header.concat(ev).join('\n') + '\n';
}

module.exports = { buildAss, STYLES, groupWords };
