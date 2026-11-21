const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const store = require('./store');

let server = null;
let serverPort = 0;

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const item of ifaces[name]) {
      if (item.family === 'IPv4' && !item.internal) {
        if (item.address.startsWith('192.168.') || item.address.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(item.address)) {
          return item.address;
        }
      }
    }
  }
  for (const name of Object.keys(ifaces)) {
    for (const item of ifaces[name]) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }
  return '127.0.0.1';
}

function serveMobilePage(res, { title, description, videoUrl, downloadUrl }) {
  const safeTitle = (title || 'Video Clip').replace(/[<>&"]/g, '');
  const safeDesc = (description || '').replace(/[<>&"]/g, '');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${safeTitle} - AutoClipper</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0f1117;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
    }
    .container {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .header {
      text-align: center;
      padding: 8px 0;
    }
    .badge {
      display: inline-block;
      background: #1e293b;
      color: #38bdf8;
      border: 1px solid #334155;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 17px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
    }
    .player-wrap {
      width: 100%;
      aspect-ratio: 9 / 16;
      max-height: 65vh;
      background: #000;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      position: relative;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 12px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-download {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-download:active {
      background: #1d4ed8;
      transform: scale(0.98);
    }
    .btn-copy {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
      font-size: 13px;
      padding: 10px;
    }
    .desc-box {
      background: #181d28;
      border: 1px solid #283143;
      border-radius: 10px;
      padding: 12px;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: #fff;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      display: none;
      z-index: 100;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">AutoClipper Transfer</span>
      <h1>${safeTitle}</h1>
    </div>

    <div class="player-wrap">
      <video src="${videoUrl}" controls playsinline preload="metadata"></video>
    </div>

    <a href="${downloadUrl}" class="btn btn-download" download>
      <span>⬇ Simpan Video ke HP</span>
    </a>

    ${safeDesc ? `
      <div class="desc-box" id="captionText">${safeDesc}</div>
      <button class="btn btn-copy" onclick="copyCaption()">Salin Caption & Hashtag</button>
    ` : ''}
  </div>

  <div id="toast" class="toast">Caption berhasil disalin!</div>

  <script>
    function copyCaption() {
      var el = document.getElementById('captionText');
      if (!el) return;
      var text = el.innerText || el.textContent;
      navigator.clipboard.writeText(text).then(function() {
        var t = document.getElementById('toast');
        t.style.display = 'block';
        setTimeout(function() { t.style.display = 'none'; }, 2000);
      });
    }
  </script>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

function streamVideo(req, res, filePath, download = false, downloadFilename = 'clip.mp4') {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('File tidak ditemukan');
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  if (download) {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFilename)}"`,
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const partialStart = parts[0];
    const partialEnd = parts[1];

    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = (end - start) + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

function startServer() {
  if (server) return Promise.resolve(serverPort);

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const match = u.pathname.match(/^\/(share|video|download)\/([^/]+)\/([^/]+)/);

        if (!match) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          return res.end('AutoClipper Local Sharing Server Aktif');
        }

        const action = match[1];
        const projectId = match[2];
        const renderId = match[3];

        const project = store.loadProject(projectId);
        if (!project) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Proyek tidak ditemukan');
        }

        const renderItem = (project.renders || []).find((r) => r.id === renderId);
        if (!renderItem) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Hasil render tidak ditemukan');
        }

        const fullPath = path.isAbsolute(renderItem.path)
          ? renderItem.path
          : path.join(project.dir, renderItem.path);

        const safeFilename = `${(renderItem.title || 'autoclipper').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;

        if (action === 'share') {
          serveMobilePage(res, {
            title: renderItem.title,
            description: renderItem.description || '',
            videoUrl: `/video/${projectId}/${renderId}`,
            downloadUrl: `/download/${projectId}/${renderId}`,
          });
        } else if (action === 'video') {
          streamVideo(req, res, fullPath, false);
        } else if (action === 'download') {
          streamVideo(req, res, fullPath, true, safeFilename);
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Internal Error: ${err.message}`);
      }
    });

    server.listen(0, '0.0.0.0', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function getQrCode(projectId, renderId) {
  const port = await startServer();
  const ip = getLocalIp();
  const shareUrl = `http://${ip}:${port}/share/${projectId}/${renderId}`;

  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    width: 340,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  const project = store.loadProject(projectId);
  const renderItem = project ? (project.renders || []).find((r) => r.id === renderId) : null;

  return {
    url: shareUrl,
    qrDataUrl,
    ip,
    port,
    title: renderItem ? renderItem.title : 'Klip Video',
  };
}

module.exports = {
  startServer,
  getQrCode,
  getLocalIp,
};
