/**
 * 线上巡检：直接打生产域名，验证样式、导航、搜索、二级页、失败请求。
 *
 * 用法：
 *   node scripts/verify-live.cjs [url] [--proxy=http://127.0.0.1:PORT]
 *
 * 默认不带代理（国内直连）。若本机需要走代理，加 --proxy 参数。
 *
 * 关键点（踩过的坑）：
 *   计算目标 URL 的基准必须是「当前所在页」，不能在 goto 之前用
 *   上一次循环留下的落地页 —— 相对链接会解析到上一级目录，
 *   断言会从第 3 项起全部错位，看起来像站点坏了，其实是脚本错了。
 */
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const proxyArg = args.find((a) => a.startsWith('--proxy='));
const BASE = args.find((a) => !a.startsWith('--')) || 'https://modelsmark.app.workbuddy.host/?sharecode=B446I2BLWQ';

if (!proxyArg) {
  for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete process.env[k];
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...(proxyArg ? { proxy: { server: proxyArg.slice(8), bypass: '127.0.0.1,localhost' } } : {}),
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const failed = [];
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText || 'FAIL'} ${r.url().slice(-55)}`));
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url().slice(-55)}`));
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 110)));
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 110)));

  const resp = await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);

  const style = await page.evaluate(() => {
    const v = document.querySelector('.verdicts');
    return {
      sheets: document.styleSheets.length,
      display: v ? getComputedStyle(v).display : 'none',
      nav: document.querySelectorAll('.nav a').length,
      cards: document.querySelectorAll('.verdicts > *').length,
      rows: document.querySelectorAll('table tbody tr').length,
    };
  });
  console.log(`目标 ${BASE}`);
  console.log(`HTTP ${resp.status()} | 样式表 ${style.sheets} 张 | 结论卡 ${style.display} | 卡片 ${style.cards} | 导航 ${style.nav} | 表格 ${style.rows} 行`);
  console.log(`标题：${await page.title()}`);

  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('.nav a')].map((a) => a.getAttribute('href'))
  );
  let ok = 0;
  for (const h of hrefs) {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    // 基准必须是「当前所在页」，不能是上一次的落地页
    const expected = new URL(h, page.url());
    await page.click(`.nav a[href="${h}"]`);
    await page.waitForTimeout(1800);
    const u = new URL(page.url());
    const title = await page.title();
    const sheets = await page.evaluate(() => document.styleSheets.length);
    const good = u.pathname === expected.pathname && title.includes('ModelsMark') && sheets > 0;
    if (good) ok++;
    console.log(`  ${good ? '✅' : '❌'} ${h} → ${u.pathname} | ${title.replace(' — ModelsMark', '')} | 样式表 ${sheets}`);
  }

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  await page.fill('.dt-search', 'DeepSeek');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
  console.log(`搜索交互: ${before} → ${after} 行`);

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('a[href*="models/"]');
  await page.waitForTimeout(2000);
  const d = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.slice(0, 30) ?? '',
    sheets: document.styleSheets.length,
    bars: document.querySelectorAll('[class*="bar"]').length,
  }));
  console.log(`二级页: ${d.url}\n  ${d.title} | H1「${d.h1}」| 样式表 ${d.sheets} | 柱图 ${d.bars}`);

  console.log(`\n导航 ${ok}/${hrefs.length} | 失败请求 ${failed.length} | 控制台错误 ${errs.length}`);
  if (failed.length) console.log('失败：\n' + failed.slice(0, 8).join('\n'));
  if (errs.length) console.log('错误：\n' + errs.slice(0, 8).join('\n'));

  const pass =
    ok === hrefs.length &&
    failed.length === 0 &&
    errs.length === 0 &&
    style.display === 'grid' &&
    style.sheets > 0 &&
    after < before;
  console.log(pass ? '\n✅ 线上全部正常' : '\n❌ 线上仍有问题');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
