import React, { useEffect, useState } from 'react';
import { Bot, Mic, Scissors, Cpu, Wrench, ExternalLink, RefreshCw, CheckCircle2, Eye, EyeOff, FolderOpen, Download, Palette } from 'lucide-react';
import { THEMES } from './ThemeMenu.jsx';
import { applyTheme } from '../lib/theme';
import { Modal, Field, Spinner, Segmented, Check, toast } from './ui.jsx';
import { call } from '../lib/api';
import { cx } from '../lib/format';
import { CAPTION_STYLES } from '../lib/captions';

const PROVIDERS = [
  { id: 'groq', name: 'Groq', note: 'Gratis · juga dipakai untuk Whisper', url: 'https://console.groq.com/keys',
    models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'] },
  { id: 'gemini', name: 'Google Gemini', note: 'Free tier · context 1M token', url: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'] },
  { id: 'openrouter', name: 'OpenRouter', note: 'Model :free · 50 request/hari', url: 'https://openrouter.ai/keys',
    models: ['openrouter/free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'] },
  { id: '9router', name: '9Router', note: 'AI Routing Proxy (port 20128)', url: 'http://localhost:20128',
    models: [] },
  { id: 'custom', name: 'Custom / Lokal', note: 'OpenAI-compatible (Ollama, LM Studio)', url: '', models: ['llama3.1', 'qwen2.5:7b'] },
];

const TRANSCRIBERS = [
  ['groq', 'Groq Whisper', 'Gratis & cepat. Timestamp per kata presisi tinggi.'],
  ['gemini', 'Google Gemini (Audio)', 'Gratis via Gemini key. Sangat pintar memahami konteks bahasa.'],
  ['9router', '9Router Whisper', 'Proxy Whisper lokal (default port 20128).'],
  ['openai', 'OpenAI Whisper', 'Model resmi whisper-1 dari OpenAI.'],
  ['custom', 'Custom STT', 'Endpoint Whisper lokal / OpenAI-compatible STT.'],
  ['youtube', 'Caption YouTube', 'Langsung ambil subtitle YouTube tanpa API key.'],
];
const LANGS = [['auto', 'Deteksi otomatis'], ['id', 'Indonesia'], ['en', 'English'], ['ms', 'Melayu'], ['jv', 'Jawa'], ['su', 'Sunda'], ['es', 'Español'], ['pt', 'Português'], ['ja', '日本語'], ['ko', '한국어'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['hi', 'Hindi'], ['ar', 'Arabic']];

function KeyInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input className="input pr-10 font-mono text-[12.5px]" type={show ? 'text' : 'password'} value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim())} spellCheck={false} />
      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg" onClick={() => setShow(!show)}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </div>
  );
}

