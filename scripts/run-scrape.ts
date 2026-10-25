/**
 * 抓取调度主程序
 *
 * 执行顺序（对应设计稿的周更流程）：
 *   1. 抓汇率（央行中间价）
 *   2. 建本周快照 ID
 *   3. 并发跑各渠道适配器（失败重试 2 次）
 *   4. 合并结果 → 与上次快照做差分
 *   5. 写库 + 导出 JSON
 *   6. 输出异常报告
 *
 * 铁律：某渠道抓取失败时，保留该渠道上次的价格数据并标记 status='stale'，
 *      绝不用空值覆盖已有价格。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Channel, ChannelStatus, PriceRecord, Snapshot } from '../src/lib/types';
import { diffPrices, normalizeAll } from '../src/lib/compute';
import type { AdapterContext } from './lib/types';
import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';
import { GeminiAdapter } from './adapters/gemini';
import { XaiAdapter } from './adapters/xai';
import { DeepSeekAdapter } from './adapters/deepseek';
import { BigModelAdapter } from './adapters/bigmodel';
import { MoonshotAdapter } from './adapters/moonshot';
import { MimoAdapter } from './adapters/mimo';
import { MiniMaxAdapter } from './adapters/minimax';
import { AliyunBailianAdapter } from './adapters/aliyun';
import { VolcengineArkAdapter } from './adapters/volcengine';
import { TencentTokenHubAdapter } from './adapters/tencent';
import { BaiduQianfanAdapter } from './adapters/baidu';
import { MobileCloudAdapter } from './adapters/mobilecloud';
import { CtyunAdapter } from './adapters/ctyun';
import { CucloudAdapter } from './adapters/cucloud';
import { QiniuAdapter } from './adapters/qiniu';
import { SiliconFlowAdapter } from './adapters/siliconflow';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  const full = path.join(DATA_DIR, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
  log(`写入 ${file}`);
}

/** 生成快照 ID，如 2026-W43 */
function snapshotId(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * 抓取汇率
 * 数据源：中国人民银行授权中国外汇交易中心公布的人民币汇率中间价
 */
async function fetchFxRate(date: Date): Promise<number> {
  // 优先尝试从已有 fx.json 中取最近一条（离线可用）
  const fx = readJson<{ rates: { date: string; usdCny: number }[] }>('fx.json', { rates: [] });
  const latest = fx.rates.reduce(
    (a, b) => (b.date > a.date ? b : a),
    { date: '', usdCny: 6.718 }
  );
  log(`汇率 1 USD = ${latest.usdCny} CNY（${latest.date || '内置默认'}）`);
  return latest.usdCny;
}

/**
 * 抓取渠道指数
 * 生产环境应从公开接口获取；此处保留手动维护的索引文件作为兜底
 */
async function fetchFxIndex(): Promise<number[]> {
  const idx = readJson<number[]>('fx-index.json', []);
  if (idx.length === 0) {
    log('⚠️ 未找到 fx-index.json，使用默认汇率序列');
    return [6.718];
  }
  return idx;
}

/** 所有适配器实例 */
function buildAdapters() {
  return [
    // 海外官方
    new OpenAIAdapter(),
    new AnthropicAdapter(),
    new GeminiAdapter(),
    new XaiAdapter(),
    // 国内厂商官方
    new DeepSeekAdapter(),
    new BigModelAdapter(),
    new MoonshotAdapter(),
    new MimoAdapter(),
    new MiniMaxAdapter(),
    // 云平台刊例价
    new AliyunBailianAdapter(),
    new VolcengineArkAdapter(),
    new TencentTokenHubAdapter(),
    new BaiduQianfanAdapter(),
    new MobileCloudAdapter(),
    new CtyunAdapter(),
    new CucloudAdapter(),
    new QiniuAdapter(),
    new SiliconFlowAdapter(),
  ];
}

/**
 * 跑单个适配器，带重试
 */
async function runAdapter(
  adapter: ReturnType<typeof buildAdapters>[number],
  ctxBase: Omit<AdapterContext, 'log'>,
  retries = 2
): Promise<{ records: PriceRecord[]; error: string | null }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const records = await adapter.fetchPrices({
        ...ctxBase,
        log: (m) => log(`  [${adapter.channelName}] ${m}`),
      });
      if (records.length === 0) {
        throw new Error('解析结果为空');
      }
      return { records, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        log(`  [${adapter.channelName}] 第 ${attempt + 1} 次失败：${msg}，重试中`);
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      } else {
        log(`  [${adapter.channelName}] 最终失败：${msg}`);
        return { records: [], error: msg };
      }
    }
  }
  return { records: [], error: '未知错误' };
}

