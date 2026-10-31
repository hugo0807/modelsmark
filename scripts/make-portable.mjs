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
 * 这只在「站点正好挂在域名根」时成立。实际有三种部署形态都会坏：
 *
 *   a) 双击打开 out/index.html —— 协议是 file://，"/_next/..." 被解析成
 *      文件系统根 C:\_next\...，全部 404，页面掉样式 + 交互失效。
 *   b) 挂在子路径下（本地预览面板就是 /static-html/<hash>/）——
 *      "/channels/" 会跳出挂载前缀，打到站点根 404。
 *   c) 目录式 URL（"/channels/"）在部分静态服务器上不解析 index.html，
 *      直接 404。
 *
 * 处置
 * ----
 * 把两类路径都改成「相对当前页面 + 指向 index.html」：
 *
 *   资源：/_next/x  →  ./_next/x  /  ../_next/x  /  ../../_next/x
 *   路由：/channels/ →  channels/index.html  /  ../channels/index.html
 *
 * 相对路径由浏览器按当前页面 URL 解析，因此三种形态全部命中：
 *   - 站点根：https://x.com/channels/ → https://x.com/channels/index.html
 *   - 子路径：https://x.com/p/  → https://x.com/p/channels/index.html
 *   - file://：file:///.../out/channels/index.html
 *
 * 另外注入一段运行时脚本：next/link 的客户端路由按 Next 自己的 basePath
 * 解析 href，相对 href 会被它当成站点根路径而跳转失败，
 * 所以在捕获阶段接管站内点击，改由浏览器做整页跳转
 * （file:// 与子路径部署下，客户端路由本就不可用）。
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
 * 运行时脚本：接管站内链接点击，走浏览器整页跳转。
 *
 * 为什么必须接管：next/link 的客户端路由会把 href 按 Next 自己的
 * basePath 解析，相对 href 会被当成站点根路径，跳到 /channels/ 而 404。
 * 捕获阶段监听 document，早于 React 的冒泡阶段处理器，
 * 因此 next/link 根本看不到这次点击。
 *
 * 同时拦掉 RSC 预取请求 —— 相对路径下 Next 会拼出站点根的
 * index.txt?_rsc=...，全部 404 并刷一屏控制台错误。
 */
