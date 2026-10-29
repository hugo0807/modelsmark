import type {
  Channel,
  IntelligenceScore,
  Model,
  ModelAggregate,
  NormalizedPrice,
  PriceRecord,
  Score,
} from './types';
import { CHANNEL_TYPE_ORDER } from './types';

/** 输入输出混合比：3 份输入配 1 份输出。行业常见 RAG/对话负载的近似值 */
export const BLEND_RATIO = { input: 3, output: 1 } as const;

/**
 * 是否为「标准档」报价。
 *
 * 同一渠道同一模型常有忙时/闲时、批量、低优、经济版等多档报价。
 * 若把这些特殊档与标准档混在一起算均价或取最低，会被批量/低优价严重拉低，
 * 产生「云厂商比官方便宜 70%」这类误导结论。
 *
 * 判定口径：
 * - 必须无量化的条件档位（tier.kind === 'none'）
 * - 且档位标签不能是折扣/特殊档（闲时、空闲、批量、低优、经济版、五折、兜底、夜间）
 * - 「高峰时段」「忙时」视为刊例价本身，属于标准档
 */
const DISCOUNT_TIER =
  /(闲时|空闲|低峰|夜间|批量|低优|经济版|五折|折扣|兜底|秒杀|活动价|offpeak|batch)/i;

/**
 * 溢价档 —— 与折扣档相反，是「加钱才给」的那一档。
 *
 * 典型两类：
 * · 长上下文上档：「>512K」比「≤512K」贵一倍多
 * · 加速档：「优先」（Priority）比「标准」贵 50%
 *
 * 这两档若混进标准档，会把「全渠道最低价」抬高、把「官方刊例价」
 * 算成两个值（实测 minimax-m3 出现 3.68 与 5.51 两个官方价）。
 */
const PREMIUM_TIER = /(优先|priority|加速|高优|turbo|极速)/i;

export function isStandardTier(p: {
  tier: { kind: string };
  tierLabel?: string | null;
}): boolean {
  const kind = p.tier?.kind;
  // 免费模型（官网标价 0）单独标注，不参与最低价与均价计算 ——
  // 免费不等于高性价比，这类模型通常还有调用限流。
  if (p.tierLabel && /免费/.test(p.tierLabel)) return false;
  // 高峰时段即刊例价本身，算标准档；其余条件档位（闲时/批量/长上下文）都不算
  if (kind === 'peak') return true;
  if (kind !== 'none') return false;
  const label = p.tierLabel ?? '';
  if (label && DISCOUNT_TIER.test(label)) return false;
  // 加速档 / 优先档是溢价档，不是刊例价
  if (label && PREMIUM_TIER.test(label)) return false;
  // 「>256K」这类上档是溢价档，不参与标准档均价
  if (label.includes('>')) return false;
  /*
   * 「32K-256K」「256K-1M」这类区间档是按上下文长度加价的溢价档，
   * 刊例价是其中最左边的那个区间（通常写成 ≤32K / ≤128K）。
   * 把溢价档当成标准档会让同一模型凭空多出 3～6 倍的价差 ——
   * 那不是「换家买能省多少」，而是「长文本要加多少钱」。
   */
  if (/\d+\s*[KM]\s*[-–~至]\s*\d+\s*[KM]/i.test(label)) return false;
  return true;
}

/**
 * 汇率换算
 * 人民币价格原样返回，美元价格按给定汇率折算
 */
export function toCny(
  amount: number | null | undefined,
  currency: 'CNY' | 'USD',
  usdCny: number
): number | null {
  if (amount == null || amount === undefined || Number.isNaN(amount)) return null;
  return currency === 'USD' ? round2(amount * usdCny) : round2(amount);
}

/**
 * 3:1 输入输出混合价（每百万 token）
 * 公式：(input × 3 + output × 1) / 4
 * 缓存命中价不参与混合计算——它只对部分请求生效，单独展示
 *
 * 必须输入输出都有价才能算混合价。若把缺失的一侧当 0，
 * 会算出「只有输入价」的虚低价（如 2 元输入当 output=0 → 混合 1.5），
 * 比任何真实渠道都便宜，属严重误导。
 */
export function blendedPrice(
  inputCny: number | null,
  outputCny: number | null
): number | null {
  if (inputCny === null || outputCny === null) return null;
  return round2((inputCny * BLEND_RATIO.input + outputCny * BLEND_RATIO.output) / 4);
}