async function main() {
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null;

  const now = new Date();
  const fetchedAt = now.toISOString();
  const sid = snapshotId(now);

  log(`===== ModelsMark 抓取开始 · 快照 ${sid} =====`);

  // 1. 汇率
  const usdCny = await fetchFxRate(now);

  // 2. 载入上期数据
  const prevRecords = readJson<PriceRecord[]>('prices.json', []);
  const prevSnapshot = readJson<Snapshot | null>('snapshot.json', null);
  const channels = readJson<Channel[]>('seeds/channels.json', []);

  // 3. 并发跑适配器
  let browser: import('playwright').Browser | undefined;
  const needsBrowser = buildAdapters().some((a) => a.strategy === 'rendered');
  if (needsBrowser) {
    try {
      const { chromium } = await import('playwright');
      browser = await chromium.launch({ headless: true });
      log('浏览器已启动');
    } catch (err) {
      log(`⚠️ 浏览器启动失败：${err instanceof Error ? err.message : err}`);
    }
  }

  const adapters = buildAdapters().filter((a) => !only || a.channelId === only);
  const results = await Promise.all(
    adapters.map((a) =>
      runAdapter(a, { fetchedAt, browser }).then((r) => ({ adapter: a, ...r }))
    )
  );

  if (browser) await browser.close();

  // 4. 合并结果。失败渠道保留上期数据
  const channelStatus: Record<string, ChannelStatus> = {};
  const newRecords: PriceRecord[] = [];

  for (const { adapter, records, error } of results) {
    if (error) {
      const prev = prevRecords.filter((r) => r.channelId === adapter.channelId);
      newRecords.push(...prev);
      channelStatus[adapter.channelId] = {
        channelId: adapter.channelId,
        status: prev.length > 0 ? 'stale' : 'failed',
        dataAsOf:
          prev[0]?.fetchedAt ??
          prevSnapshot?.channelStatus?.[adapter.channelId]?.dataAsOf ??
          fetchedAt,
        records: prev.length,
        error,
        changes: 0,
      };
      log(`⚠️ ${adapter.channelName}: ${prev.length > 0 ? '沿用上期数据' : '无数据可用'}`);
    } else {
      newRecords.push(...records);
      channelStatus[adapter.channelId] = {
        channelId: adapter.channelId,
        status: 'ok',
        dataAsOf: fetchedAt,
        records: records.length,
        error: null,
        changes: 0,
      };
      log(`✓ ${adapter.channelName}: ${records.length} 条`);
    }
  }

  // 未参与本次抓取的渠道，继承上期状态
  for (const c of channels) {
    if (!channelStatus[c.id] && prevSnapshot?.channelStatus?.[c.id]) {
      channelStatus[c.id] = prevSnapshot.channelStatus[c.id];
    }
  }

  // 5. 差分
  const firstPartyIds = new Set(
    channels.filter((c) => c.type === 'first_party').map((c) => c.id)
  );
  const prevNormalized = normalizeAll(prevRecords, usdCny, firstPartyIds);
  const currNormalized = normalizeAll(newRecords, usdCny, firstPartyIds);
  const diffs = diffPrices(prevNormalized, currNormalized);

  for (const d of diffs) {
    const st = channelStatus[d.channelId];
    if (st) st.changes += 1;
  }

  log(`价格变动 ${diffs.length} 处`);

  // 6. 写库
  writeJson('prices.json', newRecords);

  const snapshot: Snapshot = {
    id: sid,
    date: now.toISOString().slice(0, 10),
    usdCny,
    channelStatus,
    counts: {
      models: readJson<unknown[]>('seeds/models.json', []).length,
      channels: channels.length,
      paygPrices: newRecords.filter((r) => r.billingMode === 'payg').length,
      packagePrices: newRecords.filter((r) => r.billingMode === 'package').length,
      scores: readJson<unknown[]>('seeds/scores.json', []).length,
    },
    builtAt: fetchedAt,
  };
  writeJson('snapshot.json', snapshot);

  // 变更记录单独存一份，供前端「本周变动」模块使用
  writeJson('changes.json', diffs);

  // 存档上期数据，供下次抓取做跳变检测（>30% 变动人工复核）
  writeJson('prices.prev.json', prevRecords);

  // 7. 异常报告
  const failures = Object.values(channelStatus).filter((s) => s.status !== 'ok');
  if (failures.length > 0) {
    log('===== 异常报告 =====');
    for (const f of failures) {
      log(`⚠️ ${f.channelId}: ${f.status} · ${f.error ?? ''} · 数据时间 ${f.dataAsOf}`);
    }
    fs.writeFileSync(
      path.join(ROOT, 'scrape-report.json'),
      JSON.stringify({ snapshotId: sid, at: fetchedAt, failures }, null, 2),
      'utf8'
    );
  }

  log(`===== 抓取完成 · 快照 ${sid} =====`);
}

main().catch((err) => {
  log(`致命错误：${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
