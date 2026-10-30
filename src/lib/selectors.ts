/**
 * 派生层 —— 排名、结论、渠道榜、成本估算。
 *
 * 为什么单独一层：
 * 之前排名算法写在 page.tsx 里（首页那段「有指数的排前面」的排序），
 * 导致同一个「性价比最优」在首页和榜单里口径不一致，改一处漏一处。
 * 现在页面层只做组装，所有「谁排第一」的判断都在这里，且只有一份实现。
 *
 * 全部是纯函数：输入 Dataset，输出可直接渲染的精简结构。
 */

import type { Channel, Dataset, ModelAggregate, NormalizedPrice } from './types';
import type { TableRow } from '../components/common/DataTable';
import { blendedPrice, isStandardTier, round2, round4 } from './compute';

// ───────────────────────────────────────────
// 首页主表行 —— 传给客户端 DataTable 的精简结构
// ───────────────────────────────────────────

export interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  origin: 'domestic' | 'overseas';
  /** 该模型全渠道最低价渠道的三项价格（标准档） */
  input: number | null;
  cacheRead: number | null;
  output: number | null;
  /** 3:1 混合价 */
  blended: number | null;
  /** 能力指数，未收录为 null */
  index: number | null;
  /** 性价比 = 混合价 ÷ 指数，¥/分，越小越划算 */
  value: number | null;
  /** 有报价的渠道数 */
  channels: number;
  /** 筛选标签 */
  tags: string[];
}

/**
 * 把聚合结果摊成表格行。
 *
 * 价格取「该模型最低价渠道」的标准档三项价 —— 与模型详情页的口径一致，
 * 用户在首页看到的 ¥1.10 点进去能找到对应渠道，不会两个页面对不上。
 */
export function buildModelRows(ds: Dataset): ModelRow[] {
  return ds.aggregates.map((a) => {
    const lowest = lowestStandardRow(a);
    const index = a.intelligence?.index ?? null;
    const blended = a.lowestBlendedCny;
    return {
      id: a.model.id,
      name: a.model.name,
      vendor: a.model.vendor,
      origin: a.model.origin,
      input: lowest?.inputCny ?? null,
      cacheRead: lowest?.cacheReadCny ?? null,
      output: lowest?.outputCny ?? null,
      blended,
      index,
      value: blended != null && index != null && index > 0 ? round4(blended / index) : null,
      channels: countChannels(a.paygPrices),
      tags: [
        a.model.origin,
        index != null ? 'intel' : 'no-intel',
        a.priceSpread != null && a.priceSpread >= 2 ? 'wide-spread' : '',
      ].filter(Boolean),
    };
  });
}

/** 取该模型最低混合价的那条标准档记录 */
function lowestStandardRow(a: ModelAggregate): NormalizedPrice | null {
  const rows = a.paygPrices.filter((p) => p.blendedCny != null && isStandardTier(p));
  const pool = rows.length ? rows : a.paygPrices.filter((p) => p.blendedCny != null);
  return pool[0] ?? null;
}

function countChannels(prices: NormalizedPrice[]): number {
  return new Set(prices.map((p) => p.channelId)).size;
}

/**
 * 转成 DataTable 的行格式。
 *
 * 为什么需要这一跳：ModelRow 是 interface（没有隐式索引签名），
 * 而 DataTable 的列是按 key 动态取值的，要求行对象有索引签名。
 * 显式映射一次，也顺带明确了「表格只需要这 11 个字段」，
 * 不会把domains内部的聚合对象漏到客户端组件里 —— 静态导出下这条边界很重要。
 */
export function toTableRows(rows: ModelRow[]): TableRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    vendor: r.vendor,
    tags: r.tags,
    input: r.input,
    cacheRead: r.cacheRead,
    output: r.output,
    blended: r.blended,
    index: r.index,
    value: r.value,
    channels: r.channels,
  }));
}

// ───────────────────────────────────────────
// 三个 Top5 榜
// ───────────────────────────────────────────

export interface RankRow {
  id: string;
  name: string;
  vendor: string;
  /** 主数值（指数 / 混合价 / 性价比） */
  value: number | null;
  /** 价格榜的补充三列 */
  input?: number | null;
  cacheRead?: number | null;
  output?: number | null;
}

