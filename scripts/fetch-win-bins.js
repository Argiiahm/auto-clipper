// Download yt-dlp.exe + ffmpeg (Windows, shared GPL build with libass/NVENC/QSV/AMF) into resources/bin-win
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const out = path.join(__dirname, '..', 'resources', 'bin-win');
fs.mkdirSync(out, { recursive: true });
async function dl(url, file) {
  console.log('↓', url);
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
(async () => {
  await dl('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', path.join(out, 'yt-dlp.exe'));
  const rel = await (await fetch('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest')).json();
  const asset = rel.assets.find((a) => /^ffmpeg-n[\d.]+-latest-win64-gpl-shared-[\d.]+\.zip$/.test(a.name));
  const zip = path.join(out, '_ffmpeg.zip');
  await dl(asset.browser_download_url, zip);
  const tmp = path.join(out, '_ff'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp);
  execSync(`tar -xf "${zip}" -C "${tmp}"`, { stdio: 'inherit' }); // tar.exe ships with Windows 10+
  const root = path.join(tmp, fs.readdirSync(tmp)[0], 'bin');
  for (const f of fs.readdirSync(root)) if (/\.dll$|^ffmpeg\.exe$|^ffprobe\.exe$/i.test(f)) fs.copyFileSync(path.join(root, f), path.join(out, f));
  fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
  console.log('✓ binaries ready in', out);
})().catch((e) => { console.error(e); process.exit(1); });
