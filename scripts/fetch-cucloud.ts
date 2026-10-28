/**
 * 抓取联通云（cucloud）官方定价数据：
 *   1. 计费调整公告（含模型按量价与峰谷定价）—— www.cucloud.cn/announcement-news.html?id=464
 *   2. Token Plan 套餐页（个人版 tokens 档 + 团队版 credits 档）
 *
 * 铁律：只写入页面实际读到的数值。
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const PROBE = path.join(ROOT, '.probe');

const PAGES: { key: string; url: string }[] = [
  { key: 'cu_announce_464', url: 'https://www.cucloud.cn/announcement-news.html?id=464' },
  { key: 'cu_announce_list', url: 'https://www.cucloud.cn/announcement-news.html' },
  { key: 'cu_tokenplan', url: 'https://www.cucloud.cn/product/tokenplan.html' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1600, height: 1000 },
  });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    console.log('\n══════', p.url);
    try {
      const resp = await page.goto(p.url, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      console.log('  HTTP', resp?.status());
      await page.waitForTimeout(3500);
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel(0, 1800);
        await page.waitForTimeout(400);
      }
      const text = (await page.locator('body').innerText()).replace(/[ \t]+/g, ' ');
      fs.writeFileSync(path.join(PROBE, `${p.key}.txt`), text, 'utf8');
      fs.writeFileSync(path.join(PROBE, `${p.key}.html`), await page.content(), 'utf8');
      console.log('  文本长度', text.length);

      // 打印含计费关键词的片段
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.forEach((l, i) => {
        if (/元\/百万|元\/千|输入|输出|缓存|峰谷|高峰|空闲|计费|模型|tokens/i.test(l)) {
          console.log(`  ${String(i).padStart(3)} ${l.slice(0, 140)}`);
        }
      });
    } catch (e) {
      console.log('  失败:', String(e).slice(0, 140));
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
