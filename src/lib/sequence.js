// Manual-edit timeline model shared by preview (src/lib) and renderer (electron/lib).
// Keep src/lib/sequence.js and electron/lib/sequence.js identical (except the export style).
//
// clip.start / clip.end  = source range (unchanged meaning).
// clip.edit = {
//   cuts:    [{ s, e }]                  removed source ranges (absolute source seconds)
//   splits:  [t]                         split points (absolute source seconds), purely visual until a part is deleted
//   inserts: [{ id, asset, kind, at, in, out, dur, fit, mute }]
//            own scenes placed before source time `at` (video: in/out seconds, image: dur seconds)
//   overlays:[{ id, type:'text'|'image', start, end, x, y, ... }]  times on the OUTPUT timeline
//   music:   { asset, volume, sourceVolume, offset }
//   adjust:  { brightness, contrast, saturation }   (-100..100)
//   watermark: true|false                 show the global watermark on this clip (default true)
// }

const EPS = 0.02;

export function emptyEdit() {
  return { cuts: [], splits: [], inserts: [], overlays: [], music: null, adjust: null, watermark: true };
}

export function getEdit(clip) {
  return { ...emptyEdit(), ...((clip && clip.edit) || {}) };
}

export function insertLen(ins) {
  if (!ins) return 0;
  if (ins.kind === 'image') return Math.max(0.2, Number(ins.dur) || 3);
  return Math.max(0.2, (Number(ins.out) || 0) - (Number(ins.in) || 0));
}

function normCuts(cuts, S, E) {
  const arr = (cuts || [])
    .map((c) => ({ s: Math.max(S, Math.min(c.s, c.e)), e: Math.min(E, Math.max(c.s, c.e)) }))
    .filter((c) => c.e - c.s > EPS)
    .sort((a, b) => a.s - b.s);
  const out = [];
  for (const c of arr) {
    const last = out[out.length - 1];
    if (last && c.s <= last.e + EPS) last.e = Math.max(last.e, c.e);
    else out.push({ ...c });
  }
  return out;
}

/** Build the output sequence for a clip: [{type:'src', s, e, os, oe} | {type:'ins', ins, os, oe}] */
export function buildSequence(clip) {
  const ed = getEdit(clip);
  const S = Number(clip.start) || 0;
  const E = Math.max(S + 0.1, Number(clip.end) || 0);
  const cuts = normCuts(ed.cuts, S, E);
  // source pieces = [S,E] minus cuts
  let pieces = [];
  let cur = S;
  for (const c of cuts) { if (c.s - cur > EPS) pieces.push({ s: cur, e: c.s }); cur = Math.max(cur, c.e); }
  if (E - cur > EPS) pieces.push({ s: cur, e: E });
  // split points
  const splits = (ed.splits || []).filter((t) => t > S + EPS && t < E - EPS).sort((a, b) => a - b);
  if (splits.length) {
    const sp = [];
    for (const p of pieces) {
      let a = p.s;
      for (const t of splits) if (t > a + EPS && t < p.e - EPS) { sp.push({ s: a, e: t }); a = t; }
      sp.push({ s: a, e: p.e });
    }
    pieces = sp;
  }
  // snap inserts to a valid source position
  const snap = (at) => {
    let t = Math.max(S, Math.min(E, Number(at)));
    if (!isFinite(t)) t = S;
    for (const c of cuts) if (t > c.s + EPS && t < c.e - EPS) t = c.e;
    return t;
  };
  const ins = (ed.inserts || []).map((x, i) => ({ x, i, at: snap(x.at) })).sort((a, b) => a.at - b.at || a.i - b.i);
  const items = [];
  let o = 0;
  const pushSrc = (s, e) => { if (e - s > EPS) { items.push({ type: 'src', id: 'src:' + s.toFixed(2), s, e, os: o, oe: o + (e - s) }); o += e - s; } };
  const pushIns = (x) => { const len = insertLen(x); items.push({ type: 'ins', id: 'ins:' + x.id, ins: x, os: o, oe: o + len }); o += len; };
  let k = 0;
  if (!pieces.length) ins.forEach((q) => pushIns(q.x));
  pieces.forEach((p, pi) => {
    const last = pi === pieces.length - 1;
    let a = p.s;
    while (k < ins.length && (ins[k].at < p.e - EPS || (last && ins[k].at <= p.e + EPS) || ins[k].at < p.s)) {
      const q = ins[k];
      if (q.at > a + EPS) { pushSrc(a, Math.min(q.at, p.e)); a = Math.min(q.at, p.e); }
      pushIns(q.x);
      k++;
    }
    pushSrc(a, p.e);
  });
  while (k < ins.length) { pushIns(ins[k].x); k++; }
  return { items, total: o, cuts, pieces };
}

export function itemAt(seq, t) {
  const it = seq.items;
  if (!it.length) return null;
  for (let i = 0; i < it.length; i++) if (t >= it[i].os - 1e-6 && t < it[i].oe - 1e-6) return { item: it[i], index: i };
  return { item: it[it.length - 1], index: it.length - 1 };
}

/** output time -> source time (null when inside an inserted scene) */
export function outToSrc(seq, t) {
  const r = itemAt(seq, t);
  if (!r || r.item.type !== 'src') return null;
  return r.item.s + (t - r.item.os);
}

/** source time -> output time (null when the source time is cut) */
export function srcToOut(seq, s) {
  for (const it of seq.items) if (it.type === 'src' && s >= it.s - 1e-6 && s <= it.e + 1e-6) return it.os + (s - it.s);
  return null;
}

/** Remap transcript words (source time) into output-timeline words. */
export function mapWords(words, seq) {
  const out = [];
  for (const it of seq.items) {
    if (it.type !== 'src') continue;
    for (const w of words || []) {
      if (w.e <= it.s || w.s >= it.e) continue;
      if (w.s < it.s - 0.15) continue; // word started before this piece (was cut)
      const s = Math.max(it.s, w.s); const e = Math.min(it.e, w.e);
      out.push({ ...w, s: it.os + (s - it.s), e: it.os + (e - it.s) });
    }
  }
  return out;
}

export function adjustIsDefault(a) {
  return !a || (!Number(a.brightness) && !Number(a.contrast) && !Number(a.saturation));
}

/** CSS-equivalent multipliers for brightness/contrast/saturation (-100..100). */
export function adjustFactors(a) {
  const f = (v, k) => Math.max(0, 1 + (Number(v) || 0) / 100 * k);
  return { b: f(a && a.brightness, 0.6), c: f(a && a.contrast, 0.6), s: f(a && a.saturation, 1) };
}

/** True when a clip needs the edit-aware render path. */
export function hasEdits(clip, extra) {
  const ed = getEdit(clip);
  const seq = buildSequence(clip);
  return !!((seq.cuts && seq.cuts.length) || (ed.inserts || []).length || (ed.music && ed.music.asset) || !adjustIsDefault(ed.adjust) || (extra && extra.length));
}
