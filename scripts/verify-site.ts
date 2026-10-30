/**
 * 正式站浏览器验证
 * 检查：零 JS 报错、无死链、表头与数据对齐、矩阵标签不重叠、渠道分组完整
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.join(process.cwd(), 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';

const PAGES = [
  { name: 'index', url: '/' },
  { name: 'channels', url: '/channels' },
  { name: 'plans', url: '/plans' },
  { name: 'calculator', url: '/calculator' },
  { name: 'benchmarks', url: '/benchmarks' },
  { name: 'about', url: '/about' },
  { name: 'model', url: '/models/deepseek-v4-pro' },
  { name: 'model-glm', url: '/models/deepseek-v4-flash' },
];

async function main() {
  // 本地静态服务器必须绕过环境代理（HTTP_PROXY 会把 127.0.0.1 请求转发出去返回 502）
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) {
    delete process.env[k];
    delete process.env[k.toUpperCase()];
  }

  const browser = await chromium.launch({ headless: true });
  const report: any = { pages: [], errors: [], deadLinks: [], alignIssues: [], matrixIssues: [] };

  for (const p of PAGES) {
    const ctx = await browser.newContext({
      proxy: { server: 'http://127.0.0.1:50292', bypass: '127.0.0.1,localhost' },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 1200 },
      locale: 'zh-CN',
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });

    const resp = await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(1200);

    // 死链检查
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).getAttribute('href')!)
    );
    for (const href of [...new Set(links)]) {
      if (!href.startsWith('/')) continue;
      // 静态导出：/plans → /plans.html
      let r = await fetch(BASE + href, { method: 'HEAD' }).catch(() => null);
      if (!r || r.status >= 400) {
        // 静态导出回退：/plans → /plans.html
        const alt = href === '/' ? '/index.html' : `${href}.html`;
        r = await fetch(BASE + alt, { method: 'HEAD' }).catch(() => null);
      }
      if (!r || r.status >= 400) {
        report.deadLinks.push({ page: p.name, href, status: r?.status ?? 'ERR' });
      }
    }

    // 表格列数一致性 + 表头对齐
    const tables = await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('table.data').forEach((tbl, ti) => {
        const rows = [...tbl.querySelectorAll('thead tr')];
        const headCols = rows[0]?.children.length ?? 0;
        const body = [...tbl.querySelectorAll('tbody tr')];
        for (const tr of body) {
          const n = tr.children.length;
          // colSpan 分隔带是 1 个 td 跨多列，属合法结构，跳过
          const isBand = tr.classList.contains('chan-band') || tr.classList.contains('model-band');
          const span = (tr.children[0] as HTMLTableCellElement)?.colSpan ?? 1;
          if (isBand) continue;
          if (n !== headCols && span !== headCols) {
            out.push({ table: ti, headCols, rowCols: n, text: tr.textContent?.slice(0, 50) });
          }
        }
        // 表头右边缘 vs 数据右边缘
        const ths = [...(rows[0]?.children ?? [])] as HTMLElement[];
        const firstBodyRow = body.find(
          (tr) => !tr.classList.contains('chan-band') && tr.children.length === headCols
        );
        if (firstBodyRow) {
          const tds = [...firstBodyRow.children] as HTMLElement[];
          ths.forEach((th, i) => {
            if (i >= tds.length) return;
            const thAl = getComputedStyle(th).textAlign;
            const tdAl = getComputedStyle(tds[i]).textAlign;
            const thR = th.getBoundingClientRect().right;
            const tdR = tds[i].getBoundingClientRect().right;
            if (thAl === 'right' && Math.abs(thR - tdR) > 2) {
              out.push({
                table: ti,
                align: true,
                col: i,
                diff: +(thR - tdR).toFixed(1),
                head: th.textContent?.slice(0, 12),
              });
            }
          });
        }
      });
      return out;
    });
    if (tables.length) report.alignIssues.push({ page: p.name, issues: tables });

    // 矩阵标签重叠检查
    if (p.name === 'index') {
      const matrix = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('.matrix-label')];
        const boxes = labels.map((l) => {
          const b = (l as SVGTextElement).getBBox();
          return {
            text: l.textContent,
            x: b.x,
            y: b.y,
            w: b.width,
            h: b.height,
          };
        });
        const overlaps: any[] = [];
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i];
            const b = boxes[j];
            if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
              overlaps.push({ a: a.text, b: b.text });
            }
          }
        }
        return { count: boxes.length, overlaps };
      });
      report.matrixIssues.push(matrix);
    }

    // 渠道分组检查（模型页）
    if (p.name.startsWith('model')) {
      const groups = await page.evaluate(() =>
        [...document.querySelectorAll('tr.chan-band')].map((tr) =>
          tr.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60)
        )
      );
      report.pages.push({ ...p, status: resp?.status(), errors, groups });
    } else {
      report.pages.push({ ...p, status: resp?.status(), errors });
    }

    if (errors.length) report.errors.push({ page: p.name, errors });

    await page.screenshot({ path: path.join(OUT, `live-${p.name}.png`), fullPage: true });
    await ctx.close();
  }

  console.log('════════ 正式站验证 ════════\n');
  for (const p of report.pages) {
    console.log(`${p.name.padEnd(12)} HTTP ${p.status}  错误 ${p.errors.length}`);
    if (p.groups) console.log(`   渠道分组: ${p.groups.length} 个`);
    for (const g of p.groups ?? []) console.log(`     · ${g}`);
  }
  console.log(`\nJS 错误: ${report.errors.length} 页`);
  console.log(`死链: ${report.deadLinks.length}`);
  for (const d of report.deadLinks.slice(0, 10)) console.log(`  ❌ ${d.page} → ${d.href} (${d.status})`);
  console.log(`对齐问题: ${report.alignIssues.reduce((a, b) => a + b.issues.length, 0)}`);
  for (const a of report.alignIssues) {
    if (a.issues.length) console.log(`  ${a.page}: ${JSON.stringify(a.issues.slice(0, 3))}`);
  }
  console.log(`矩阵标签重叠: ${report.matrixIssues[0]?.overlaps.length ?? 0} / ${report.matrixIssues[0]?.count ?? 0} 个标签`);

  fs.writeFileSync(path.join(OUT, 'live-verify.json'), JSON.stringify(report, null, 2), 'utf8');

  await verifyDeployShapes(browser);
  await browser.close();
}

/**
 * 三种部署形态的回归检查。
 *
 * 背景：静态导出产物最初把资源和路由写成站点根绝对路径
 * （/_next/...、/channels/），只在「站点正好挂在域名根」时成立。
 * 实际有三种形态都会坏：
 *
 *   a) 双击 out/index.html —— file:// 协议，路径被解析成文件系统根；
 *   b) 挂在子路径下（预览面板是 /static-html/<hash>/）——
 *      /channels/ 会跳出挂载前缀，打到站点根 404；
 *   c) 目录式 URL 在部分静态服务器上不解析 index.html。
 *
 * make-portable.mjs 已把两类路径都改成相对 + index.html，
 * 并禁用了 Next 客户端路由（它按自己的 basePath 解析，子路径下必坏）。
 * 这里三种形态逐一验证，守住成果。
 */