/**
 * 套餐折算单价（每百万 token，人民币）
 * 额度 ÷ 价格 = 每百万 token 单价
 * 仅 token 口径可算；积分制/次数制返回 null
 */
export function packageBlended(
  packageQuota: number | null | undefined,
  packagePriceCny: number | null | undefined
): number | null {
  if (!packageQuota || !packagePriceCny) return null;
  return round4((packagePriceCny / packageQuota) * 1_000_000);
}

/** 套餐折算单价（每次调用，人民币）—— 仅 calls 口径可算 */
export function packagePerCall(
  packageCalls: number | null | undefined,
  packagePriceCny: number | null | undefined
): number | null {
  if (!packageCalls || !packagePriceCny) return null;
  return round4(packagePriceCny / packageCalls);
}

/**
 * 溢价率：相对官方渠道的价格倍数
 * 0.26 表示比官方贵 26%；-0.1 表示比官方便宜 10%
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
 */
export function cacheDiscount(
  price: Pick<NormalizedPrice, 'inputCny' | 'cacheReadCny'>
): number | null {
  if (!price.inputCny || price.cacheReadCny === null) return null;
  if (price.inputCny <= 0) return null;
  const d = 1 - price.cacheReadCny / price.inputCny;
  if (d < 0.01) return null;
  return round2(d);
}

export function formatDiscount(d: number | null | undefined): string {
  if (d === null || d === undefined) return '—';
  const pct = d * 100;
  if (pct >= 99.5) return '>99%';
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * 归一化单条价格记录
 * @param officialMap 模型 id → 官方渠道混合价，用于计算溢价率
 * @param isOfficial 该记录所在渠道是否为厂商官方直销
 */
export function normalizePrice(
  record: PriceRecord,
  usdCny: number,
  officialMap: Map<string, number>,
  isOfficial: boolean
): NormalizedPrice {
  const inputCny = toCny(record.input, record.currency, usdCny);
  const cacheReadCny = toCny(record.cacheRead, record.currency, usdCny);
  const cacheWriteCny = toCny(record.cacheWrite, record.currency, usdCny);
  const outputCny = toCny(record.output, record.currency, usdCny);

  const blendedCny =
    record.billingMode === 'package'
      ? packageBlended(record.packageQuota, toCny(record.packagePrice, record.currency, usdCny))
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
    premiumRate: isOfficial ? 0 : premiumRate(blendedCny, officialMap.get(record.modelId)),
    tier: record.tier,
    tierLabel: record.tierLabel,
    evidence: record.evidence,
    promotional: record.promotional,
    promoNote: record.promoNote,
    note: record.note,
    packageQuota: record.packageQuota,
    packageQuotaUnit: record.packageQuotaUnit,
    packagePeriod: record.packagePeriod,
    packagePriceCny: toCny(record.packagePrice, record.currency, usdCny),
    packageTierName: record.packageTierName,
    packageMerged: record.packageMerged,
    packageManualActivation: record.packageManualActivation,
    packageCalls: record.packageCalls,
    packageIncludes: record.packageIncludes,
    packageBlendedCny:
      record.billingMode === 'package'
        ? packageBlended(record.packageQuota, toCny(record.packagePrice, record.currency, usdCny))
        : undefined,
    packagePerCallCny:
      record.billingMode === 'package'
        ? packagePerCall(record.packageCalls, toCny(record.packagePrice, record.currency, usdCny))
        : undefined,
  };
}

/**
 * 批量归一化。
 *
 * 官方基准的选取规则（关键，必须唯一且可解释）：
 * 同一模型在官方渠道可能有多个价（标准档 / 批量档 / 夜间档 / 长上下文档）。
 * 基准只认「标准档」——tier.kind === 'none' 且无 tierLabel。
 * 若标准档缺失，才回退到任意官方档的最低价，并标记为 tierLabel 非空。
 */
export function normalizeAll(
  records: PriceRecord[],
  usdCny: number,
  officialChannelIds: Set<string>
): NormalizedPrice[] {
  // 第一遍：算出每条记录的混合价
  const prelim = records.map((r) => {
    const inputCny = toCny(r.input, r.currency, usdCny);
    const outputCny = toCny(r.output, r.currency, usdCny);
    const blended =
      r.billingMode === 'package'
        ? packageBlended(r.packageQuota, toCny(r.packagePrice, r.currency, usdCny))
        : blendedPrice(inputCny, outputCny);
    return { r, blended };
  });

  // 第二遍：确定每个模型的官方基准价
  const officialMap = new Map<string, number>();
  for (const { r, blended } of prelim) {
    if (!officialChannelIds.has(r.channelId)) continue;
    if (r.billingMode !== 'payg') continue;
    if (blended == null) continue;
    if (!isStandardTier(r)) continue;
    const prev = officialMap.get(r.modelId);
    if (prev == null || blended < prev) officialMap.set(r.modelId, blended);
  }

  // 第三遍：正式归一化
  return prelim.map(({ r }) =>
    normalizePrice(r, usdCny, officialMap, officialChannelIds.has(r.channelId))
  );
}