function runtimeScript() {
  return `<script ${MARKER}>
(function () {
  var OrigFetch = window.fetch;
  var OrigRequest = window.Request;

  var urlOf = function (input) {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      if (input && typeof input.url === 'string') return input.url;
      if (input && typeof input.href === 'string') return input.href;
    } catch (err) {}
    return '';
  };

  // ── 查询参数继承 ──────────────────────────────────────────────
  //
  // 有些部署入口带鉴权参数（分享链接 ?sharecode=xxx 就是这种）。
  // 站内链接是相对路径，跳转后参数不会自动带上 —— 子页面拿不到凭证，
  // 服务端就返回「链接不完整」。表现是：首页好好的，点任何子页都坏。
  //
  // 所以把当前页面的查询串继承给站内链接。
  var currentSearch = location.search || '';

  /** 给绝对 URL 补上当前页面的查询串（目标本身已有查询串则不动） */
  var withSearch = function (url) {
    if (!currentSearch) return url;
    try {
      var u = new URL(url, location.href);
      if (!u.search) u.search = currentSearch;
      return u.href;
    } catch (err) {
      return url;
    }
  };

  /**
   * 把查询串写进 DOM 里站内链接的 href。
   * 用相对形式拼接，不改路径本身 —— 相对路径是三形态通用的关键，
   * 换成根绝对路径会让 file:// 和子路径部署直接崩。
   */
  var propagateSearch = function () {
    if (!currentSearch) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // 外链协议
      if (href.indexOf('?') >= 0) continue;             // 已有查询串
      var hash = '';
      var base = href;
      var hi = href.indexOf('#');
      if (hi >= 0) { base = href.slice(0, hi); hash = href.slice(hi); }
      var sep = base.indexOf('?') >= 0 ? '&' : '?';
      try {
        var u = new URL(a.href, location.href);
        if (u.origin !== location.origin) continue; // 跨域链接不动
      } catch (err) {
        continue;
      }
      a.setAttribute('href', base + sep + currentSearch.slice(1) + hash);
    }
  };

  // polyfills 的 core-js 用 defineProperty 给 globalThis.fetch 装了 getter，
  // 直接赋值会被静默忽略，必须重定义属性描述符。
  if (OrigRequest) {
    var patchedRequest = function (input, init) {
      if (urlOf(input).indexOf('file:') === 0) {
        return new OrigRequest('http://localhost/__mm_blocked__', init);
      }
      return new OrigRequest(input, init);
    };
    patchedRequest.prototype = OrigRequest.prototype;
    try {
      Object.defineProperty(window, 'Request', {
        value: patchedRequest, writable: true, configurable: true,
      });
    } catch (err) {
      window.Request = patchedRequest;
    }
  }

  if (OrigFetch) {
    var patchedFetch = function (input) {
      var u = urlOf(input);
      // RSC 预取：file:// 下直接拦掉；HTTP 下若请求的是站点根的
      // index.txt/_rsc（子路径部署时必然 404），也拦掉。
      if (u.indexOf('file:') === 0 || /[?&]_rsc=/.test(u)) {
        return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
      }
      return OrigFetch.apply(this, arguments);
    };
    try {
      Object.defineProperty(window, 'fetch', {
        value: patchedFetch, writable: true, configurable: true,
      });
    } catch (err) {
      window.fetch = patchedFetch;
    }
  }

  // 接管站内链接点击：走浏览器原生跳转，不进 Next 的客户端路由。
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest('a[href]');
    if (!a) return;
    if (a.getAttribute('target') === '_blank') return;
    if (a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if (!href) return;
    // 只接管站内链接：相对路径（已改相对）或根绝对路径（SSR 兜底）
    var internal = href.charAt(0) === '/' ? href.charAt(1) !== '/' : !/^[a-z][a-z0-9+.-]*:/i.test(href);
    if (!internal) return;
    e.preventDefault();
    e.stopPropagation();
    var url = new URL(a.href, location.href);
    // 目录式 URL 在部分服务器不解析 index.html，统一补上
    if (!/\\.[a-z0-9]+$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\\/*$/, '/') + 'index.html';
    }
    location.href = withSearch(url.href);
  }, true);

  // 把查询串写回站内链接的 href —— 这样「右键复制链接 / 新标签打开 /
  // 中键」也带着凭证，而不只是左键点击这一条路径。
  //
  // React 渲染和 hydration 会重写 href，所以要持续观察 DOM 变化。
  var pending = false;
  var schedule = function () {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      propagateSearch();
    }, 60);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  // 把 Next 客户端路由改成硬导航。
  //
  // 客户端路由按 Next 自己的 basePath 解析 URL，产物挂在子路径下时
  // （预览面板就是 /static-html/<hash>/），它会把资源和 RSC 载荷
  // 请求打到站点根 —— 全部 404，页面跳过去也是坏的。
  // 静态导出本来就是整页加载的产物，硬导航反而更稳。
  var disableClientRouter = function () {
    var r = window.next && window.next.router;
    if (!r) return false;
    var toHref = function (url) {
      var u = new URL(String(url), location.href);
      if (!/\\.[a-z0-9]+$/i.test(u.pathname)) {
        u.pathname = u.pathname.replace(/\\/*$/, '/') + 'index.html';
      }
      return withSearch(u.href);
    };
    r.push = function (url) { location.href = toHref(url); return Promise.resolve(true); };
    r.replace = function (url) { location.href = toHref(url); return Promise.resolve(true); };
    r.prefetch = function () { return Promise.resolve(); };
    return true;
  };

  if (!disableClientRouter()) {
    // Next 的 router 在 chunk 执行时才挂到 window.next.router，
    // 这里轮询等它出现（最多 3 秒）。
    var tries = 0;
    var timer = setInterval(function () {
      if (disableClientRouter() || ++tries > 300) clearInterval(timer);
    }, 10);
  }
})();
${MARKER_END}</script>`;
}

/**
 * 把 "/_next/..." 资源引用改成相对路径。
 * 只改紧跟在引号后的 /_next/，避免误伤正文里的文字。
 */