async function verifyDeployShapes(browser: any) {
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) {
    console.log('\n[部署形态] 未找到 out/，跳过');
    return;
  }

  console.log('\n════════ 部署形态兼容性 ════════\n');

  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  };

  /** 起一个静态服务器；prefix 非空时只服务该前缀，且只认 index.html */
  const serve = (prefix: string) => (req: any, res: any) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const inPrefix = !prefix || url.startsWith(prefix);
    const rel = inPrefix ? url.slice(prefix.length).replace(/^\/+/, '') : '';
    let file = rel ? path.join(outDir, rel) : '';
    try {
      if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, 'index.html');
      }
    } catch {
      file = '';
    }
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('404');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };

  const rootSrv = http.createServer(serve(''));
  const subSrv = http.createServer(serve('/static-html/testhash'));
  const ROOT_PORT = 3411;
  const SUB_PORT = 3412;

  await new Promise<void>((r) => rootSrv.listen(ROOT_PORT, '127.0.0.1', r));
  await new Promise<void>((r) => subSrv.listen(SUB_PORT, '127.0.0.1', r));

  const idx = path.join(outDir, 'index.html');
  const shapes = [
    { label: '站点根 http://host/', url: `http://127.0.0.1:${ROOT_PORT}/index.html` },
    {
      label: '子路径 http://host/p/',
      url: `http://127.0.0.1:${SUB_PORT}/static-html/testhash/index.html`,
    },
    { label: 'file:// 双击', url: 'file:///' + idx.replace(/\\/g, '/') },
  ];

  let allOk = true;

  for (const shape of shapes) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    const failed: string[] = [];
    page.on('requestfailed', (r: any) => failed.push(r.url().slice(-55)));
    page.on('response', (r: any) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url().slice(-55)}`);
    });
    const consoleErrors: string[] = [];
    page.on('console', (m: any) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 90));
    });

    await page.goto(shape.url, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1800);

    const style = await page.evaluate(() => {
      const v = document.querySelector('.verdicts');
      const vc = v ? getComputedStyle(v) : null;
      return {
        sheets: document.styleSheets.length,
        verdictsDisplay: vc?.display ?? 'none',
        navCount: document.querySelectorAll('.nav a').length,
      };
    });

    // 逐个导航项点一遍，验证每个子页都能打开
    // 断言用「解析后的目标 URL」比对，而不是只看标题 —— 标题相同（比如点首页）
    // 或停在原页都会被错判为通过。
    const navs: string[] = await page.evaluate(() =>
      [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href') as string)
    );
    const navResults: string[] = [];
    let navOpened = 0;
    for (const href of navs) {
      await page.goto(shape.url, { waitUntil: 'load', timeout: 40000 });
      await page.waitForTimeout(900);
      const expected = new URL(href, shape.url);
      await page.click(`.nav a[href="${href}"]`);
      await page.waitForTimeout(1600);
      const r = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        sheets: document.styleSheets.length,
      }));
      const samePath = new URL(r.url).pathname === expected.pathname;
      const landed = samePath && r.title.includes('ModelsMark') && r.sheets > 0;
      if (landed) navOpened++;
      navResults.push(
        `${expected.pathname.replace(/^.*\/out\//, 'out/')} → ${r.title.replace(' — ModelsMark', '')}${landed ? '' : '  ❌未打开'}`
      );
    }

    // 客户端组件交互（表格搜索）
    await page.goto(shape.url, { waitUntil: 'load', timeout: 40000 });
    await page.waitForTimeout(1600);
    const rowsBefore = await page.evaluate(
      () => document.querySelectorAll('table tbody tr').length
    );
    await page.fill('.dt-search', 'Claude');
    await page.waitForTimeout(1000);
    const rowsAfter = await page.evaluate(
      () => document.querySelectorAll('table tbody tr').length
    );

    const ok =
      style.sheets > 0 &&
      style.verdictsDisplay === 'grid' &&
      failed.length === 0 &&
      consoleErrors.length === 0 &&
      navResults.length === 6 &&
      navOpened === navResults.length &&
      rowsAfter < rowsBefore;

    console.log(`[${shape.label}]`);
    console.log(`  样式表 ${style.sheets} 张 | 结论卡 ${style.verdictsDisplay} | 导航 ${style.navCount} 项`);
    console.log(`  失败请求 ${failed.length} | 控制台错误 ${consoleErrors.length}`);
    failed.slice(0, 4).forEach((f) => console.log(`    ❌ ${f}`));
    consoleErrors.slice(0, 4).forEach((e) => console.log(`    ❌ ${e}`));
    navResults.forEach((r) => console.log(`    ${r}`));
    console.log(`  搜索交互: ${rowsBefore} → ${rowsAfter} 行`);
    console.log(ok ? '  ✅ 正常' : '  ❌ 有问题');
    if (!ok) allOk = false;

    await ctx.close();
  }

  rootSrv.close();
  subSrv.close();

  console.log(allOk ? '\n✅ 三种部署形态全部正常' : '\n❌ 存在部署形态问题');
  if (!allOk) process.exitCode = 1;
}

main();
