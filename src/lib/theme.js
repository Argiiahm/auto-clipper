// Theme: 'system' (default) | 'light' | 'dark'
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current = 'system';

export function resolveTheme(t) {
  if (t === 'light' || t === 'dark') return t;
  return mq && mq.matches ? 'dark' : 'light';
}
export function applyTheme(t) {
  current = t || 'system';
  const dark = resolveTheme(current) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('ac-theme', current); } catch (_) {}
  return dark;
}
export function initTheme() {
  let t = 'system';
  try { t = localStorage.getItem('ac-theme') || 'system'; } catch (_) {}
  applyTheme(t);
  if (mq) mq.addEventListener('change', () => { if (current === 'system') applyTheme('system'); });
}
