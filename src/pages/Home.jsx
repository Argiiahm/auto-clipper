import React, { useEffect, useMemo, useState } from 'react';
import { Scissors, Link2, Upload, Settings as Cog, Trash2, Film, KeyRound, ArrowRight, MonitorPlay, FolderOpen, Search, Home as HomeIcon, Plus } from 'lucide-react';
import { api, call, fileUrl } from '../lib/api';
import { fmtDur, timeAgo, cx } from '../lib/format';
import { Spinner, toast, Segmented } from '../components/ui.jsx';
import { THEMES } from '../components/ThemeMenu.jsx';

const STEP_LABEL = { download: 'Download', transcribe: 'Transkrip', highlights: 'Highlight', webcam: 'Webcam' };

function statusOf(p) {
  const steps = p.steps || {};
  const err = Object.entries(steps).find(([, s]) => s.status === 'error');
  if (err) return { kind: 'error', text: `${STEP_LABEL[err[0]]} gagal` };
  const run = Object.entries(steps).find(([, s]) => s.status === 'running');
  if (run) return { kind: 'running', text: `${STEP_LABEL[run[0]]}…` };
  if (steps.highlights && steps.highlights.status === 'done') return { kind: 'done', text: `${p.clipCount} klip` };
  return { kind: 'idle', text: 'Belum selesai' };
}

