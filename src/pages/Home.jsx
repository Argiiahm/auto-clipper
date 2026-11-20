import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Scissors, Link2, Upload, Settings as Cog, Trash2, Film, KeyRound, ArrowUp,
  MonitorPlay, FolderOpen, Search, Home as HomeIcon, Flame, Laugh,
  Lightbulb, Zap, BookOpen, Mic, X, ChevronDown, Check, SlidersHorizontal
} from 'lucide-react';
import { api, call, fileUrl } from '../lib/api';
import { fmtDur, timeAgo, cx } from '../lib/format';
import { Spinner, toast, Segmented } from '../components/ui.jsx';
import { THEMES } from '../components/ThemeMenu.jsx';
import { PROMPT_TEMPLATES, getTemplate } from '../lib/templates';

const STEP_LABEL = { download: 'Download', transcribe: 'Transkrip', highlights: 'Highlight', webcam: 'Webcam' };

const TEMPLATE_ICONS = {
  viral: Flame,
  meme: Laugh,
  education: Lightbulb,
  debate: Zap,
  story: BookOpen,
  podcast_gold: Mic,
  custom: SlidersHorizontal,
};

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
  const [promptTemplate, setPromptTemplate] = useState('viral');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showTplMenu, setShowTplMenu] = useState(false);
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const menuRef = useRef(null);

  const load = async () => {
    try { setProjects(await call('projects:list')); }
    catch (e) { toast(e.message, 'error'); }
  };

  useEffect(() => {
    load();
    const offs = [api.on('projects:changed', load), api.on('project:updated', load)];
    return () => offs.forEach((f) => f());
  }, []);

  // Close template menu when clicking outside
  useEffect(() => {
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowTplMenu(false);
      }
    };
    if (showTplMenu) window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [showTplMenu]);

  const start = async (opts) => {
    setBusy(true);
    try {
      const p = await call('project:create', {
        ...opts,
        promptTemplate,
        customPrompt: customPrompt.trim(),
      });
      setUrl('');
      setCustomPrompt('');
      openProject(p.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      return toast('Masukkan link video yang valid (YouTube, TikTok, Twitch VOD, dll).', 'error');
    }
    if (promptTemplate === 'custom' && !customPrompt.trim()) {
      return toast('Tulis instruksi prompt kustom untuk mencari klip.', 'error');
    }
    start({ url: u });
  };

  const importLocal = async () => {
    if (promptTemplate === 'custom' && !customPrompt.trim()) {
      return toast('Tulis instruksi prompt kustom untuk mencari klip terlebih dahulu.', 'error');
    }
    const f = await call('dialog:openVideo');
    if (f) start({ localPath: f });
  };

  const del = async (e, p) => {
    e.stopPropagation();
    if (!confirm(`Hapus project "${p.title}" beserta semua file-nya?`)) return;
    await call('project:delete', p.id);
    load();
  };

  const shown = useMemo(() => {
    return projects.filter((p) =>
      !q.trim() || `${p.title} ${p.channel}`.toLowerCase().includes(q.trim().toLowerCase())
    );
  }, [projects, q]);

  const curTpl = getTemplate(promptTemplate);
  const CurTplIcon = TEMPLATE_ICONS[promptTemplate] || SlidersHorizontal;

  return (
    <div className="h-full flex bg-bg">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 border-r border-line bg-panel flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-fg flex items-center justify-center">
            <Scissors size={15} className="text-bg" />
          </div>
          <div className="font-display font-extrabold text-[14.5px] tracking-tight text-fg">AutoClipper</div>
        </div>
        <nav className="px-2 py-2 space-y-0.5">
          <button className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] bg-hover text-fg font-medium">
            <HomeIcon size={15} />Beranda
          </button>
          <button
            className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] text-fg2 hover:bg-hover transition"
            onClick={() => call('shell:open', settings.workspaceDir + '')}
          >
            <FolderOpen size={15} />Folder kerja
          </button>
          <button
            className="w-full h-9 px-3 rounded-md flex items-center gap-2.5 text-[13px] text-fg2 hover:bg-hover transition"
            onClick={() => openSettings()}
          >
            <Cog size={15} />Pengaturan
          </button>
        </nav>
        <div className="mt-auto p-3 space-y-2">
          <div className="text-[11px] text-muted px-1">Tema</div>
          <Segmented
            full
            value={settings.theme || 'system'}
            onChange={setTheme}
            options={THEMES.map(([k, l, I]) => ({ value: k, title: l, icon: <I size={13} /> }))}
          />
          <div className="text-[11px] text-faint px-1 pt-1 truncate">
            LLM: {settings.models[settings.llmProvider]}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">
          
          {/* Clean Left-Aligned Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-fg tracking-tight">
              Buat Klip Baru
            </h1>
            <p className="text-[13px] text-muted">
              Tempel URL video online atau pilih file video lokal untuk diekstrak menjadi klip shorts/reels secara otomatis.
            </p>
          </div>

          {/* Spacious Card Input Container */}
          <div className="rounded-xl border border-line bg-panel shadow-sm hover:border-line/90 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 transition-all p-4 space-y-3">
            
            {/* Video URL Input Row */}
            <div className="flex items-center gap-3">
              <Link2 size={18} className="text-muted shrink-0 ml-1" />
              <input
                type="text"
                className="flex-1 bg-transparent outline-none text-[15px] text-fg placeholder:text-faint font-normal"
                placeholder="Tempel link video YouTube, TikTok, Twitch VOD, podcast..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl('')}
                  className="w-7 h-7 rounded-md hover:bg-hover text-muted hover:text-fg flex items-center justify-center transition"
                  title="Hapus tautan"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Prompt Input Row */}
            <div className="flex items-center gap-2.5 px-1 pt-2.5 border-t border-line/60 text-[13px]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0">Prompt</span>
              <input
                type="text"
                className="flex-1 bg-transparent outline-none text-[13px] text-fg placeholder:text-faint"
                placeholder={curTpl.placeholder || "Instruksi khusus pencarian highlight (opsional)..."}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>

            {/* Bottom Toolbar: Template Picker, Local Video Button, & Submit */}
            <div className="flex items-center justify-between pt-3 border-t border-line/60 gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                
                {/* Template Selector Button with Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setShowTplMenu(!showTplMenu)}
                    className="h-8.5 px-3 rounded-lg bg-panel2 hover:bg-hover border border-line text-[12.5px] font-medium text-fg flex items-center gap-2 transition select-none"
                    title="Pilih fokus tema klip"
                  >
                    <CurTplIcon size={14} className="text-accent" />
                    <span>Fokus: {curTpl.label}</span>
                    <ChevronDown size={13} className="text-muted" />
                  </button>

                  {/* Dropdown Menu */}
                  {showTplMenu && (
                    <div className="absolute left-0 bottom-full mb-1.5 w-72 p-1.5 rounded-xl bg-panel border border-line shadow-xl z-30 space-y-1">
                      <div className="px-2.5 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">
                        Kategori Fokus Klip
                      </div>
                      {PROMPT_TEMPLATES.map((t) => {
                        const Icon = TEMPLATE_ICONS[t.id] || SlidersHorizontal;
                        const active = promptTemplate === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setPromptTemplate(t.id);
                              setShowTplMenu(false);
                            }}
                            className={cx(
                              'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12.5px] transition',
                              active ? 'bg-accent/15 text-accent-text font-semibold' : 'hover:bg-hover text-fg'
                            )}
                          >
                            <div className={cx('w-6 h-6 rounded flex items-center justify-center shrink-0', active ? 'bg-accent text-onaccent' : 'bg-panel2 text-muted')}>
                              <Icon size={13} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="leading-tight truncate">{t.label}</div>
                              <div className="text-[11px] text-muted truncate">{t.desc}</div>
                            </div>
                            {active && <Check size={14} className="text-accent ml-auto shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Import Local Video Button */}
                <button
                  type="button"
                  onClick={importLocal}
                  disabled={busy}
                  className="h-8.5 px-3 rounded-lg bg-panel2 hover:bg-hover border border-line text-[12.5px] font-medium text-fg flex items-center gap-1.5 transition disabled:opacity-40"
                  title="Pilih video dari file lokal komputer Anda"
                >
                  <Upload size={14} className="text-muted" />
                  <span>Impor file lokal</span>
                </button>
              </div>

              {/* Action Submit Button */}
              <button
                type="button"
                className="h-9 px-4 rounded-lg bg-accent hover:opacity-90 text-onaccent font-medium text-[13px] flex items-center gap-2 transition disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shrink-0"
                disabled={busy || !url.trim()}
                onClick={submit}
                title="Mulai proses klip"
              >
                {busy ? (
                  <>
                    <Spinner size={14} />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <span>Proses Video</span>
                    <ArrowUp size={15} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Preset Chips (Left Aligned, Clean & Subtle) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-muted font-medium mr-1">Preset:</span>
            {PROMPT_TEMPLATES.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] || SlidersHorizontal;
              const active = promptTemplate === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPromptTemplate(t.id)}
                  className={cx(
                    'h-7 px-2.5 rounded-lg text-[12px] border transition-all inline-flex items-center gap-1.5 select-none',
                    active
                      ? 'bg-accent/15 border-accent/70 text-accent-text font-semibold shadow-xs'
                      : 'bg-panel border-line text-muted hover:text-fg hover:border-line/90'
                  )}
                >
                  <Icon size={12} className={active ? 'text-accent' : 'text-muted'} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Warning Banner if API Key is missing */}
          {!hasKey && (
            <button
              onClick={() => openSettings('ai')}
              className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-fg hover:bg-amber-500/15 transition"
            >
              <KeyRound size={16} className="text-amber-500 shrink-0" />
              <div className="flex-1 text-[12.5px]">
                <b>API key belum diisi.</b> Masukkan Groq API key atau Gemini API key di Pengaturan agar proses transkrip dan highlight berjalan lancar.
              </div>
              <ChevronDown size={14} className="-rotate-90 text-amber-500" />
            </button>
          )}

          {/* Recent Projects Section */}
          <div className="pt-4 border-t border-line space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-[16px] font-bold text-fg tracking-tight">Proyek Terbaru</h2>
                <p className="text-[12.5px] text-muted">
                  Daftar video yang telah diproses ({projects.length})
                </p>
              </div>

              {/* Search Bar */}
              <div className="flex items-center h-9 w-64 rounded-lg bg-panel border border-line focus-within:border-accent transition px-2.5">
                <Search size={14} className="text-muted shrink-0" />
                <input
                  type="text"
                  className="flex-1 bg-transparent outline-none px-2 text-[12.5px] text-fg placeholder:text-faint"
                  placeholder="Cari proyek..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button onClick={() => setQ('')} className="text-muted hover:text-fg p-0.5">
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Project Grid / Empty State */}
            {shown.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-16 text-center text-muted text-[12.5px] bg-panel/30">
                <Film className="mx-auto mb-3 opacity-40" size={28} />
                {projects.length ? 'Tidak ada proyek yang sesuai dengan pencarian.' : 'Belum ada proyek. Mulai dengan memasukkan link video atau impor file lokal di atas.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {shown.map((p) => {
                  const st = statusOf(p);
                  const tpl = p.promptTemplate ? getTemplate(p.promptTemplate) : null;
                  return (
                    <div
                      key={p.id}
                      onClick={() => openProject(p.id)}
                      className="group cursor-pointer rounded-xl bg-panel border border-line hover:border-accent/50 hover:shadow-md transition overflow-hidden flex flex-col"
                    >
                      {/* Video Thumbnail Box */}
                      <div className="aspect-video bg-stage relative overflow-hidden">
                        {p.cover ? (
                          <img src={fileUrl(p.cover)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-faint">
                            <MonitorPlay size={32} />
                          </div>
                        )}
                        {p.duration ? (
                          <span className="absolute bottom-1.5 right-1.5 text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-black/75 text-white backdrop-blur-sm">
                            {fmtDur(p.duration)}
                          </span>
                        ) : null}

                        {/* Status Badge */}
                        <span
                          className={cx(
                            'absolute top-1.5 left-1.5 text-[10.5px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shadow-sm',
                            st.kind === 'done'
                              ? 'bg-emerald-600 text-white'
                              : st.kind === 'error'
                              ? 'bg-red-600 text-white'
                              : st.kind === 'running'
                              ? 'bg-accent text-onaccent'
                              : 'bg-black/70 text-white'
                          )}
                        >
                          {st.kind === 'running' && <Spinner size={9} />}
                          {st.text}
                        </span>

                        {/* Delete Button on Hover */}
                        <button
                          onClick={(e) => del(e, p)}
                          title="Hapus proyek"
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-md bg-black/60 text-white hover:bg-red-600 opacity-0 group-hover:opacity-100 transition flex items-center justify-center shadow"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Card Content Info */}
                      <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="text-[13px] font-semibold text-fg line-clamp-2 leading-snug group-hover:text-accent transition">
                            {p.title}
                          </div>
                          <div className="mt-1 text-[11.5px] text-muted flex items-center justify-between gap-2">
                            <span className="truncate">{p.channel || 'Video lokal'}</span>
                            <span className="shrink-0">{timeAgo(p.createdAt)}</span>
                          </div>
                        </div>

                        {/* Badges footer */}
                        <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                          {tpl && (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-panel2 border border-line text-muted font-medium">
                              {tpl.label}
                            </span>
                          )}
                          {p.renderCount > 0 && (
                            <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                              {p.renderCount} ekspor
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
