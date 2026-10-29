import fs from 'node:fs';
import path from 'node:path';
import type {
  Benchmark,
  ChangeEntry,
  Channel,
  Dataset,
  IntelligenceScore,
  Model,
  ModelAggregate,
  NormalizedPrice,
  PriceRecord,
  Score,
} from './types';
import { aggregateByModel, normalizeAll } from './compute';

/**
 * 数据加载。
 * 构建期从 data/ 目录读入 JSON 并在内存中完成标准化，
 * 静态导出后所有计算结果已固化在生成的 HTML 里。
 *
 * 目录约定：
 *   data/seeds/models.json       模型元数据
 *   data/seeds/channels.json     渠道元数据（四分类：official/cloud/carrier/third）
 *   data/seeds/benchmarks.json   基准定义与释义
 *   data/seeds/scores.json       基准分数
 *   data/seeds/intelligence.json 综合智能指数
 *   data/prices.json             按量与套餐价格（每条带 evidence 证据锚点）
 *   data/fx.json                 汇率
 *   data/snapshot.json           本期快照元信息
 */

const DATA_DIR = path.join(process.cwd(), 'data');

function readJson<T>(file: string, fallback: T): T {
  const full = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(full)) return fallback;
    const raw = fs.readFileSync(full, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[data] 读取 ${file} 失败，使用空值:`, err);
    return fallback;
  }
}

export interface RawBundle {
  models: Model[];
  channels: Channel[];
  benchmarks: Benchmark[];
  scores: Score[];
  intelligence: IntelligenceScore[];
  priceRecords: PriceRecord[];
  usdCny: number;
  changes: ChangeEntry[];
  snapshot: {
    id: string;
    date: string;
    builtAt: string;
    channelStatus: Dataset['channelStatus'];
    changes: Dataset['changes'];
  } | null;
}

/** 读取全部原始数据 */
export function loadRaw(): RawBundle {
  const snapshotFile = readJson<RawBundle['snapshot'] | null>('snapshot.json', null);
  const fx = readJson<{ rates: { date: string; usdCny: number }[] }>('fx.json', {
    rates: [],
  });

  // 取最近一条汇率
  const latestRate = fx.rates.length
    ? fx.rates.reduce((a, b) => (a.date >= b.date ? a : b))
    : { date: '', usdCny: 6.718 };

  return {
    models: readJson<Model[]>('seeds/models.json', []),
    channels: readJson<Channel[]>('seeds/channels.json', []),
    benchmarks: readJson<Benchmark[]>('seeds/benchmarks.json', []),
    scores: readJson<Score[]>('seeds/scores.json', []),
    intelligence: readJson<IntelligenceScore[]>('seeds/intelligence.json', []),
    priceRecords: readJson<PriceRecord[]>('prices.json', []),
    usdCny: latestRate.usdCny,
    changes: readJson<ChangeEntry[]>('changes.json', []),
    snapshot: snapshotFile,
  };
}

/**
 * 加载并标准化，产出前端消费的数据集。
 * 每次构建只算一次，结果被所有页面共享。
 */
let cached: Dataset | null = null;

export function loadDataset(): Dataset {
  if (cached) return cached;

  const raw = loadRaw();
  const officialIds = new Set(
    raw.channels.filter((c) => c.type === 'official').map((c) => c.id)
  );
  const prices: NormalizedPrice[] = normalizeAll(raw.priceRecords, raw.usdCny, officialIds);

  const aggregates: ModelAggregate[] = aggregateByModel(
    raw.models,
    prices,
    raw.channels,
    raw.intelligence,
    raw.scores
  );

  /*
   * 数据新鲜度以「最新一条报价的实际抓取时间」为准。
   *
   * 为什么不用 snapshot.date：那是旧采集框架留下的快照编号日期，
   * 会与真实抓取时间脱节（例如快照写 10-25，实际当天已重新核验过）。
   * 用户判断数据可信度靠的是「这价格是什么时候从官网拿到的」。
   */
  const fetchedDates = prices
    .map((p) => p.evidence?.fetchedAt)
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 10))
    .sort();
  const latestFetched = fetchedDates.length ? fetchedDates[fetchedDates.length - 1] : null;

  cached = {
    snapshotId: raw.snapshot?.id ?? 'local',
    updatedAt: latestFetched ?? raw.snapshot?.date ?? new Date().toISOString().slice(0, 10),
    usdCny: raw.usdCny,
    models: raw.models,
    channels: raw.channels,
    prices,
    benchmarks: raw.benchmarks,
    scores: raw.scores,
    intelligence: raw.intelligence,
    changes: raw.changes,
    channelStatus: raw.snapshot?.channelStatus ?? {},
    aggregates,
  };

  return cached;
}

/** 取模型详情（含该模型的所有渠道价格与跑分） */
export function getModelDetail(slug: string) {
  const ds = loadDataset();
  const agg = ds.aggregates.find((a) => a.model.id === slug);
  const model = ds.models.find((m) => m.id === slug);
  // 模型表里有、但还没采到任何价格的模型（如 Gemini 4 Argon、混元 Hy3）
  // 也要能出页面 —— 否则用户点进去是 404，CI 的模型页巡检也会失败。
  if (!agg && !model) return null;

  const channelMap = new Map(ds.channels.map((c) => [c.id, c]));
  const benchmarkMap = new Map(ds.benchmarks.map((b) => [b.id, b]));

  if (!agg) {
    // 无报价的模型：给一个空壳，页面渲染「暂无可比报价」
    return {
      model: model!,
      paygPrices: [],
      packagePrices: [],
      officialBlendedCny: null,
      cloudAvgCny: null,
      cloudCount: 0,
      lowestBlendedCny: null,
      highestBlendedCny: null,
      priceSpread: null,
      lowestChannelName: null,
      intelligence: ds.intelligence.find((i) => i.modelId === slug) ?? null,
      scores: ds.scores
        .filter((s) => s.modelId === slug)
        .map((s) => ({ ...s, benchmark: benchmarkMap.get(s.benchmarkId) })),
    };
  }

  return {
    ...agg,
    paygPrices: agg.paygPrices.map((p) => ({ ...p, channel: channelMap.get(p.channelId) })),
    packagePrices: agg.packagePrices.map((p) => ({ ...p, channel: channelMap.get(p.channelId) })),
    scores: agg.scores.map((s) => ({ ...s, benchmark: benchmarkMap.get(s.benchmarkId) })),
  };
}

/**
 * 供静态导出枚举路由。
 *
 * 必须覆盖模型种子表里的**每一个**模型，而不是只取有价格记录的。
 *
 * 原因：模型表会收录「有智能指数 / 跑分但还没采到价格」的模型
 * （如 Gemini 4 Argon、混元 Hy3）。若只按 aggregates 枚举，
 * 这些模型不会生成页面 —— 用户点进 /models/xxx-argon 得到 404，
 * CI 的模型页巡检也会失败（线上巡检遍历的正是模型表全量）。
 */
export function getAllModelSlugs(): string[] {
  return loadDataset().models.map((m) => m.id);
}

/** 渠道索引 */
export function getChannelMap(): Map<string, Channel> {
  return new Map(loadDataset().channels.map((c) => [c.id, c]));
}

/** 模型索引 */
export function getModelMap(): Map<string, Model> {
  return new Map(loadDataset().models.map((m) => [m.id, m]));
}

/** 所有套餐记录（套餐对比页用） */
export function getAllPackages() {
  const ds = loadDataset();
  const channelMap = new Map(ds.channels.map((c) => [c.id, c]));
  return ds.prices
    .filter((p) => p.billingMode === 'package')
    .map((p) => ({ ...p, channel: channelMap.get(p.channelId) }));
}

/** 全部按量价格（供套餐页做刊例价对照） */
export function getAllPayg() {
  return loadDataset().prices.filter((p) => p.billingMode === 'payg');
}
