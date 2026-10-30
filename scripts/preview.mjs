#!/usr/bin/env node
/**
 * 本地预览静态产物。
 *
 * 为什么需要它
 * ------------
 * 静态导出产物用浏览器直接双击打开也能看（见 make-portable.mjs），
 * 但 file:// 下 Next 的客户端路由无法拉取 RSC 载荷，只能整页跳转，
 * 体验和线上有差别。
 *
 * 用法：
 *   npm run build     # 先构建
 *   npm run preview   # 再预览，默认 http://127.0.0.1:4173
 *   npm run preview -- 8080
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const PORT = Number(process.argv[2]) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(OUT)) {
  console.error('[preview] 未找到产物目录 out/，请先执行：npm run build');
  process.exit(1);
}

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\/+/, '');
  const target = path.join(OUT, rel);

  // 防目录穿越
  if (!target.startsWith(OUT)) return null;

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const idx = path.join(target, 'index.html');
    if (fs.existsSync(idx)) return idx;
    return null;
  }
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;

  // 目录式 URL 兜底：/channels/ -> channels/index.html
  const withSlash = path.join(target, 'index.html');
  if (fs.existsSync(withSlash)) return withSlash;

  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url || '/');
  if (!file) {
    const notFound = path.join(OUT, '404.html');
    if (fs.existsSync(notFound)) {
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      fs.createReadStream(notFound).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[preview] 静态产物已启动：http://127.0.0.1:${PORT}`);
  console.log('[preview] 按 Ctrl+C 停止');
});
