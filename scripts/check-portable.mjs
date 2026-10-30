#!/usr/bin/env node
/**
 * 构建产物可移植性校验（纯 Node，无需浏览器）。
 *
 * 守住两条线：
 *   1) file:// 直接双击打开必须可用 —— 资源路径必须是相对的，
 *      且页面里要注入了 file:// 链接兜底脚本。
 *   2) 线上部署语义不能被改坏 —— 站内路由链接必须仍是绝对路径
 *      （相对路径在子路径部署下会 404，CI 的模型链接断言也依赖它）。
 *
 * 任何一条不满足就退出码 1，让 CI 直接失败。
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

const files = collectHtml(OUT_DIR);
let checked = 0;

for (const file of files) {
  const rel = path.relative(OUT_DIR, file);
  const html = fs.readFileSync(file, 'utf8');
  checked++;

  // 1) 资源引用不得再有站点根绝对路径
  const absAsset = html.match(/["'](\/_next\/[^"']*)["']/);
  if (absAsset) {
    problems.push(`${rel}: 资源仍是绝对路径 ${absAsset[1]}（file:// 下会 404）`);
  }

  // 2) 必须有 file:// 兜底脚本
  if (!html.includes('mm-portable-runtime')) {
    problems.push(`${rel}: 缺少 file:// 链接兜底脚本`);
  }

  // 3) 站内路由链接必须保持绝对路径
  const absRoute = html.match(/href="(\/(?:channels|plans|calculator|benchmarks|about|models)[^"]*)"/);
  if (!absRoute) {
    problems.push(`${rel}: 未找到绝对路径的站内路由链接`);
  }
}

// 4) 站内链接目标必须真实存在
const indexHtml = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');
const routes = [...new Set([...indexHtml.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]))];
for (const route of routes) {
  if (route.startsWith('/_next/')) continue;
  const target =
    route === '/'
      ? path.join(OUT_DIR, 'index.html')
      : path.join(OUT_DIR, route.replace(/^\//, ''), 'index.html');
  if (!fs.existsSync(target)) {
    problems.push(`index.html: 站内链接 ${route} 没有对应产物`);
  }
}

console.log(`[check-portable] 校验 ${checked} 个页面，站内链接 ${routes.length} 条`);
if (problems.length) {
  console.error(`\n❌ 发现 ${problems.length} 个问题：`);
  problems.slice(0, 20).forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log('✅ 产物可移植性校验通过（file:// 可用 + 部署语义完好）');