/**
 * 按模型聚合 —— 「模型是主键，渠道是维度」的直接落点。
 */
export function aggregateByModel(
  models: Model[],
  prices: NormalizedPrice[],
  channels: Channel[],
  intelligence: IntelligenceScore[],
  scores: Score[]
): ModelAggregate[] {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  const intelMap = new Map(intelligence.map((i) => [i.modelId, i]));

  return models
    .map((model) => {
      const modelPrices = prices.filter((p) => p.modelId === model.id);
      const paygPrices = modelPrices
        .filter((p) => p.billingMode === 'payg')
        .sort((a, b) => (a.blendedCny ?? Infinity) - (b.blendedCny ?? Infinity));
      const packagePrices = modelPrices
        .filter((p) => p.billingMode === 'package')
        .sort((a, b) => (a.packagePriceCny ?? Infinity) - (b.packagePriceCny ?? Infinity));

      // 官方基准价
      const officialRow = paygPrices.find(
        (p) =>
          channelMap.get(p.channelId)?.type === 'official' &&
          p.premiumRate === 0 &&
          isStandardTier(p)
      );
      const officialBlendedCny = officialRow?.blendedCny ?? null;

      // 云厂商均价 —— 矩阵 X 轴口径
      const cloudRows = paygPrices.filter((p) => {
        const t = channelMap.get(p.channelId)?.type;
        return t === 'cloud' && p.blendedCny != null && isStandardTier(p);
      });
      const cloudAvgCny = cloudRows.length
        ? round2(
            cloudRows.reduce((a, r) => a + (r.blendedCny ?? 0), 0) / cloudRows.length
          )
        : null;

      /*
       * 全渠道最低：只取标准档。
       * 若把批量推理/闲时/低优等折扣档算进来，会得出「全网最低 ¥0.75」
       * 这类不可复现的价格，误导性远大于参考价值。
       */
      const stdRows = paygPrices.filter((p) => p.blendedCny != null && isStandardTier(p));
      const withBlend = stdRows.length ? stdRows : paygPrices.filter((p) => p.blendedCny != null);
      const lowest = withBlend.length ? withBlend[0] : null;
      const highest = withBlend.length ? withBlend[withBlend.length - 1] : null;

      /*
       * 渠道价差倍数 —— 最高标准档 ÷ 最低标准档。
       * 只有一家渠道报价时是 1.0×（不构成价差，但如实显示，
       * 比显示「—」让人猜要好）。
       */
      const priceSpread =
        lowest?.blendedCny != null && highest?.blendedCny != null && lowest.blendedCny > 0
          ? round2(highest.blendedCny / lowest.blendedCny)
          : null;

      return {
        model,
        paygPrices,
        packagePrices,
        officialBlendedCny,
        cloudAvgCny,
        cloudCount: cloudRows.length,
        lowestBlendedCny: lowest?.blendedCny ?? null,
        highestBlendedCny: highest?.blendedCny ?? null,
        priceSpread,
        lowestChannelName: lowest ? (channelMap.get(lowest.channelId)?.name ?? null) : null,
        intelligence: intelMap.get(model.id) ?? null,
        scores: scores.filter((s) => s.modelId === model.id),
      };
    })
    .filter((agg) => agg.paygPrices.length > 0 || agg.packagePrices.length > 0);
}

/**
 * 按渠道类型分组（模型详情页报价表的 4 类分隔带）
 */
export function groupByChannelType(
  prices: NormalizedPrice[],
  channels: Channel[]
): Array<{ type: (typeof CHANNEL_TYPE_ORDER)[number]; rows: NormalizedPrice[] }> {
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  return CHANNEL_TYPE_ORDER.map((type) => ({
    type,
    rows: prices.filter((p) => channelMap.get(p.channelId)?.type === type),
  })).filter((g) => g.rows.length > 0);
}
