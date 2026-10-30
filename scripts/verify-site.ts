/**
 * 正式站浏览器验证
 * 检查：零 JS 报错、无死链、表头与数据对齐、矩阵标签不重叠、渠道分组完整
 */
import fs from 'node:fs';
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

  await browser.close();

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
}

main();