export default function Home({ settings, hasKey, openSettings, openProject, setTheme }) {
  const [url, setUrl] = useState('');
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => { try { setProjects(await call('projects:list')); } catch (e) { toast(e.message, 'error'); } };
  useEffect(() => {
    load();
    const offs = [api.on('projects:changed', load), api.on('project:updated', load)];
    return () => offs.forEach((f) => f());
  }, []);

  const start = async (opts) => {
    setBusy(true);
    try { const p = await call('project:create', opts); setUrl(''); openProject(p.id); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const submit = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return toast('Masukkan link video yang valid (YouTube, TikTok, Twitch VOD, dll).', 'error');
    start({ url: u });
  };
  const importLocal = async () => { const f = await call('dialog:openVideo'); if (f) start({ localPath: f }); };
  const del = async (e, p) => {
    e.stopPropagation();
    if (!confirm(`Hapus project "${p.title}" beserta semua file-nya?`)) return;
    await call('project:delete', p.id); load();
  };
  const shown = useMemo(() => projects.filter((p) => !q.trim() || `${p.title} ${p.channel}`.toLowerCase().includes(q.trim().toLowerCase())), [projects, q]);

  return (
    <div className="h-full flex bg-bg">
      {/* sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-fg flex items-center justify-center"><Scissors size={15} className="text-bg" /></div>
          <div className="font-display font-extrabold text-[14.5px] tracking-tight text-fg">AutoClipper</div>
        </div>
        <nav className="px-2 py-2 space-y-0.5">
          <button className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] bg-hover text-fg font-medium"><HomeIcon size={15} />Beranda</button>
          <button className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] text-fg2 hover:bg-hover" onClick={() => call('shell:open', settings.workspaceDir + '')}><FolderOpen size={15} />Folder kerja</button>
          <button className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] text-fg2 hover:bg-hover" onClick={() => openSettings()}><Cog size={15} />Pengaturan</button>
        </nav>
        <div className="mt-auto p-3 space-y-2">
          <div className="text-[11px] text-muted px-1">Tema</div>
          <Segmented full value={settings.theme || 'system'} onChange={setTheme} options={THEMES.map(([k, l, I]) => ({ value: k, title: l, icon: <I size={13} /> }))} />
          <div className="text-[11px] text-faint px-1 pt-1 truncate">LLM: {settings.models[settings.llmProvider]}</div>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1180px] mx-auto px-8 py-8">
          <div className="grid grid-cols-[1fr_260px] gap-4">
            <div className="rounded-xl border border-line bg-panel p-5">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-fg"><Plus size={16} />Proyek baru dari link</div>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 flex items-center h-11 rounded-lg bg-panel2 border border-line focus-within:border-accent transition">
                  <Link2 size={16} className="ml-3 text-muted shrink-0" />
                  <input className="flex-1 h-full bg-transparent outline-none px-2.5 text-[13.5px] text-fg placeholder:text-faint" placeholder="Tempel link YouTube, Twitch VOD, TikTok…"
                    value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus />
                </div>
                <button className="btn-primary h-11 px-5 text-[13px]" disabled={busy} onClick={submit}>{busy ? <Spinner /> : <ArrowRight size={16} />}Mulai</button>
              </div>
              <div className="mt-3 text-[12px] text-muted">Download → transkrip → cari highlight → atur & edit klip → ekspor 1080×1920.</div>
            </div>
            <button onClick={importLocal} disabled={busy} className="rounded-xl border border-dashed border-line bg-panel hover:border-accent hover:bg-accent/5 transition flex flex-col items-center justify-center gap-2 text-fg">
              <div className="w-10 h-10 rounded-full bg-accent/15 text-accent-300 flex items-center justify-center"><Upload size={18} /></div>
              <div className="text-[13px] font-semibold">Impor video lokal</div>
              <div className="text-[11.5px] text-muted">mp4, mkv, mov, webm…</div>
            </button>
          </div>

          {!hasKey && (
            <button onClick={() => openSettings('ai')} className="mt-4 w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-fg hover:bg-amber-500/15 transition">
              <KeyRound size={16} className="text-amber-500 shrink-0" />
              <div className="flex-1 text-[12.5px]"><b>API key belum diisi.</b> Isi Groq API key (gratis, console.groq.com/keys) di Pengaturan supaya transkrip & highlight bisa jalan.</div>
              <ArrowRight size={15} />
            </button>
          )}

          <div className="mt-8 flex items-center justify-between mb-3">
            <div className="text-[14px] font-semibold text-fg">Proyek <span className="text-muted font-normal ml-1">{projects.length}</span></div>
            <div className="flex items-center h-8 w-64 rounded-md bg-panel border border-line focus-within:border-accent">
              <Search size={14} className="ml-2.5 text-muted" />
              <input className="flex-1 bg-transparent outline-none px-2 text-[12.5px] text-fg placeholder:text-faint" placeholder="Cari proyek" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line py-16 text-center text-muted text-[12.5px]">
              <Film className="mx-auto mb-3 opacity-50" size={26} />{projects.length ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek.'}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
              {shown.map((p) => {
                const st = statusOf(p);
                return (
                  <div key={p.id} onClick={() => openProject(p.id)} className="group cursor-pointer">
                    <div className="aspect-video rounded-lg overflow-hidden bg-stage relative ring-1 ring-line group-hover:ring-2 group-hover:ring-accent transition">
                      {p.cover ? <img src={fileUrl(p.cover)} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-faint"><MonitorPlay size={32} /></div>}
                      {p.duration ? <span className="absolute bottom-1.5 right-1.5 text-[11px] px-1.5 py-0.5 rounded bg-black/70 text-white">{fmtDur(p.duration)}</span> : null}
                      <span className={cx('absolute top-1.5 left-1.5 text-[11px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1.5',
                        st.kind === 'done' ? 'bg-emerald-600 text-white' : st.kind === 'error' ? 'bg-red-600 text-white' : st.kind === 'running' ? 'bg-accent text-onaccent' : 'bg-black/60 text-white')}>
                        {st.kind === 'running' && <Spinner size={10} />}{st.text}
                      </span>
                      <button onClick={(e) => del(e, p)} title="Hapus" className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md bg-black/60 text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"><Trash2 size={13} /></button>
                    </div>
                    <div className="pt-2 px-0.5">
                      <div className="text-[12.5px] font-medium text-fg line-clamp-2 leading-snug">{p.title}</div>
                      <div className="mt-1 text-[11.5px] text-muted flex items-center justify-between gap-2">
                        <span className="truncate">{p.channel || 'Video lokal'}</span>
                        <span className="shrink-0">{timeAgo(p.createdAt)}</span>
                      </div>
                      {p.renderCount > 0 && <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">{p.renderCount} hasil ekspor</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
