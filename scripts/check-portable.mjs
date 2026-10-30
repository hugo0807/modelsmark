#!/usr/bin/env node
/**
 * 构建产物可移植性校验（纯 Node，无需浏览器）。
 *
 * 产物要同时满足三种部署形态，任何一条破了都会让页面「掉样式」或「点子页没反应」：
 *
 *   a) file:// 双击 index.html   —— 协议是文件系统，站点根绝对路径会解析到 C:\_next\
 *   b) 子路径部署（/static-html/<hash>/） —— 站点根绝对路径会跳出挂载前缀
 *   c) 站点根部署（线上）        —— 相对路径同样成立
 *
 * 因此这里断言的是：
 *   1) 所有资源引用（href/src）都必须是相对路径，且解析后真实存在
 *   2) 站内路由链接必须是相对路径 + 指向 index.html，且解析后真实存在
 *   3) 不得残留站点根绝对路径的站内链接（子路径部署下必 404）
 *   4) 必须注入 file:// 兜底运行时（接管点击 + 拦 RSC 预取 + 关客户端路由）
 *   5) webpack publicPath 已从写死的 "/_next/" 改成按脚本地址推导
 *      （否则路由预取的动态 chunk 会打到站点根）
 *
 * 任何一条不满足就退出码 1，让 CI 在部署前失败。
 */

import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.argv[2] || 'out');
const problems = [];

if (!fs.existsSync(OUT_DIR)) {
  console.error(`[check-portable] 产物目录不存在：${OUT_DIR}`);
  process.exit(1);
}

function collectHtml(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

const isExternal = (url) => !url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

const files = collectHtml(OUT_DIR);
let linkCount = 0;

for (const file of files) {
  const rel = path.relative(OUT_DIR, file);
  const pageDir = path.dirname(file);
  const html = fs.readFileSync(file, 'utf8');

  // 1) 资源引用不得再有站点根绝对路径
  const absAsset = html.match(/["'](\/_next\/[^"']*)["']/);
  if (absAsset) {
    problems.push(`${rel}: 资源仍是绝对路径 ${absAsset[1]}（file:// 与子路径下都会 404）`);
  }

  // 2) 必须注入兜底运行时
  if (!html.includes('mm-portable-runtime')) {
    problems.push(`${rel}: 缺少可移植运行时脚本`);
  }

  // 3) 逐条校验 href/src：必须相对，且解析后真实存在
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (isExternal(raw) || raw.startsWith('#')) continue;
    const clean = raw.split('#')[0].split('?')[0];
    if (!clean) continue;
    linkCount++;

    if (clean.startsWith('/')) {
      problems.push(`${rel}: 站内链接是站点根绝对路径 ${raw}（子路径部署下会跳出挂载前缀）`);
      continue;
    }
    // 浏览器取文件时会把 %5B 解码成 [（动态路由 chunk 就长这样），
    // 磁盘上比较也要跟着解码，否则会误判成缺失。
    let decoded = clean;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      /* 非法转义就按原文比较 */
    }
    const target = path.resolve(pageDir, decoded);
    if (!fs.existsSync(target)) {
      problems.push(`${rel}: 链接 ${raw} 解析出的 ${path.relative(OUT_DIR, target)} 不存在`);
    }
  }
}

// 4) webpack publicPath 必须已修正
const chunksDir = path.join(OUT_DIR, '_next', 'static', 'chunks');
if (fs.existsSync(chunksDir)) {
  const runtimes = fs
    .readdirSync(chunksDir)
    .filter((n) => /^webpack-.*\.js$/.test(n))
    .map((n) => path.join(chunksDir, n));
  if (runtimes.length === 0) {
    problems.push('未找到 webpack runtime，产物结构异常');
  }
  for (const f of runtimes) {
    const src = fs.readFileSync(f, 'utf8');
    if (src.includes('r.p="/_next/"')) {
      problems.push(`${path.relative(OUT_DIR, f)}: publicPath 仍是写死的 "/_next/"`);
    }
    if (!src.includes('document.currentScript')) {
      problems.push(`${path.relative(OUT_DIR, f)}: publicPath 未改成按脚本地址推导`);
    }
  }
} else {
  problems.push('未找到 _next/static/chunks，产物结构异常');
}

console.log(`[check-portable] 校验 ${files.length} 个页面、${linkCount} 条站内链接`);
if (problems.length) {
  console.error(`\n❌ 发现 ${problems.length} 个问题：`);
  problems.slice(0, 20).forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log('✅ 产物可移植性校验通过（file:// / 子路径 / 站点根 三种形态均可用）');
