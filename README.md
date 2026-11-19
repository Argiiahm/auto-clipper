# AutoClipper (Windows)

Aplikasi desktop Windows untuk memotong video panjang (YouTube, Twitch VOD, dll.) menjadi klip vertikal 9:16 untuk TikTok / Reels / Shorts, lengkap dengan editor manual bergaya CapCut.

**Alur:** Tempel link → 1. Download → 2. Transkrip → 3. Highlight (AI) → 4. Webcam → edit klip → Ekspor.

## Fitur
- **Download** video dari link (yt-dlp, max 1080p, bisa diubah) atau **import video lokal**.
- **Transkrip** per-kata via **Groq Whisper** (gratis) atau **caption YouTube** (tanpa API key).
- **AI Highlights**: LLM mencari momen paling viral → judul, deskripsi, hook & skor 0–100. Video panjang otomatis dipecah agar aman dari limit gratis (auto-retry saat kena rate limit).
- Provider LLM gratis: **Groq** (default `openai/gpt-oss-120b` / `llama-3.3-70b-versatile`), **Google Gemini** (free tier), **OpenRouter** (model `:free`), atau **Custom/Lokal** (Ollama, LM Studio). API key diisi sendiri oleh user di Settings dan disimpan terenkripsi (Windows DPAPI).
- **Editor klip**: urut by time / by score, centang All/None, tambah klip manual, ubah Start/End (± / Playhead), hapus klip, tulis ulang judul dengan AI.
- **Layout**: **Split** (webcam di atas, gameplay di bawah — tandai area webcam secara manual), **Fill** (crop penuh + Focus X), **Fit** (seluruh frame + background blur).
- **Subtitle burn-in** 6 gaya animasi per-kata: **Pop, Neon, Box, Comic, Clean, Focus** + posisi vertikal + jumlah kata per baris. Preview live = hasil render.
- **Thumbnail** 1080×1920 dengan headline (0/120) dari frame mana saja.
- **Editor manual (v1.1)** — tampilan ala CapCut: panel Media/Teks/Audio/Watermark/Adjust di kiri, pemutar di tengah, inspector di kanan, timeline di bawah.
  - **Scene sendiri**: impor video/gambar ke proyek lalu sisipkan di posisi playhead (intro, outro, b-roll). Atur durasi / in-out, Fit (latar blur) atau Fill, suara scene on/off.
  - **Split & hapus** bagian video (Ctrl+B, Delete), trim awal/akhir klip langsung di timeline, Undo/Redo (Ctrl+Z / Ctrl+Y).
  - **Teks overlay** dengan 9 preset gaya, font, warna, outline, kotak latar, bayangan, rotasi, opasitas; geser & ubah ukuran langsung di pemutar.
  - **Overlay gambar** (stiker / logo) dengan posisi, ukuran, rotasi, opasitas, dan waktu tampil.
  - **Watermark** teks atau logo, 9 posisi, berlaku global (bisa dimatikan per klip).
  - **Musik latar** dengan volume musik & suara asli, offset mulai, loop otomatis + fade out.
  - **Adjust**: kecerahan, kontras, saturasi.
  - Hasil ekspor = pratinjau (overlay dirender lewat canvas yang sama, lalu di-overlay oleh ffmpeg).
- **Tema** Terang / Gelap / Ikuti sistem (default: ikuti sistem Windows).
- **Ekspor** berurutan satu per satu, 1080×1920 H.264 MP4 + file .txt (judul & deskripsi). Encoder CPU (x264) atau GPU (NVIDIA NVENC / Intel QSV / AMD AMF) dengan fallback otomatis.

## Instalasi (pengguna)
1. Jalankan `AutoClipper-Setup-1.0.0.exe` → Next → Install (tidak butuh admin).
   - Kalau muncul *Windows protected your PC* (SmartScreen, karena app belum ditandatangani): klik **More info → Run anyway**.
2. Buka AutoClipper → **Settings → AI / API Key** → isi **Groq API key** (gratis di https://console.groq.com/keys) → *Tes koneksi* → **Simpan**.
3. Tempel link YouTube → **Mulai**.

ffmpeg & yt-dlp sudah dibundel. Kalau download YouTube tiba-tiba gagal: **Settings → Sistem → Update yt-dlp**. Kalau YouTube minta "Sign in to confirm you're not a bot": isi **Cookies** (browser / cookies.txt) di tab Sistem.

## Lokasi file
- Project & hasil render: `Dokumen\AutoClipper\projects\<id>\renders\` (bisa diubah di Settings → Render).
- Settings: `%APPDATA%\AutoClipper\settings.json`.

## Limit gratis (perkiraan)
| Provider | Catatan |
|---|---|
| Groq Whisper | ±2 jam audio per jam, ±8 jam per hari |
| Groq LLM (gpt-oss-120b) | 8K token/menit → video 1 jam ≈ 3–5 menit analisa (otomatis menunggu) |
| Gemini Flash | context 1M token, video panjang dianalisa sekali jalan |
| OpenRouter `:free` | 50 request/hari |

## Build dari source (Windows)
```bat
npm install
npm run fetch-bins     :: download yt-dlp.exe + ffmpeg ke resources\bin-win
npm run start          :: jalankan mode development
npm run dist:win       :: buat installer di folder release\
```
Alternatif (dipakai untuk build rilis ini): `npx electron-builder --win --x64 --dir` lalu `makensis build\installer.nsi` → `release\AutoClipper-Setup-<versi>.exe`.
Teknologi: Electron 38 (Node 22 bawaan juga dipakai sebagai JS runtime yt-dlp untuk YouTube), React + Tailwind, ffmpeg + libass, yt-dlp.
