#!/usr/bin/env node
/**
 * 静态导出产物「可移植化」后处理。
 *
 * 问题
 * ----
 * Next.js 的 output:'export' 产物里，资源与路由都写成站点根绝对路径：
 *     <link href="/_next/static/css/xxx.css">
 *     <script src="/_next/static/chunks/app/page-xxx.js">
 *     <a href="/channels/">
 *
 * 这在 HTTP 部署下完全正确（站点挂在域名根）。但直接双击打开
 * out/index.html 时，浏览器协议是 file://，"/_next/..." 会被解析成
 * 文件系统根 C:\_next\...，全部 404 —— 页面掉样式、交互失效。
 *
 * 处置
 * ----
 * 1) 资源路径改相对：按每个页面所在目录的深度，把 "/_next/" 换成
 *    "./_next/" 或 "../../_next/"。同一份产物既能挂站点根，也能放
 *    任意子目录（比如 GitHub Pages 的 /仓库名/），双击打开也能用。
 *
 * 2) 路由链接保持绝对路径不动（部署期语义不变，CI 断言也不受影响），
 *    改在运行时兜底：file:// 下 Chrome 不会把目录 URL 自动解析成
 *    index.html，所以注入一段小脚本，在 file:// 下拦截站内链接点击，
 *    把 "/channels/" 换算成相对路径 + index.html 后做整页跳转。
 *
 * 说明
 * ----
 * 站点链接在 HTTP 下仍由 next/link 走客户端路由；file:// 下没有
 * 可用的 RSC 拉取通道（file:// 无法 fetch），所以只能整页跳转 ——
 * 这也是 file:// 下唯一可行的方式。
 */

import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.argv[2] || 'out');
const MARKER = 'id="mm-portable-runtime"';
/** 注入块的结束标记，用于把上一轮注入的内容整块替换掉（保证脚本可重复执行） */
const MARKER_END = '/*mm-portable-end*/';

/** 递归收集所有 html */
function collectHtml(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

/**
 * 页面所在目录相对于产物根的深度。
 * out/index.html          -> 0
 * out/channels/index.html -> 1
 * out/models/xxx/index.html -> 2
 */
function depthOf(file) {
  const rel = path.relative(OUT_DIR, path.dirname(file));
  return rel ? rel.split(path.sep).filter(Boolean).length : 0;
}

/** 该深度下的相对前缀 */
function prefixOf(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

/**
 * file:// 下的链接兜底脚本。
 *
 * 只在 file:// 下介入（HTTP 下原样返回，部署行为零变化）。
 * 捕获阶段监听 document，早于 React 的冒泡阶段处理器，
 * 因此 next/link 的客户端路由不会接手这次点击。
 */
function runtimeScript(depth) {
  return `<script ${MARKER}>
(function () {
  if (location.protocol !== 'file:') return;
  var BASE = ${JSON.stringify(prefixOf(depth))};

  // Next 的 <Link> 会在链接进入视口时预取 RSC 载荷（index.txt?_rsc=...）。
  // file:// 下浏览器不允许 fetch 本地文件，会刷一屏控制台错误。
  //
  // 注意两个坑：
  //  1) Next 的 chunk 传的是 URL 对象而不是字符串，
  //     取地址要同时认字符串 / URL / Request 三种形态。
  //  2) polyfills 里的 core-js 用 defineProperty 给 globalThis.fetch 装了
  //     一个 getter（每次读取都返回原始实现），直接赋值会被静默忽略。
  //     必须先拿到属性描述符再重定义。
  var urlOf = function (input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return input.url;
      if (input && typeof input.href === 'string') return input.href;
    } catch (err) {}
    return '';
  };

  var OrigFetch = window.fetch;
  var OrigRequest = window.Request;

  if (OrigRequest) {
    var patchedRequest = function (input, init) {
      if (urlOf(input).indexOf('file:') === 0) {
        // 换成无害的 http URL，让后续的 fetch 分支识别不到 file 协议
        return new OrigRequest('http://localhost/__mm_blocked__', init);
      }
      return new OrigRequest(input, init);
    };
    patchedRequest.prototype = OrigRequest.prototype;
    try {
      Object.defineProperty(window, 'Request', {
        value: patchedRequest,
        writable: true,
        configurable: true,
      });
    } catch (err) {
      window.Request = patchedRequest;
    }
  }

  if (OrigFetch) {
    var patchedFetch = function (input) {
      if (urlOf(input).indexOf('file:') === 0) {
        return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
      }
      return OrigFetch.apply(this, arguments);
    };
    try {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch,
        writable: true,
        configurable: true,
      });
    } catch (err) {
      window.fetch = patchedFetch;
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/' || href.charAt(1) === '/') return;
    if (a.getAttribute('target') === '_blank') return;
    var query = '', hash = '';
    var qi = href.indexOf('?');
    if (qi >= 0) { query = href.slice(qi); href = href.slice(0, qi); }
    var hi = href.indexOf('#');
    if (hi >= 0) { hash = href.slice(hi); href = href.slice(0, hi); }
    var target = BASE + href.replace(/^\\/+/, '');
    if (!/\\.html?$/i.test(target)) target += 'index.html';
    e.preventDefault();
    e.stopPropagation();
    location.href = target + query + hash;
  }, true);
})();
${MARKER_END}</script>`;
}

/** 把 "/_next/" 资源路径改成相对路径 */
function relativizeAssets(html, prefix) {
  // 只改紧跟在引号后的 /_next/，避免误伤正文里的文字
  return html.replace(/(["'])(\/_next\/)/g, (_m, q) => `${q}${prefix}_next/`);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`[make-portable] 产物目录不存在：${OUT_DIR}`);
    process.exit(1);
  }

  const files = collectHtml(OUT_DIR);
  let assetHits = 0;
  let injected = 0;

  for (const file of files) {
    const depth = depthOf(file);
    const prefix = prefixOf(depth);
    let html = fs.readFileSync(file, 'utf8');

    const before = html;
    html = relativizeAssets(html, prefix);
    if (html !== before) assetHits++;

    // 先移除上一轮注入的块（脚本可重复执行），再注入当前版本
    if (html.includes(MARKER)) {
      const start = html.indexOf(`<script ${MARKER}>`);
      const endTag = html.indexOf(MARKER_END, start);
      if (start >= 0 && endTag > start) {
        const closeIdx = html.indexOf('</script>', endTag);
        if (closeIdx > 0) {
          html = html.slice(0, start) + html.slice(closeIdx + '</script>'.length);
        }
      }
    }

    // 放在 </head> 前：早于 body 渲染，也早于 React hydration
    const script = runtimeScript(depth);
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${script}</head>`);
    } else {
      html = script + html;
    }
    injected++;

    fs.writeFileSync(file, html, 'utf8');
  }

  console.log(
    `[make-portable] 处理 ${files.length} 个页面：资源改相对 ${assetHits} 个，注入 file:// 兜底 ${injected} 个`
  );
}

main();
