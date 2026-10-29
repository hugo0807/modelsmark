/**
 * 抓取 Artificial Analysis 的 LLM Leaderboard 全量表格，落盘为入库快照。
 *
 * 为什么抓 /leaderboards/models 而不是 /models：
 * /models 的图表默认只渲染 28 条（「28 of 715 models」），且条数下拉框
 * 实际是「添加模型」的搜索框，无法一次性展开到全量；
 * /leaderboards/models 是一次性渲染的榜单表格，实测 272 行，
 * 同时给出智能指数、每任务成本、输出速度、上下文窗口等字段。
 *
 * 产出 data/snapshots/aa_leaderboard.json —— 与官方定价页快照一样入库，
 * CI 定时任务不现场抓 AA，保证每次构建用的是同一份可核对的证据。
 *
 * 用法：npx tsx scripts/fetch-aa-leaderboard.ts
 */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data/snapshots');
const OUT_FILE = path.join(OUT_DIR, 'aa_leaderboard.json');
const URL = 'https://artificialanalysis.ai/leaderboards/models';

/** 表格列下标（表头前 8 个是分组单元格，数据列从第 8 个开始对齐） */
const COL = {
  MODEL: 0,
  CONTEXT: 1,
  CREATOR: 2,
  LICENSE: 3,
  INDEX: 4,
  COST_PER_TASK: 41,
  INPUT_USD: 42,
  OUTPUT_USD: 43,
  OUTPUT_TOKENS_PER_SEC: 46,
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0.0.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1900, height: 1400 },
  });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(6000);

  // 展开所有列，避免只拿到默认展示的 3 列
  const expand = page.getByText('Expand columns', { exact: false }).first();
  if (await expand.count()) {
    await expand.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  const head = (await page.locator('table thead th').allInnerTexts()).map((h) =>
    h.replace(/\s+/g, ' ').trim()
  );

  const rows: string[][] = [];
  const trs = page.locator('table tbody tr');
  const n = await trs.count();
  for (let i = 0; i < n; i++) {
    const cells = await trs.nth(i).locator('td,th').allInnerTexts();
    rows.push(cells.map((c) => c.replace(/\s+/g, ' ').trim()));
  }

  const withIndex = rows.filter((r) => /^\d{1,3}$/.test(String(r[COL.INDEX] ?? '').trim()));
  console.log(`表头 ${head.length} 列，数据 ${rows.length} 行，其中 ${withIndex.length} 行有智能指数`);

  /*
   * 只保留下游真正用到的列。
   * 全表 68 列里绝大多数是细分评测（AA-Briefcase / GDPval / HLE…），
   * 本站点只用「综合智能指数 / 每任务成本 / 输出速度 / 官方美元价」几项，
   * 全量入库会让快照变成几百 KB 的噪声，且容易把未核对的数字带进页面。
   */
  const slim = rows.map((r) => ({
    name: r[COL.MODEL] ?? '',
    creator: r[COL.CREATOR] ?? '',
    context: r[COL.CONTEXT] ?? '',
    license: r[COL.LICENSE] ?? '',
    index: /^\d{1,3}$/.test(String(r[COL.INDEX] ?? '').trim()) ? Number(r[COL.INDEX]) : null,
    costPerTaskUsd: parseMoney(r[COL.COST_PER_TASK]),
    inputUsd: parseMoney(r[COL.INPUT_USD]),
    outputUsd: parseMoney(r[COL.OUTPUT_USD]),
    outputTokensPerSec: parseNumber(r[COL.OUTPUT_TOKENS_PER_SEC]),
  }));

  const payload = {
    source: 'Artificial Analysis LLM Leaderboard',
    sourceUrl: URL,
    fetchedAt: new Date().toISOString().slice(0, 10),
    columns: head.slice(8),
    rows: slim,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`已写入 ${OUT_FILE}（${slim.length} 行）`);
  console.log('\n前 8 行:');
  for (const r of slim.slice(0, 8)) {
    console.log(
      `  ${String(r.index ?? '-').padStart(3)}  ${r.name.padEnd(34)} $${r.costPerTaskUsd ?? '-'}  ${r.outputTokensPerSec ?? '-'} tok/s`
    );
  }

  await browser.close();
}

function parseMoney(v: string | undefined): number | null {
  const m = String(v ?? '').match(/\$?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseNumber(v: string | undefined): number | null {
  const m = String(v ?? '').match(/^\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

main().catch((e) => {
  console.error('抓取失败:', e);
  process.exit(1);
});
