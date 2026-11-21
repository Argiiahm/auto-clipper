// Sequence playback engine for the editor preview.
// Plays the output timeline (source pieces + inserted scenes) using hidden <video>/<audio> elements.
import { useCallback, useEffect, useRef, useState } from 'react';
import { itemAt } from './sequence';
import { loadImage } from './overlay';

export default function usePlayer({ videoRef, insRef, musicRef, seq, clipId, assetUrl, music, active }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const curRef = useRef(null); // current item
  const imgClock = useRef(0);
  const seqRef = useRef(seq); seqRef.current = seq;
  const musicRefState = useRef(music); musicRefState.current = music;
  const assetUrlRef = useRef(assetUrl); assetUrlRef.current = assetUrl;
  const token = useRef(0);

  const syncMusic = (time, play) => {
    const m = musicRef.current; const mu = musicRefState.current;
    if (!m) return;
    if (!mu || !mu.url) { if (!m.paused) m.pause(); return; }
    if (m.dataset.src !== mu.url) { m.src = mu.url; m.dataset.src = mu.url; }
    const mStart = Number(mu.start) || 0;
    const mEnd = mu.end != null ? Number(mu.end) : Infinity;
    if (time < mStart || time > mEnd) {
      if (!m.paused) m.pause();
      return;
    }
    const go = () => {
      const d = m.duration || 0;
      let pos = (Number(mu.offset) || 0) + (time - mStart);
      if (d > 0) pos = pos % d;
      if (Math.abs(m.currentTime - pos) > 0.25) m.currentTime = pos;
      if (play) m.play().catch(() => {}); else m.pause();
    };
    if (m.readyState >= 1) go(); else m.addEventListener('loadedmetadata', go, { once: true });
  };

  /** position all elements for output time `time`; start playback if `play` */
  const syncTo = useCallback((time, play) => {
    const s = seqRef.current; const v = videoRef.current; const iv = insRef.current;
    const my = ++token.current;
    const r = itemAt(s, time);
    curRef.current = r ? r.item : null;
    if (!r) { v && v.pause(); iv && iv.pause(); return; }
    const it = r.item; const off = Math.max(0, time - it.os);
    if (it.type === 'src') {
      if (iv && !iv.paused) iv.pause();
      if (v) {
        const target = it.s + off;
        if (Math.abs(v.currentTime - target) > 0.08 || v.paused !== !play) v.currentTime = target;
        if (play) v.play().catch(() => {}); else v.pause();
      }
    } else {
      if (v && !v.paused) v.pause();
      const ins = it.ins; const url = assetUrlRef.current(ins.asset);
      if (ins.kind === 'image') {
        if (iv && !iv.paused) iv.pause();
        loadImage(url);
        imgClock.current = performance.now() - off * 1000;
      } else if (iv) {
        const go = () => {
          if (my !== token.current) return;
          iv.currentTime = (Number(ins.in) || 0) + off;
          iv.dataset.mute = ins.mute ? '1' : ''; iv.muted = !!ins.mute;
          if (play) iv.play().catch(() => {}); else iv.pause();
        };
        if (iv.dataset.src !== url) { iv.src = url; iv.dataset.src = url; iv.addEventListener('loadedmetadata', go, { once: true }); }
        else if (iv.readyState >= 1) go(); else iv.addEventListener('loadedmetadata', go, { once: true });
      }
    }
    syncMusic(time, play);
  }, []);

  const seek = useCallback((time) => {
    const s = seqRef.current;
    time = Math.max(0, Math.min(Math.max(0, s.total - 0.01), time));
    tRef.current = time; setT(time);
    syncTo(time, playingRef.current);
  }, [syncTo]);

  const pause = useCallback(() => {
    playingRef.current = false; setPlaying(false);
    videoRef.current && videoRef.current.pause(); insRef.current && insRef.current.pause(); musicRef.current && musicRef.current.pause();
  }, []);
  const play = useCallback(() => {
    const s = seqRef.current;
    if (!s.items.length) return;
    if (tRef.current >= s.total - 0.05) { tRef.current = 0; setT(0); }
    playingRef.current = true; setPlaying(true);
    syncTo(tRef.current, true);
  }, [syncTo]);
  const toggle = useCallback(() => (playingRef.current ? pause() : play()), [pause, play]);

  // clock
  useEffect(() => {
    if (!active) return;
    let raf;
    const loop = () => {
      const s = seqRef.current; const it = curRef.current;
      if (playingRef.current && it) {
        let nt = tRef.current;
        let ended = false;
        if (it.type === 'src') {
          const v = videoRef.current;
          if (v && !v.seeking) { nt = it.os + (v.currentTime - it.s); if (v.currentTime >= it.e - 0.03 || v.ended) ended = true; }
        } else if (it.ins.kind === 'image') {
          nt = it.os + (performance.now() - imgClock.current) / 1000;
          if (nt >= it.oe) ended = true;
        } else {
          const iv = insRef.current;
          if (iv && !iv.seeking && iv.readyState >= 2) { nt = it.os + (iv.currentTime - (Number(it.ins.in) || 0)); if (nt >= it.oe - 0.03 || iv.ended) ended = true; }
        }
        nt = Math.max(it.os, Math.min(it.oe, nt));
        if (ended) {
          const idx = s.items.indexOf(it);
          const next = s.items[idx + 1];
          if (next) { nt = next.os; syncTo(nt, true); } else { nt = 0; syncTo(0, true); }
        }
        if (Math.abs(nt - tRef.current) > 0.001) {
          tRef.current = nt; setT(nt);
          const mu = musicRefState.current;
          if (mu && mu.url && musicRef.current) {
            const mStart = Number(mu.start) || 0;
            const mEnd = mu.end != null ? Number(mu.end) : Infinity;
            if (nt < mStart || nt > mEnd) {
              if (!musicRef.current.paused) musicRef.current.pause();
            } else if (musicRef.current.paused && playingRef.current) {
              syncMusic(nt, true);
            }
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, syncTo]);

  // new clip -> stop & rewind
  useEffect(() => { pause(); tRef.current = 0; setT(0); syncTo(0, false); }, [clipId]);
  // timeline changed -> resync at the same output time
  const sig = seq.items.map((i) => `${i.id}:${i.os.toFixed(2)}:${i.oe.toFixed(2)}`).join('|');
  useEffect(() => {
    const time = Math.min(tRef.current, Math.max(0, seq.total - 0.01));
    tRef.current = time; setT(time);
    syncTo(time, playingRef.current);
  }, [sig]);
  useEffect(() => { syncMusic(tRef.current, playingRef.current); }, [music && music.url, music && music.offset, music && music.start, music && music.end]);
  useEffect(() => { if (!active) pause(); }, [active]);

  return { t, tRef, playing, seek, play, pause, toggle, curRef, imgClock };
}
