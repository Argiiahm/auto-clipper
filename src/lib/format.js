export const fmtTime = (sec, withMs = false) => {
  if (!isFinite(sec)) return '--:--';
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return withMs ? `${base}.${String(Math.floor((sec % 1) * 10))}` : base;
};
export const fmtDur = (sec) => {
  if (!sec) return '';
  if (sec < 60) return `${Math.round(sec)} dtk`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h}j ${m}m` : `${m} menit`;
};
export const timeAgo = (ts) => {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return 'baru saja';
  if (d < 3600) return `${Math.floor(d / 60)} mnt lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const parseTimeInput = (v) => {
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const p = s.split(':').map(parseFloat);
  if (p.some(isNaN)) return NaN;
  return p.reduce((a, x) => a * 60 + x, 0);
};
export const scoreColor = (s) => (s >= 85 ? 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/15' : s >= 70 ? 'text-lime-700 dark:text-lime-300 bg-lime-500/15' : s >= 50 ? 'text-amber-600 dark:text-amber-300 bg-amber-500/15' : 'text-muted bg-hover');
export const cx = (...a) => a.filter(Boolean).join(' ');
