import type {
  Channel,
  FxRate,
  IntelligenceScore,
  Model,
  NormalizedPrice,
  PriceRecord,
} from './types';

/** 输入输出混合比：3 份输入配 1 份输出。行业常见 RAG/对话负载的近似值 */
export const BLEND_RATIO = { input: 3, output: 1 } as const;

/**
 * 汇率换算
 * 人民币价格原样返回，美元价格按给定汇率折算
 */
export function toCny(
  amount: number | null | undefined,
  currency: 'CNY' | 'USD',
  usdCny: number
): number | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return null;
  return currency === 'USD' ? round2(amount * usdCny) : round2(amount);
}

/**
 * 3:1 输入输出混合价（每百万 token）
 * 公式：(input × 3 + output × 1) / 4
 * 缓存命中价不参与混合计算——它只对部分请求生效，单独展示
 */
export function blendedPrice(
  inputCny: number | null,
  outputCny: number | null
): number | null {
  if (inputCny === null && outputCny === null) return null;
  const i = inputCny ?? 0;
  const o = outputCny ?? 0;
  return round2((i * BLEND_RATIO.input + o * BLEND_RATIO.output) / 4);
}

/**
 * 套餐折算单价（每百万 token，人民币）
 * 额度 ÷ 价格 = 每百万 token 单价
 * 若套餐为输入输出合并抵扣，则按 3:1 假设分配后取混合价；
 * 实际上合并抵扣时无法区分，此处直接给出额度均价
 */
export function packageBlended(
  packageTokens: number | null | undefined,
  packagePriceCny: number | null | undefined
): number | null {
  if (!packageTokens || !packagePriceCny) return null;
  return round2((packagePriceCny / packageTokens) * 1_000_000);
}

/**
 * 溢价率：相对官方渠道的价格倍数
 * 0.26 表示比官方贵 26%；-0.1 表示比官方便宜 10%
 * 官方渠道本身返回 0
 */
export function premiumRate(
  blendedCny: number | null,
  officialBlendedCny: number | null | undefined
): number | null {
  if (blendedCny === null || !officialBlendedCny || officialBlendedCny <= 0) {
    return null;
  }
  return round2((blendedCny - officialBlendedCny) / officialBlendedCny);
}

/**
 * 缓存折扣率：缓存读取价相对标准输入价的折扣
 * 0.9 表示缓存读取比标准输入便宜 90%
 * 返回 null 表示该渠道未提供缓存价或无折扣
 *
 * 这是采购决策的关键指标——缓存命中与未命中的价差可达上百倍，
 * 直接决定长对话、RAG 场景的实际账单。
 */
export function cacheDiscount(
  price: Pick<NormalizedPrice, 'inputCny' | 'cacheReadCny'>
): number | null {
  if (!price.inputCny || price.cacheReadCny === null) return null;
  if (price.inputCny <= 0) return null;
  const d = 1 - price.cacheReadCny / price.inputCny;
  // 折扣小于 1% 视为无实质折扣，不展示
  if (d < 0.01) return null;
  return round2(d);
}

/**
 * 格式化折扣率
 */