function relativizeAssets(html, prefix) {
  return html.replace(/(["'])(\/_next\/)/g, (_m, q) => `${q}${prefix}_next/`);
}

/**
 * 把站内路由链接改成相对路径 + index.html。
 *
 *   /channels/            → channels/index.html     （深度 0）
 *   /channels/            → ../channels/index.html  （深度 1）
 *   /models/xxx/          → ../../models/xxx/index.html（深度 2）
 *
 * 同时要改 React 组件里 next/link 的 href —— 它们以 props 形式内联在
 * flight 数据里，格式是 "href":"/channels/"，不是 HTML 属性。
 */
function relativizeRoutes(html, prefix) {
  // 把 "/channels/" 变成相对路径 + index.html。
  // prefix 已带结尾斜杠，这里拼上后要去掉多余的那个。
  const build = (path, query, hash) => {
    const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
    const target = `${prefix}${clean}/index.html`.replace(/\/{2,}/g, '/');
    return `${target}${query || ''}${hash || ''}`;
  };

  // HTML 属性形式：href="/channels/"
  html = html.replace(/href="(\/(?!\/_next\/)([^"#?]*))(\?[^"#]*)?(#[^"]*)?"/g, (m, path, _rest, query, hash) => {
    return `href="${build(path, query, hash)}"`;
  });

  // flight 数据里的 props 形式："href":"/channels/"
  html = html.replace(/\\"href\\":\\"(\/(?!\/_next\/)([^"\\]*?))(\?[^"\\]*)?(\\#[^"\\]*)?\\"/g, (m, path, _rest, query, hash) => {
    return `\\"href\\":\\"${build(path, query, hash)}\\"`;
  });

  return html;
}

/**
 * 修正 webpack 的 publicPath。
 *
 * Next 的 webpack runtime 里写死了 r.p="/_next/"。路由预取时会用它拼出
 * 动态 chunk 的地址（脚本栈里就是 r.f.j → r.l → 请求
 * /_next/static/chunks/app/layout-xxx.js），产物一旦挂在子路径下
 * 这些请求就全部打到站点根，404 满屏。
 *
 * 这个文件是所有页面共用的，没法按页面深度改相对路径；改成运行时从
 * 「当前正在执行的脚本地址」反推 —— 那个地址一定带着真实的挂载前缀。
 */
const PUBLIC_PATH_MARK = 'document.currentScript&&document.currentScript.src';
const PUBLIC_PATH_PATCH =
  'r.p=(function(){try{var s=document.currentScript&&document.currentScript.src;' +
  'if(s){var i=s.indexOf("/_next/static/chunks/");if(i>=0)return s.slice(0,i+7);}}' +
  'catch(e){}return "/_next/";})()';

function patchWebpackPublicPath() {
  const chunksDir = path.join(OUT_DIR, '_next', 'static', 'chunks');
  if (!fs.existsSync(chunksDir)) return 0;

  let patched = 0;
  for (const name of fs.readdirSync(chunksDir)) {
    if (!/^webpack-.*\.js$/.test(name)) continue;
    const file = path.join(chunksDir, name);
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes(PUBLIC_PATH_MARK)) continue; // 已处理过，保持幂等
    const next = src.replace(/r\.p="\/_next\/"/g, PUBLIC_PATH_PATCH);
    if (next !== src) {
      fs.writeFileSync(file, next, 'utf8');
      patched++;
    }
  }
  return patched;
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error(`[make-portable] 产物目录不存在：${OUT_DIR}`);
    process.exit(1);
  }

  const files = collectHtml(OUT_DIR);
  let assetHits = 0;
  let routeHits = 0;
  let injected = 0;

  for (const file of files) {
    const depth = depthOf(file);
    const prefix = prefixOf(depth);
    let html = fs.readFileSync(file, 'utf8');

    const before = html;
    html = relativizeAssets(html, prefix);
    html = relativizeRoutes(html, prefix);
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
    const script = runtimeScript();
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${script}</head>`);
    } else {
      html = script + html;
    }
    injected++;

    fs.writeFileSync(file, html, 'utf8');
  }

  const wpPatched = patchWebpackPublicPath();

  console.log(
    `[make-portable] 处理 ${files.length} 个页面：路径改相对 ${assetHits} 个，注入运行时 ${injected} 个，修正 publicPath ${wpPatched} 个`
  );
}

main();
