/**
 * 截图脚本：抓取各页面整页截图，用于设计评审
 * 用法：node scripts/screenshot.cjs [baseUrl] [outDir]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3112';
const OUT = process.argv[3] || path.join(process.cwd(), 'screenshots');

const PAGES = [
  { path: '/', name: '01-home', label: '首页 · 概览' },
  { path: '/prices/', name: '02-prices', label: '价格榜' },
  { path: '/benchmarks/', name: '03-benchmarks', label: '能力榜' },
  { path: '/about/', name: '04-about', label: '标准说明' },
  { path: '/models/kimi-k3-1-pro/', name: '05-model-detail', label: '模型详情' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    try {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(600);
      const file = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const kb = (fs.statSync(file).size / 1024).toFixed(0);
      console.log(`✓ ${p.label.padEnd(12)} ${p.path.padEnd(26)} → ${p.name}.png (${kb} KB)`);
    } catch (err) {
      console.error(`✗ ${p.label} ${p.path}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\n输出目录：${OUT}`);
})();