export function formatDiscount(d: number | null | undefined): string {
  if (d === null || d === undefined) return '—';
  const pct = d * 100;
  if (pct >= 99.5) return '>99%';
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

/**
 * 归一化单条价格记录
 * @param record 原始价格记录
 * @param usdCny 本期汇率
 * @param officialMap 模型 id → 官方渠道混合价，用于计算溢价率
 * @param isFirstParty 该记录所在渠道是否为厂商官方直销
 */
export function normalizePrice(
  record: PriceRecord,
  usdCny: number,
  officialMap: Map<string, number>,
  isFirstParty: boolean
): NormalizedPrice {
  const inputCny = toCny(record.input, record.currency, usdCny);
  const cacheReadCny = toCny(record.cacheRead, record.currency, usdCny);
  const cacheWriteCny = toCny(record.cacheWrite, record.currency, usdCny);
  const outputCny = toCny(record.output, record.currency, usdCny);

  const blendedCny =
    record.billingMode === 'package'
      ? packageBlended(record.packageTokens, toCny(record.packagePrice, record.currency, usdCny))
      : blendedPrice(inputCny, outputCny);

  return {
    modelId: record.modelId,
    channelId: record.channelId,
    billingMode: record.billingMode,
    currency: record.currency,
    inputNative: record.input,
    cacheReadNative: record.cacheRead,
    cacheWriteNative: record.cacheWrite,
    outputNative: record.output,
    inputCny,
    cacheReadCny,
    cacheWriteCny,
    outputCny,
    blendedCny,
    // 溢价率只对云平台渠道有意义；官方渠道本身就是基准，置 null
    premiumRate:
      record.billingMode === 'payg' && !isFirstParty
        ? premiumRate(blendedCny, officialMap.get(record.modelId))
        : null,
    tier: record.tier,
    tierLabel: record.tierLabel,
    sourceUrl: record.sourceUrl,
    fetchedAt: record.fetchedAt,
    effectiveFrom: null,
    promotional: record.promotional,
    promoNote: record.promoNote,
    note: record.note,
    packageTokens: record.packageTokens ?? null,
    packagePeriod: record.packagePeriod ?? null,
    packagePriceCny: toCny(record.packagePrice, record.currency, usdCny),
    packageTierName: record.packageTierName ?? null,
    packageMerged: record.packageMerged ?? null,
    packageManualActivation: record.packageManualActivation ?? null,
    packageBlendedCny:
      record.billingMode === 'package'
        ? packageBlended(
            record.packageTokens,
            toCny(record.packagePrice, record.currency, usdCny)
          )
        : null,
  };
}

/**
 * 批量归一化。
 * 分两步：
 * 1. 先算出所有官方渠道（first_party）的混合价，建 map 作为溢价基准
 * 2. 再归一化全部记录，这样云平台溢价率才有基准
 *
 * 同一模型在官方渠道可能有多个档位（峰谷、长上下文），
 * 基准取其中最低价（对客户最有利的那一档），这样溢价率才反映真实加价幅度。
 */
export function normalizeAll(
  records: PriceRecord[],
  usdCny: number,
  firstPartyChannelIds?: Set<string>
): NormalizedPrice[] {
  const officialMap = new Map<string, number>();

  for (const r of records) {
    if (r.billingMode !== 'payg') continue;
    if (firstPartyChannelIds && !firstPartyChannelIds.has(r.channelId)) continue;
    const inputCny = toCny(r.input, r.currency, usdCny);
    const outputCny = toCny(r.output, r.currency, usdCny);
    const blended = blendedPrice(inputCny, outputCny);
    if (blended === null) continue;
    const cur = officialMap.get(r.modelId);
    if (cur === undefined || blended < cur) {
      officialMap.set(r.modelId, blended);
    }
  }

  return records.map((r) =>
    normalizePrice(
      r,
      usdCny,
      officialMap,
      firstPartyChannelIds ? firstPartyChannelIds.has(r.channelId) : false
    )
  );
}

/**
 * 智能指数性价比：每任务成本越低越好，能力分越高越好
 * 用于前端散点图定位
 */
export function valueScore(
  intel: IntelligenceScore,
  blendedCny: number | null
): { x: number; y: number } | null {
  if (!blendedCny || intel.index === null) return null;
  return { x: blendedCny, y: intel.index };
}

/**
 * 能力域归一化：把某模型在某个能力域内的各项基准分数
 * 归一到 0-100，用于雷达图
 * 做法：以该域内所有模型的最高分为 100 基准，线性映射到 40-100 区间
 */
export function normalizeDomainScores(
  modelId: string,
  benchmarkIds: string[],
  scoreMap: Map<string, number>,
  domainMax: Map<string, number>
): number[] {
  return benchmarkIds.map((bid) => {
    const v = scoreMap.get(`${modelId}::${bid}`);
    const max = domainMax.get(bid);
    if (v === undefined || !max) return 40;
    // 40 + 60 × (v / max)，避免低分模型全部贴在底部
    return Math.round((40 + 60 * (v / max)) * 10) / 10;
  });
}

/**
 * 计算每个基准在所有模型中的最高分
 */
export function computeDomainMax(
  scores: { modelId: string; benchmarkId: string; value: number }[]
): Map<string, number> {
  const max = new Map<string, number>();
  for (const s of scores) {
    const cur = max.get(s.benchmarkId);
    if (cur === undefined || s.value > cur) max.set(s.benchmarkId, s.value);
  }
  return max;
}

/**
 * 两个快照之间的价格差分
 * 键：modelId::channelId::billingMode::tierLabel
 */
export function diffPrices(
  prev: NormalizedPrice[],
  curr: NormalizedPrice[]
): {
  kind: 'price' | 'added' | 'removed';
  modelId: string;
  channelId: string;
  billingMode: 'payg' | 'package';
  fromCny: number | null;
  toCny: number | null;
  delta: number | null;
  tierLabel: string | null;
}[] {
  const key = (p: NormalizedPrice) =>
    `${p.modelId}::${p.channelId}::${p.billingMode}::${p.tierLabel ?? ''}`;

  const prevMap = new Map(prev.map((p) => [key(p), p]));
  const currMap = new Map(curr.map((p) => [key(p), p]));
  const out: ReturnType<typeof diffPrices> = [];

  for (const [k, c] of currMap) {
    const p = prevMap.get(k);
    if (!p) {
      out.push({
        kind: 'added',
        modelId: c.modelId,
        channelId: c.channelId,
        billingMode: c.billingMode,
        fromCny: null,
        toCny: c.blendedCny,
        delta: null,
        tierLabel: c.tierLabel,
      });
      continue;
    }
    if (p.blendedCny !== null && c.blendedCny !== null) {
      const delta = round2((c.blendedCny - p.blendedCny) / p.blendedCny);
      // 变化超过 1% 才算有效变动，避免汇率微小波动造成噪声
      if (Math.abs(delta) >= 0.01) {
        out.push({
          kind: 'price',
          modelId: c.modelId,
          channelId: c.channelId,
          billingMode: c.billingMode,
          fromCny: p.blendedCny,
          toCny: c.blendedCny,
          delta,
          tierLabel: c.tierLabel,
        });
      }
    }
  }

  for (const [k, p] of prevMap) {
    if (!currMap.has(k)) {
      out.push({
        kind: 'removed',
        modelId: p.modelId,
        channelId: p.channelId,
        billingMode: p.billingMode,
        fromCny: p.blendedCny,
        toCny: null,
        delta: null,
        tierLabel: p.tierLabel,
      });
    }
  }

  return out;
}

/** 保留两位小数，避免浮点误差在前端显示成 8.849999999 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 格式化人民币价格 */
export function formatCny(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '¥0';
  if (n < 0.01) return `¥${n.toFixed(4)}`;
  if (n < 1) return `¥${n.toFixed(3)}`;
  if (n < 100) return `¥${n.toFixed(2)}`;
  return `¥${Math.round(n)}`;
}

/** 格式化涨跌幅度：红涨绿跌 */
export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return '—';
  const pct = delta * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

/** 涨跌颜色：涨用红，跌用绿（境内成本口径） */
export function deltaColor(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return 'var(--color-text-tertiary)';
  if (delta > 0) return '#A32D2D';
  if (delta < 0) return '#3B6D11';
  return 'var(--color-text-secondary)';
}

/**
 * 估算月度成本
 * @param monthlyRequests 月请求数
 * @param inputTokensPerReq 单次请求平均输入 token
 * @param outputTokensPerReq 单次请求平均输出 token
 */
export function estimateMonthlyCost(
  blendedCny: number | null,
  monthlyRequests: number,
  inputTokensPerReq: number,
  outputTokensPerReq: number
): number | null {
  if (!blendedCny) return null;
  // 3:1 混合价已含输入输出权重，此处按同比例拆分调用量
  const totalTokens = inputTokensPerReq + outputTokensPerReq;
  const weighted = (inputTokensPerReq * 3 + outputTokensPerReq) / 4;
  const millions = (weighted * monthlyRequests) / 1_000_000;
  return round2(blendedCny * millions);
}
