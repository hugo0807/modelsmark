/**
 * 从 Artificial Analysis 抓取模型智能指数，扩充 data/seeds/intelligence.json
 *
 * 铁律：只写入页面实际读到的数值，解析不到就跳过，绝不推算或编造。
 *
 * AA 的 models 页用 div 网格（非 table）展示榜单，每张榜单的结构固定为：
 *   <标题行>
 *   N of M models
 *   [模型名 × N]
 *   [数值   × N]
 * 因此最可靠的解析方式是按 body 可见文本的行顺序切分，
 * 找到 "Artificial Analysis Intelligence Index" 标题 → 其后的 "N of M models" 行
 * → 之后的 N 行模型名 → 再之后的 N 行数值。
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const URL = 'https://artificialanalysis.ai/models';
const HEADING = 'Artificial Analysis Intelligence Index';
const TITLE_RE = /^(\d+) of (\d+) models$/;

interface Raw {
  name: string;
  index: number;
  rank: number;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1800, height: 1200 },
  });
  const page = await ctx.newPage();

  console.log('打开', URL);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(400);
  }

  const bodyText = await page.locator('body').innerText();
  fs.writeFileSync(path.join(ROOT, '.probe', 'aa_body.txt'), bodyText, 'utf8');
  const lines = bodyText.split('\n').map((l) => l.trim());

  const records: Raw[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(HEADING)) continue;
    // 跳过说明性文字（"…v5.0 incorporates 9 evaluations…"）
    // 找下一行的 "N of M models"
    let j = i + 1;
    let count = 0;
    while (j < lines.length && j < i + 8) {
      const m = lines[j].match(TITLE_RE);
      if (m) {
        count = Number(m[1]);
        break;
      }
      j++;
    }
    if (!count || j >= lines.length) continue;

    // 模型名段：从 j+1 起，跳过 "Add model from specific provider" / "No publicly available API"
    const names: string[] = [];
    let k = j + 1;
    while (k < lines.length && names.length < count) {
      const l = lines[k];
      if (!l || /^(Add model from|No publicly available)/.test(l)) {
        k++;
        continue;
      }
      // 模型名不含纯数字（避免把数值行当模型名）
      if (/^\d+$/.test(l)) break;
      names.push(l);
      k++;
    }
    if (names.length < count) continue;

    // 数值段：紧接其后的 count 个纯数字行
    const values: number[] = [];
    let m2 = k;
    while (m2 < lines.length && values.length < count) {
      const l = lines[m2];
      if (/^\d{1,3}$/.test(l)) values.push(Number(l));
      else if (l && !/^\$/.test(l)) break;
      m2++;
    }
    if (values.length < count) continue;

    // 校验：榜单按指数降序（允许并列）
    let desc = true;
    for (let x = 1; x < values.length; x++) if (values[x] > values[x - 1]) desc = false;
    if (!desc) continue;

    for (let x = 0; x < count; x++) {
      if (seen.has(names[x])) continue;
      seen.add(names[x]);
      records.push({ name: names[x], index: values[x], rank: x + 1 });
    }
  }

  console.log('\n解析到模型数:', records.length);
  records.forEach((r) => console.log('  ', String(r.index).padStart(3), r.name));

  fs.writeFileSync(
    path.join(ROOT, '.probe', 'aa_intelligence.json'),
    JSON.stringify(records, null, 2),
    'utf8'
  );
  await browser.close();
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