export default function Settings({ open, onClose, settings, save, initialTab }) {
  const [tab, setTab] = useState('ai');
  useEffect(() => { if (open && initialTab) setTab(initialTab); }, [open, initialTab]);
  const [s, setS] = useState(settings);
  const [models, setModels] = useState({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [versions, setVersions] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { if (open) setS(settings); }, [open, settings]);
  useEffect(() => { if (open && tab === 'system' && !versions) call('sys:versions').then(setVersions).catch(() => {}); }, [open, tab]);
  if (!s) return null;

  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const setKey = (id, v) => setS((x) => ({ ...x, keys: { ...x.keys, [id]: v } }));
  const setModel = (id, v) => setS((x) => ({ ...x, models: { ...x.models, [id]: v } }));
  const setDef = (patch) => setS((x) => ({ ...x, defaults: { ...x.defaults, ...patch } }));
  const prov = PROVIDERS.find((p) => p.id === s.llmProvider) || PROVIDERS[0];
  const override = { provider: s.llmProvider, key: s.keys[s.llmProvider], model: s.models[s.llmProvider] };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      if (s.llmProvider === 'custom') await save({ customBaseUrl: s.customBaseUrl });
      if (s.llmProvider === '9router') await save({ nineRouterBaseUrl: s.nineRouterBaseUrl });
      const list = await call('llm:models', override);
      setModels((m) => ({ ...m, [s.llmProvider]: list.map((x) => x.id) }));
      toast(`${list.length} model ditemukan`, 'success');
    } catch (e) { toast(e.message, 'error'); } finally { setLoadingModels(false); }
  };
  const test = async () => {
    setTesting(true);
    try {
      if (s.llmProvider === 'custom') await save({ customBaseUrl: s.customBaseUrl });
      if (s.llmProvider === '9router') await save({ nineRouterBaseUrl: s.nineRouterBaseUrl });
      const r = await call('llm:test', override);
      toast(`✓ ${r.provider} OK (${r.model || 'respon diterima'}, ${r.ms} ms)`, 'success');
    }
    catch (e) { toast(e.message, 'error'); } finally { setTesting(false); }
  };
  const doSave = async () => { try { await save(s); await call('theme:set', s.theme || 'system'); toast('Pengaturan tersimpan', 'success'); onClose(); } catch (e) { toast(e.message, 'error'); } };
  const close = () => { applyTheme(settings.theme || 'system'); onClose(); };
  const modelList = Array.from(new Set([...(models[s.llmProvider] || []), ...prov.models, s.models[s.llmProvider]].filter(Boolean)));

  const TABS = [['ai', 'AI / API Key', Bot], ['stt', 'Transkrip', Mic], ['clips', 'Klip & Caption', Scissors], ['render', 'Render', Cpu], ['look', 'Tampilan', Palette], ['system', 'Sistem', Wrench]];

  return (
    <Modal open={open} onClose={close} title="Pengaturan" width="max-w-4xl"
      footer={<><button className="btn-ghost" onClick={close}>Batal</button><button className="btn-primary" onClick={doSave}>Simpan</button></>}>
      <div className="flex min-h-[520px]">
        <div className="w-48 border-r border-line p-2 bg-panel2/50 space-y-1 shrink-0">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={cx('w-full h-8 px-3 rounded-md flex items-center gap-2.5 text-[12.5px] transition', tab === id ? 'bg-hover text-fg font-medium' : 'text-fg2 hover:bg-hover')}>
              <Icon size={15} className={tab === id ? 'text-accent' : 'text-muted'} />{label}
            </button>
          ))}
        </div>
        <div className="flex-1 p-6 space-y-5">
          {tab === 'ai' && (<>
            <Field label="Provider LLM (untuk mencari highlight & judul)">
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button key={p.id} onClick={() => set({ llmProvider: p.id })} className={cx('text-left p-3 rounded-lg border transition', s.llmProvider === p.id ? 'border-accent bg-accent/10' : 'border-line hover:border-faint bg-panel2')}>
                    <div className="flex items-center justify-between"><div className="font-semibold text-fg text-[13px]">{p.name}</div>{s.keys[p.id] && <CheckCircle2 size={14} className="text-emerald-500" />}</div>
                    <div className="text-[11.5px] text-muted mt-0.5">{p.note}</div>
                  </button>
                ))}
              </div>
            </Field>
            {s.llmProvider === '9router' && (
              <Field label="Base URL 9Router" hint="Default: http://localhost:20128/v1 · Pastikan 9Router sedang berjalan">
                <input className="input font-mono text-[12.5px]" value={s.nineRouterBaseUrl || 'http://localhost:20128/v1'} onChange={(e) => set({ nineRouterBaseUrl: e.target.value })} />
              </Field>
            )}
            {s.llmProvider === 'custom' && (
              <Field label="Base URL" hint="Contoh: http://localhost:11434/v1 (Ollama) · http://localhost:1234/v1 (LM Studio)">
                <input className="input font-mono text-[12.5px]" value={s.customBaseUrl} onChange={(e) => set({ customBaseUrl: e.target.value })} />
              </Field>
            )}
            <Field label={`API key ${prov.name}`} right={prov.url && <button className="text-[12px] text-accent-300 hover:underline inline-flex items-center gap-1" onClick={() => call('shell:external', prov.url)}>{s.llmProvider === '9router' ? 'Buka Web UI' : 'Ambil key'} <ExternalLink size={11} /></button>}
              hint={s.llmProvider === '9router' ? 'Opsional jika 9Router lokal tidak memakai authentication/password.' : 'Disimpan terenkripsi (Windows DPAPI), hanya dikirim ke provider terkait.'}>
              <KeyInput value={s.keys[s.llmProvider]} onChange={(v) => setKey(s.llmProvider, v)} placeholder={s.llmProvider === 'groq' ? 'gsk_…' : s.llmProvider === 'gemini' ? 'AIza…' : s.llmProvider === 'openrouter' ? 'sk-or-…' : '(opsional)'} />
            </Field>
            <Field label="Model" right={<button className="text-[12px] text-accent-300 hover:underline inline-flex items-center gap-1" onClick={fetchModels} disabled={loadingModels}>{loadingModels ? <Spinner size={11} /> : <RefreshCw size={11} />}Ambil daftar model</button>}
              hint={s.llmProvider === 'groq' ? 'Rekomendasi: openai/gpt-oss-120b atau llama-3.3-70b-versatile. Video panjang dipecah per bagian agar tidak kena limit.' : s.llmProvider === '9router' ? 'Klik "Ambil daftar model" untuk memuat daftar model yang aktif atau combo di 9Router.' : s.llmProvider === 'openrouter' ? 'Hanya model gratis (:free) yang ditampilkan saat ambil daftar.' : ''}>
              <div className="flex gap-2">
                <select className="input" value={s.models[s.llmProvider]} onChange={(e) => setModel(s.llmProvider, e.target.value)}>
                  {modelList.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input className="input w-56 font-mono text-[12px]" placeholder="atau ketik model id" value={s.models[s.llmProvider]} onChange={(e) => setModel(s.llmProvider, e.target.value)} />
              </div>
            </Field>
            <div className="flex items-center gap-3">
              <button className="btn-soft" onClick={test} disabled={testing}>{testing ? <Spinner /> : <CheckCircle2 size={15} />}Tes koneksi</button>
              <span className="text-[12px] text-muted">Pakai key & model di atas, tanpa perlu disimpan.</span>
            </div>
            {s.llmProvider !== 'groq' && s.transcriber === 'groq' && (
              <Field label="API key Groq (untuk transkrip Whisper)" hint="Transkrip memakai Groq Whisper. Kelola opsi transkrip lain di tab Transkrip.">
                <KeyInput value={s.keys.groq} onChange={(v) => setKey('groq', v)} placeholder="gsk_…" />
              </Field>
            )}
          </>)}

          {tab === 'stt' && (<>
            <Field label="Sumber transkrip">
              <div className="grid grid-cols-2 gap-2">
                {TRANSCRIBERS.map(([id, n, d]) => (
                  <button key={id} onClick={() => set({ transcriber: id })} className={cx('text-left p-3 rounded-lg border transition', (s.transcriber || 'groq') === id ? 'border-accent bg-accent/10' : 'border-line hover:border-faint bg-panel2')}>
                    <div className="font-semibold text-fg text-[13px]">{n}</div><div className="text-[11.5px] text-muted mt-0.5">{d}</div>
                  </button>
                ))}
              </div>
            </Field>

            {(s.transcriber === 'groq' || !s.transcriber) && (<>
              <Field label="Model Groq Whisper">
                <Segmented size="md" value={s.whisperModel || 'whisper-large-v3-turbo'} onChange={(v) => set({ whisperModel: v })} options={[{ value: 'whisper-large-v3-turbo', label: 'large-v3-turbo (cepat)' }, { value: 'whisper-large-v3', label: 'large-v3 (paling akurat)' }]} />
              </Field>
              <Field label="API key Groq" hint="Dibutuhkan untuk Groq Whisper. Gratis di console.groq.com.">
                <KeyInput value={s.keys.groq} onChange={(v) => setKey('groq', v)} placeholder="gsk_…" />
              </Field>
            </>)}

            {s.transcriber === 'gemini' && (<>
              <Field label="Model Gemini STT">
                <Segmented size="md" value={s.geminiSttModel || 'gemini-2.5-flash'} onChange={(v) => set({ geminiSttModel: v })} options={[{ value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (terbaru & cepat)' }, { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' }]} />
              </Field>
              <Field label="API key Google Gemini" hint="Menggunakan API key Gemini yang sama dengan tab AI (gratis di aistudio.google.com).">
                <KeyInput value={s.keys.gemini} onChange={(v) => setKey('gemini', v)} placeholder="AIzaSy…" />
              </Field>
            </>)}

            {s.transcriber === '9router' && (<>
              <Field label="9Router Base URL" hint="Endpoint routing AI lokal 9Router.">
                <input className="input font-mono text-[12.5px]" value={s.nineRouterBaseUrl || 'http://localhost:20128/v1'} onChange={(e) => set({ nineRouterBaseUrl: e.target.value.trim() })} placeholder="http://localhost:20128/v1" />
              </Field>
              <Field label="Nama model Whisper di 9Router" hint="Nama model Whisper yang aktif di 9Router.">
                <input className="input font-mono text-[12.5px]" value={s.whisperModel || 'whisper-1'} onChange={(e) => set({ whisperModel: e.target.value.trim() })} placeholder="whisper-1" />
              </Field>
              <Field label="API key 9Router (Opsional)" hint="Kosongkan jika 9Router lokal tidak membutuhkan token.">
                <KeyInput value={(s.keys || {})['9router']} onChange={(v) => setKey('9router', v)} placeholder="Opsional" />
              </Field>
            </>)}

            {s.transcriber === 'openai' && (<>
              <Field label="Model Whisper OpenAI">
                <div className="text-[12px] font-mono text-fg bg-panel2 p-2 rounded border border-line">whisper-1</div>
              </Field>
              <Field label="API key OpenAI" hint="Dibutuhkan untuk OpenAI Whisper (platform.openai.com).">
                <KeyInput value={(s.keys || {}).openai} onChange={(v) => setKey('openai', v)} placeholder="sk-…" />
              </Field>
            </>)}

            {s.transcriber === 'custom' && (<>
              <Field label="Custom STT Endpoint URL" hint="URL lengkap endpoint audio transcription (OpenAI-compatible / Whisper server).">
                <input className="input font-mono text-[12.5px]" value={s.customSttUrl || ''} onChange={(e) => set({ customSttUrl: e.target.value.trim() })} placeholder="http://localhost:8000/v1/audio/transcriptions" />
              </Field>
              <Field label="Nama model STT">
                <input className="input font-mono text-[12.5px]" value={s.whisperModel || 'whisper-1'} onChange={(e) => set({ whisperModel: e.target.value.trim() })} placeholder="whisper-1" />
              </Field>
              <Field label="API key Custom (Opsional)">
                <KeyInput value={(s.keys || {}).custom} onChange={(v) => setKey('custom', v)} placeholder="Bearer token jika ada" />
              </Field>
            </>)}

            {s.transcriber === 'youtube' && (
              <div className="text-[12px] text-muted p-3 rounded-lg bg-panel2 border border-line leading-relaxed">
                Subtitle diunduh langsung dari YouTube (auto-caption atau subtitle resmi).
                <br /><br />
                <span className="text-accent-300 font-medium">Catatan:</span> Jika video lokal atau YouTube tidak menyediakan subtitle, sistem otomatis beralih ke AI Transkrip.
              </div>
            )}

            <Field label="Bahasa video" hint="Pilih bahasa yang tepat agar transkrip lebih akurat.">
              <select className="input w-72" value={s.language || 'auto'} onChange={(e) => set({ language: e.target.value })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
          </>)}

          {tab === 'clips' && (<>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Jumlah klip maks."><input type="number" min={1} max={60} className="input" value={s.clipCount} onChange={(e) => set({ clipCount: +e.target.value })} /></Field>
              <Field label="Durasi min (detik)"><input type="number" min={3} max={180} className="input" value={s.minLen} onChange={(e) => set({ minLen: +e.target.value })} /></Field>
              <Field label="Durasi maks (detik)"><input type="number" min={5} max={180} className="input" value={s.maxLen} onChange={(e) => set({ maxLen: +e.target.value })} /></Field>
            </div>
            <Field label="Bahasa judul & deskripsi">
              <select className="input w-72" value={s.titleLanguage} onChange={(e) => set({ titleLanguage: e.target.value })}>
                <option value="auto">Sama dengan video</option>{LANGS.filter(([v]) => v !== 'auto').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <div className="h-px bg-line" />
            <div className="label">Default untuk klip baru</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Layout"><Segmented size="md" value={s.defaults.layout} onChange={(v) => setDef({ layout: v })} options={[{ value: 'split', label: 'Split' }, { value: 'fill', label: 'Fill' }, { value: 'fit', label: 'Fit' }]} /></Field>
              <Field label="Gaya caption">
                <select className="input" value={s.defaults.captionStyle} onChange={(e) => setDef({ captionStyle: e.target.value })}>{Object.entries(CAPTION_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
              </Field>
              <Field label={`Posisi caption vertikal: ${s.defaults.captionPos}%`}><input type="range" className="w-full range-fill" style={{ '--p': `${s.defaults.captionPos}%` }} min={10} max={95} value={s.defaults.captionPos} onChange={(e) => setDef({ captionPos: +e.target.value })} /></Field>
              <Field label={`Kata per baris: ${s.defaults.wordsPerLine}`}><input type="range" className="w-full range-fill" style={{ '--p': `${((s.defaults.wordsPerLine - 1) / 4) * 100}%` }} min={1} max={5} value={s.defaults.wordsPerLine} onChange={(e) => setDef({ wordsPerLine: +e.target.value })} /></Field>
              <Field label={`Tinggi webcam (layout Split): ${s.defaults.splitRatio}%`}><input type="range" className="w-full range-fill" style={{ '--p': `${((s.defaults.splitRatio - 25) / 40) * 100}%` }} min={25} max={65} value={s.defaults.splitRatio} onChange={(e) => setDef({ splitRatio: +e.target.value })} /></Field>
              <Field label="Caption"><Check checked={s.defaults.burnCaptions} onChange={(v) => setDef({ burnCaptions: v })} label="Burn-in caption secara default" /></Field>
            </div>
          </>)}

          {tab === 'render' && (<>
            <Field label="Encoder video" hint="Encoder GPU lebih cepat. Bila gagal, otomatis pakai CPU.">
              <div className="grid grid-cols-2 gap-2">
                {[['libx264', 'CPU (x264)', 'Paling kompatibel'], ['h264_nvenc', 'NVIDIA NVENC', 'GPU NVIDIA GTX/RTX'], ['h264_qsv', 'Intel Quick Sync', 'iGPU Intel'], ['h264_amf', 'AMD AMF', 'GPU AMD Radeon']].map(([id, n, d]) => (
                  <button key={id} onClick={() => set({ encoder: id })} className={cx('text-left p-3 rounded-lg border transition', s.encoder === id ? 'border-accent bg-accent/10' : 'border-line hover:border-faint bg-panel2')}>
                    <div className="font-semibold text-fg text-[13px]">{n}</div><div className="text-[11.5px] text-muted">{d}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Kualitas"><Segmented size="md" value={s.quality} onChange={(v) => set({ quality: v })} options={[{ value: 'fast', label: 'Cepat' }, { value: 'balanced', label: 'Seimbang' }, { value: 'high', label: 'Tinggi' }]} /></Field>
            <Field label="Resolusi download maks.">
              <Segmented size="md" value={s.maxHeight} onChange={(v) => set({ maxHeight: v })} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 1440, label: '1440p' }, { value: 2160, label: '4K' }]} />
            </Field>
            <Field label="Folder workspace (project & hasil render)" hint="Hasil render ada di folder project/renders.">
              <div className="flex gap-2"><input className="input font-mono text-[12px]" value={s.workspaceDir} onChange={(e) => set({ workspaceDir: e.target.value })} />
                <button className="btn-soft" onClick={async () => { const d = await call('dialog:pickFolder'); if (d) set({ workspaceDir: d }); }}><FolderOpen size={15} /></button></div>
            </Field>
          </>)}

          {tab === 'look' && (<>
            <Field label="Tema" hint="Ikuti sistem = mengikuti mode terang/gelap Windows.">
              <div className="grid grid-cols-3 gap-2">
                {THEMES.map(([id, n, I]) => (
                  <button key={id} onClick={() => { set({ theme: id }); applyTheme(id); }} className={cx('p-3 rounded-lg border flex flex-col items-center gap-2 transition', (s.theme || 'system') === id ? 'border-accent bg-accent/10' : 'border-line hover:border-faint bg-panel2')}>
                    <div className={cx('w-full h-16 rounded-md border border-line overflow-hidden flex', id === 'dark' ? 'bg-[#121214]' : id === 'light' ? 'bg-[#f2f3f5]' : 'bg-gradient-to-r from-[#f2f3f5] from-50% to-[#121214] to-50%')}>
                      <div className={cx('w-1/4 h-full', id === 'dark' ? 'bg-[#1b1b1e]' : id === 'light' ? 'bg-white' : 'bg-white')} />
                    </div>
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg"><I size={13} />{n}</div>
                  </button>
                ))}
              </div>
            </Field>
          </>)}

          {tab === 'system' && (<>
            <Field label="Cookies YouTube (opsional)" hint="Pakai bila YouTube minta 'Sign in to confirm you're not a bot' atau video dibatasi umur. Tutup browser dulu bila memakai Chrome/Edge.">
              <div className="flex gap-2">
                <select className="input w-48" value={s.cookiesBrowser} onChange={(e) => set({ cookiesBrowser: e.target.value })}>
                  <option value="">Tidak dipakai</option><option value="chrome">Chrome</option><option value="edge">Edge</option><option value="firefox">Firefox</option><option value="brave">Brave</option>
                </select>
                <input className="input font-mono text-[12px]" placeholder="atau file cookies.txt" value={s.cookiesFile} onChange={(e) => set({ cookiesFile: e.target.value })} />
                <button className="btn-soft" onClick={async () => { const f = await call('dialog:pickFile', [{ name: 'cookies', extensions: ['txt'] }]); if (f) set({ cookiesFile: f }); }}><FolderOpen size={15} /></button>
              </div>
            </Field>
            <Field label="Komponen">
              <div className="card bg-panel2 divide-y divide-line">
                {['ffmpeg', 'ffprobe', 'yt-dlp'].map((k) => (
                  <div key={k} className="px-3 py-2.5 flex items-center gap-3">
                    <div className="w-20 font-medium text-fg">{k}</div>
                    <div className="flex-1 text-[12px] text-muted truncate font-mono">{versions ? (versions[k] || '❌ tidak ditemukan') : 'memeriksa…'}</div>
                  </div>
                ))}
              </div>
            </Field>
            <button className="btn-soft" disabled={updating} onClick={async () => { setUpdating(true); try { const r = await call('sys:updateYtdlp'); toast(r.split('\n').pop() || 'yt-dlp diperbarui', 'success'); setVersions(await call('sys:versions')); } catch (e) { toast(e.message, 'error'); } finally { setUpdating(false); } }}>
              {updating ? <Spinner /> : <Download size={15} />}Update yt-dlp
            </button>
            <div className="text-[12px] text-muted">Kalau download YouTube tiba-tiba gagal, biasanya cukup klik <b>Update yt-dlp</b>.</div>
          </>)}
        </div>
      </div>
    </Modal>
  );
}