/** 能力指数最高 Top N */
export function topByIntelligence(rows: ModelRow[], n = 5): RankRow[] {
  return rows
    .filter((r) => r.index != null)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0))
    .slice(0, n)
    .map((r) => ({ id: r.id, name: r.name, vendor: r.vendor, value: r.index }));
}

/**
 * 价格最低 Top N —— 按 3:1 混合价升序。
 * 同时把输入 / 缓存读 / 输出三项一起带出：
 * 只给一个混合价，用户无法判断这个价是怎么来的，也无法按自己的负载重算。
 */
export function topByPrice(rows: ModelRow[], n = 5): RankRow[] {
  return rows
    .filter((r) => r.blended != null)
    .sort((a, b) => (a.blended ?? Infinity) - (b.blended ?? Infinity))
    .slice(0, n)
    .map((r) => ({
      id: r.id,
      name: r.name,
      vendor: r.vendor,
      value: r.blended,
      input: r.input,
      cacheRead: r.cacheRead,
      output: r.output,
    }));
}

/** 性价比最优 Top N（¥/每分指数，越小越好）；没有指数的模型不参评 */
export function topByValue(rows: ModelRow[], n = 5): RankRow[] {
  return rows
    .filter((r) => r.value != null)
    .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))
    .slice(0, n)
    .map((r) => ({ id: r.id, name: r.name, vendor: r.vendor, value: r.value }));
}

// ───────────────────────────────────────────
// 首页结论三卡
// ───────────────────────────────────────────

export interface Verdict {
  key: 'intelligence' | 'price' | 'value';
  title: string;
  modelId: string;
  modelName: string;
  vendor: string;
  /** 卡片主数值的展示文本，如「71」「¥0.90」「0.021」 */
  metric: string;
  metricUnit: string;
  /** 一句话理由 —— 说明为什么是它，而不是只报个数 */
  reason: string;
}

/**
 * 三张结论卡：能力最强 / 最便宜 / 最划算。
 *
 * 文案全部由数据算出，不人工维护 —— 数据更新后结论自动跟着变，
 * 不会出现「榜单第一是 A，结论卡还写着 B」的错位。
 */
export function buildVerdicts(rows: ModelRow[]): Verdict[] {
  const byIntel = topByIntelligence(rows, 1)[0];
  const byPrice = topByPrice(rows, 1)[0];
  const byValue = topByValue(rows, 1)[0];
  const out: Verdict[] = [];

  if (byIntel) {
    out.push({
      key: 'intelligence',
      title: '能力指数最高',
      modelId: byIntel.id,
      modelName: byIntel.name,
      vendor: byIntel.vendor,
      metric: String(byIntel.value),
      metricUnit: 'AA 智能指数',
      reason: `${byIntel.vendor}出品，综合能力指数 ${byIntel.value} 分，是本站收录模型里的最高分。`,
    });
  }
  if (byPrice) {
    const cheapest = byPrice;
    out.push({
      key: 'price',
      title: '价格最低',
      modelId: cheapest.id,
      modelName: cheapest.name,
      vendor: cheapest.vendor,
      metric: `¥${cheapest.value?.toFixed(2)}`,
      metricUnit: '3:1 混合价 / 百万 tokens',
      reason: `输入 ¥${cheapest.input?.toFixed(2) ?? '—'}、输出 ¥${cheapest.output?.toFixed(2) ?? '—'}，按 3:1 折算后是全网最低。`,
    });
  }
  if (byValue) {
    out.push({
      key: 'value',
      title: '性价比最优',
      modelId: byValue.id,
      modelName: byValue.name,
      vendor: byValue.vendor,
      metric: `¥${byValue.value?.toFixed(3)}`,
      metricUnit: '每分能力的成本',
      reason: `每买到 1 分能力指数只要 ¥${byValue.value?.toFixed(3)}，是能力 ÷ 价格的最优平衡点。`,
    });
  }
  return out;
}

// ───────────────────────────────────────────
// 渠道榜 —— 换视角比「在哪家买」
// ───────────────────────────────────────────

export interface ChannelRank {
  id: string;
  name: string;
  type: Channel['type'];
  /** 上架且有价的模型数 */
  coverage: number;
  /** 该渠道全部标准档混合价的均值 */
  avgBlended: number | null;
  /** 平均溢价：该渠道价 ÷ 该模型全网最低价，1.0 = 永远是全场最低 */
  avgPremium: number | null;
}

