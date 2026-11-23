'use strict';

// 财算坊财务工具箱 - Node.js 20 服务端
// 功能：托管静态站点 + 记录访问日志（IP/UA/路径）+ 提供后台管理 API
// 仅使用 Node.js 20 内置模块，无外部依赖

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT || 8000);

// 后台密码（可用环境变量 ADMIN_PASSWORD 覆盖）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'caishuanfang';
const TOKEN = crypto.createHash('sha256')
  .update('finance-tools-admin:' + ADMIN_PASSWORD)
  .digest('hex');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_LOGS = 1000;

let logs = [];
let seq = 0;

// ---------- 日志持久化（尽力而为，写入 TMPDIR） ----------
const TMP_ROOT = process.env.TMPDIR || '/tmp';
const LOG_DIR = path.join(TMP_ROOT, 'finance-tools');
const LOG_FILE = path.join(LOG_DIR, 'access-logs.json');

function loadLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const arr = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
      if (Array.isArray(arr)) {
        logs = arr.slice(-MAX_LOGS);
        seq = logs.reduce((m, e) => Math.max(m, e.i || 0), 0);
      }
    }
  } catch (e) {
    // 文件缺失或损坏时从空日志开始
  }
}

function saveLogs() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-MAX_LOGS)), 'utf8');
  } catch (e) {
    // 临时目录不可写时仅保留内存日志
  }
}

// ---------- 工具函数 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function safeEqual(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveFile(res, relPath) {
  const file = path.join(PUBLIC_DIR, relPath);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

function serveStatic(req, res, pathname) {
  let p;
  try {
    p = decodeURIComponent(pathname);
  } catch (e) {
    p = pathname;
  }
  if (p === '/') p = '/index.html';
  if (p.indexOf('..') !== -1) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(res, p);
}

// ---------- 请求处理 ----------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  const ip = clientIp(req);

  res.on('finish', () => {
    seq += 1;
    logs.push({
      i: seq,
      t: Date.now(),
      ip: ip,
      m: req.method,
      p: pathname + (u.search || ''),
      s: res.statusCode,
      ua: String(req.headers['user-agent'] || '').slice(0, 200),
      ref: String(req.headers['referer'] || '').slice(0, 300),
    });
    if (logs.length > MAX_LOGS * 2) logs = logs.slice(-MAX_LOGS);
    if (seq % 20 === 0) saveLogs();
  });

  // 后台 API（token 校验）
  if (pathname === '/api/stats' || pathname === '/api/logs') {
    const token = u.searchParams.get('token') || '';
    if (!safeEqual(token, TOKEN)) {
      sendJson(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    if (pathname === '/api/stats') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const ips = new Set();
      for (const e of logs) if (e.ip) ips.add(e.ip);
      const today = logs.filter((e) => e.t >= todayStart).length;
      sendJson(res, 200, {
        ok: true,
        stats: { total: logs.length, uniqueIps: ips.size, today: today, maxLogs: MAX_LOGS },
      });
    } else {
      const limit = Math.min(parseInt(u.searchParams.get('limit') || '200', 10) || 200, 500);
      const offset = Math.max(parseInt(u.searchParams.get('offset') || '0', 10) || 0, 0);
      const end = logs.length - offset;
      const start = Math.max(0, end - limit);
      sendJson(res, 200, { ok: true, logs: logs.slice(start, end), total: logs.length });
    }
    return;
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    serveFile(res, 'admin.html');
    return;
  }

  serveStatic(req, res, pathname);
});

server.on('error', (err) => {
  console.error('server error:', err);
  process.exit(1);
});

loadLogs();
setInterval(saveLogs, 60000).unref();
process.on('SIGTERM', () => { saveLogs(); process.exit(0); });
process.on('SIGINT', () => { saveLogs(); process.exit(0); });

server.listen(PORT, HOST, () => {
  console.log('finance-tools server listening on ' + HOST + ':' + PORT);
});