/**
 * 渠道维度聚合。
 *
 * 站内原本只有模型维度，缺少「哪家渠道整体便宜」这个视角 ——
 * 而「在哪家买」恰恰是采购决策里最实际的一问。
 */
export function buildChannelRanks(ds: Dataset): ChannelRank[] {
  const channelMap = new Map(ds.channels.map((c) => [c.id, c]));
  // 每个模型的全网最低标准档混合价，用于算溢价
  const lowestByModel = new Map<string, number>();
  for (const a of ds.aggregates) {
    if (a.lowestBlendedCny != null) lowestByModel.set(a.model.id, a.lowestBlendedCny);
  }

  const acc = new Map<string, { prices: number[]; premiums: number[] }>();
  for (const p of ds.prices) {
    if (p.billingMode !== 'payg') continue;
    if (p.blendedCny == null) continue;
    if (!isStandardTier(p)) continue;
    const slot = acc.get(p.channelId) ?? { prices: [], premiums: [] };
    slot.prices.push(p.blendedCny);
    const lowest = lowestByModel.get(p.modelId);
    if (lowest != null && lowest > 0) slot.premiums.push(p.blendedCny / lowest);
    acc.set(p.channelId, slot);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return ds.channels
    .filter((c) => acc.has(c.id))
    .map((c) => {
      const slot = acc.get(c.id)!;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        coverage: new Set(
          ds.prices.filter((p) => p.channelId === c.id && p.blendedCny != null).map((p) => p.modelId)
        ).size,
        avgBlended: avg(slot.prices) != null ? round2(avg(slot.prices)!) : null,
        avgPremium: avg(slot.premiums) != null ? round2(avg(slot.premiums)!) : null,
      };
    })
    .sort((a, b) => b.coverage - a.coverage);
}

/** 渠道榜三榜：覆盖最广 / 均价最低 / 溢价最高 */
export function channelBoards(ranks: ChannelRank[], n = 5) {
  const byCoverage = [...ranks].sort((a, b) => b.coverage - a.coverage).slice(0, n);
  const byAvg = [...ranks]
    .filter((r) => r.avgBlended != null)
    .sort((a, b) => (a.avgBlended ?? Infinity) - (b.avgBlended ?? Infinity))
    .slice(0, n);
  const byPremium = [...ranks]
    .filter((r) => r.avgPremium != null)
    .sort((a, b) => (b.avgPremium ?? 0) - (a.avgPremium ?? 0))
    .slice(0, n);
  return { byCoverage, byAvg, byPremium };
}

// ───────────────────────────────────────────
// 成本估算
// ───────────────────────────────────────────

export interface CostEstimate {
  id: string;
  name: string;
  vendor: string;
  /** 按 3:1 混合价算出的月成本（元） */
  monthly: number | null;
  yearly: number | null;
  index: number | null;
}

/**
 * 月用量成本估算。
 *
 * 输入月用量（百万 tokens），输出各模型月/年成本排序。
 * 参考站（AI Ping 之类）只有单价对比，没有「我用多少要花多少钱」——
 * 这是对采购决策最实用、也最容易做出差异化的一层。
 */
export function estimateMonthlyCost(rows: ModelRow[], tokensPerMonthMillion: number): CostEstimate[] {
  if (!Number.isFinite(tokensPerMonthMillion) || tokensPerMonthMillion <= 0) return [];
  return rows
    .filter((r) => r.blended != null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      vendor: r.vendor,
      monthly: round2(r.blended! * tokensPerMonthMillion),
      yearly: round2(r.blended! * tokensPerMonthMillion * 12),
      index: r.index,
    }))
    .sort((a, b) => (a.monthly ?? Infinity) - (b.monthly ?? Infinity));
}

/** 单模型成本：给定输入/输出占比，按实际用量而不是固定 3:1 估算 */
export function estimateByUsage(
  inputCny: number | null,
  outputCny: number | null,
  inputMillion: number,
  outputMillion: number
): number | null {
  if (inputCny == null || outputCny == null) return null;
  return round2(inputCny * inputMillion + outputCny * outputMillion);
}

export { blendedPrice };
