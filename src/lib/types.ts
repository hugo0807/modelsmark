/**
 * ModelsMark 核心数据类型定义
 *
 * 设计原则（架构已冻结，2026-10-27）：
 * 1. 【模型是主键，渠道是维度】所有价格记录以 modelId 为聚合根，渠道只是同一模型的不同售卖路径
 * 2. 价格一律以「每百万 token」存储，展示层不做重复换算
 * 3. 币种保留原始计价币种（CNY / USD），换算在标准化层完成，原始值同时保留
 * 4. 计费档位（峰谷、长上下文、批量）用 tier 表达，不做数值展开
 * 5. 【铁律】任何一条价格记录都必须能追溯到 sourceUrl + fetchedAt + evidence 锚点
 */

// ───────────────────────────────────────────
// 基础枚举
// ───────────────────────────────────────────

/** 计价币种。国内模型固定 CNY，海外模型固定 USD */
export type Currency = 'CNY' | 'USD';

/** 归属地。用于前端配色与筛选 */
export type Origin = 'domestic' | 'overseas';

/**
 * 渠道类型 —— 四分类，架构已冻结
 * - official:  模型厂商官方直售（DeepSeek 官方、OpenAI 官方）
 * - cloud:     云厂商转售（阿里云百炼、火山方舟、腾讯云 TokenHub、百度千帆、华为云 ModelArts）
 * - carrier:   运营商（移动云、天翼云·息壤、联通云）
 * - third:     第三方 Token Hub（硅基流动、七牛云、无问芯穹）
 */
export type ChannelType = 'official' | 'cloud' | 'carrier' | 'third';

/** 渠道类型的中文标签与展示顺序（模型详情页报价表按此顺序分隔） */
export const CHANNEL_TYPE_ORDER: ChannelType[] = ['official', 'cloud', 'carrier', 'third'];

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  official: '官方直售',
  cloud: '云厂商',
  carrier: '运营商',
  third: '第三方 Token Hub',
};

/** 渠道类型的一句话说明，展示在分隔带上 */
export const CHANNEL_TYPE_DESC: Record<ChannelType, string> = {
  official: '模型厂商第一方直销，价格即官方刊例价',
  cloud: '云厂商以自有平台转售模型，常见折扣或买赠',
  carrier: '运营商政企云转售，绑定专线与合规方案',
  third: '第三方模型聚合平台，主打低价与统一网关',
};

/**
 * 计费模式
 * - payg:    按量计费，单价随调用量线性累计
 * - package: 套餐/资源包，预付额度换取折扣
 */
export type BillingMode = 'payg' | 'package';

/**
 * 套餐额度的口径 —— 决定套餐如何折算单价
 * - tokens:  按 token 额度计（Token Plan / 资源包），可直接折 ¥/M tokens
 * - calls:   按调用次数计（Agent Plan），只能折 ¥/次
 * - mixed:   混合口径（次数 + token 额度并存），不可直接折算
 */
/**
 * 套餐额度口径
 * - tokens：按 token 数计（如 Token Plan 个人版）
 * - calls：按调用次数计（如 Agent Plan）
 * - mixed：按 credits / 点数等非 token 单位计（如联通云团队版 Token Plan）
 * - credits：显式的 credits 口径（团队版按 credits 结算）
 */
export type QuotaUnit = 'tokens' | 'calls' | 'mixed' | 'credits';

/**
 * 价格档位条件。null 表示无附加条件（标准档）
 * - peak / offpeak: 时段定价（DeepSeek、联通云、硅基流动）
 * - long_context:   长上下文档位（输入超过阈值后单价跳变）
 * - batch:          批量推理折扣档
 */
export type TierCondition =
  | { kind: 'none' }
  | { kind: 'peak'; window: string; note: string }
  | { kind: 'offpeak'; window: string; note: string }
  | { kind: 'long_context'; threshold: number; unit: 'token'; note: string }
  | { kind: 'batch'; note: string };

// ───────────────────────────────────────────
// 证据
// ───────────────────────────────────────────

/**
 * 证据锚点 —— 接地不变量的载体。
 * 每条价格记录都必须挂一个 evidence，指向抓取到的官方页面原文或公开 API 响应。
 */
export interface Evidence {
  /** 官方页面 / 公开 API 的 URL */
  sourceUrl: string;
  /** 抓取时间 ISO */
  fetchedAt: string;
  /**
   * 证据原文片段：官方页面里出现该价格的那段文字，或 API 返回的原始字段。
   * 用于人工核验与自动接地校验——页面上找不到这段文字 = 数据不可信。
   */
  quote: string;
  /** 页面自身的更新时间戳（若官方提供） */
  pageUpdatedAt?: string | null;
}

// ───────────────────────────────────────────
// 模型
// ───────────────────────────────────────────

export interface Model {
  /** 全局唯一 slug，如 kimi-k3-1-pro */
  id: string;
  /** 官方展示名，如 Kimi K3.1 Pro */
  name: string;
  /** 厂商名，如 月之暗面 */
  vendor: string;
  /** 归属地 */
  origin: Origin;
  /** 是否开放权重 */
  openWeights: boolean;
  /** 上下文窗口（token 数） */
  contextWindow: number | null;
  /** 最大输出（token 数） */
  maxOutput: number | null;
  /** 发布时间 ISO 日期 */
  releasedAt: string | null;
  /** 总参数（如 2.8T），未知为 null */
  params: string | null;
  /** 激活参数（如 104B），未知为 null */
  activeParams: string | null;
  /** 厂商定价页 URL */
  pricingUrl: string | null;
  /** 官方文档 URL */
  docsUrl: string | null;
}

// ───────────────────────────────────────────
// 渠道
// ───────────────────────────────────────────

export interface Channel {
  /** 唯一 slug，如 aliyun-bailian */
  id: string;
  /** 渠道名，如 阿里云百炼 */
  name: string;
  /** 渠道类型（四分类） */
  type: ChannelType;
  /** 所属公司/集团，用于「同集团跨云」聚合 */
  group: string;
  /** 渠道主页 */
  url: string;
  /** 是否在境内提供（影响合规提示） */
  domestic: boolean;
}

// ───────────────────────────────────────────
// 价格
// ───────────────────────────────────────────

/**
 * 一条价格记录 = 某模型在某渠道某档位下的单价
 * 按量价和套餐价共用此结构，用 billingMode 区分
 */
export interface PriceRecord {
  /** 模型 id（全局主键） */
  modelId: string;
  /** 渠道 id */
  channelId: string;
  /** 计费模式 */
  billingMode: BillingMode;
  /** 原始计价币种 */
  currency: Currency;
  /** 输入单价（每百万 token），未命中缓存 */
  input: number | null;
  /** 缓存命中/读取单价（每百万 token） */
  cacheRead: number | null;
  /** 缓存写入单价（每百万 token），部分厂商单独收费 */
  cacheWrite: number | null;
  /** 输出单价（每百万 token） */
  output: number | null;
  /** 档位条件 */
  tier: TierCondition;
  /** 档位标签，如「空闲时段」「≤32K」 */
  tierLabel: string | null;
  /** 适用模型名（当渠道下模型名与全局 slug 不同时） */
  vendorModelId: string | null;
  /** 是否为促销/限时价 */
  promotional: boolean;
  /** 促销说明，如「至 2026-12-31」 */
  promoNote: string | null;
  /** 备注：口径特殊说明 */
  note: string | null;
  /** 证据锚点 */
  evidence: Evidence;

  // ── 以下为套餐价专有字段 ──

  /** 套餐额度 */
  packageQuota: number | null;
  /** 额度口径 */
  packageQuotaUnit: QuotaUnit;
  /** 套餐周期，如「1 个月」 */
  packagePeriod: string | null;
  /** 套餐总价（原始币种） */
  packagePrice: number | null;
  /** 套餐档位名，如「基础版」「旗舰版」 */
  packageTierName: string | null;
  /** 输入输出是否合并抵扣 */
  packageMerged: boolean | null;
  /** 是否需手动激活 */
  packageManualActivation: boolean | null;
  /** 按次数计的套餐：单次调用额度数 */
  packageCalls: number | null;
  /** 套餐包含的能力描述 */
  packageIncludes: string | null;
}

/**
 * 标准化后的价格视图：已换算成人民币，含衍生指标
 * 前端直接消费此结构，无需任何计算
 */
export interface NormalizedPrice {
  modelId: string;
  channelId: string;
  billingMode: BillingMode;
  /** 原始币种 */
  currency: Currency;
  /** 原始单价 */
  inputNative: number | null;
  cacheReadNative: number | null;
  cacheWriteNative: number | null;
  outputNative: number | null;
  /** 折算人民币输入单价 */
  inputCny: number | null;
  cacheReadCny: number | null;
  cacheWriteCny: number | null;
  outputCny: number | null;
  /**
   * 3:1 输入输出混合价（每百万 token，人民币）
   * 公式：(3 × input + 1 × output) / 4
   * 这是横向比价的主指标
   */
  blendedCny: number | null;
  /** 相对官方价的溢价率（0.26 表示贵 26%），官方渠道为 0 */
  premiumRate: number | null;
  tier: TierCondition;
  tierLabel: string | null;
  /** 证据锚点（随记录透传，供前端做来源链接） */
  evidence: Evidence;
  promotional: boolean;
  promoNote: string | null;
  note: string | null;
  packageQuota?: number | null;
  packageQuotaUnit?: QuotaUnit;
  packagePeriod?: string | null;
  packagePriceCny?: number | null;
  packageTierName?: string | null;
  packageMerged?: boolean | null;
  packageManualActivation?: boolean | null;
  packageCalls?: number | null;
  packageIncludes?: string | null;
  /** 套餐折算的单价（每百万 token，人民币）——仅 token 口径可算 */
  packageBlendedCny?: number | null;
  /** 套餐折算的单价（每次调用，人民币）——仅 calls 口径可算 */
  packagePerCallCny?: number | null;
}

// ───────────────────────────────────────────
// 模型聚合视图（模型是主键的直接体现）
// ───────────────────────────────────────────

/**
 * 模型维度的聚合结果 —— 首页矩阵与模型详情页的直接输入。
 * 一个模型 = 一条记录，内含它分布在各渠道的价格。
 */
export interface ModelAggregate {
  model: Model;
  /** 该模型所有渠道的按量价（已按混合价升序） */
  paygPrices: NormalizedPrice[];
  /** 该模型所有渠道的套餐价 */
  packagePrices: NormalizedPrice[];
  /** 官方渠道的混合价（对比基准），无官方价则为 null */
  officialBlendedCny: number | null;
  /** 云厂商渠道的混合价均值（矩阵 X 轴口径） */
  cloudAvgCny: number | null;
  /** 参与云厂商均值的渠道数 */
  cloudCount: number;
  /** 全渠道最低混合价 */
  lowestBlendedCny: number | null;
  /** 全渠道最高混合价（标准档口径） */
  highestBlendedCny: number | null;
  /** 渠道价差倍数 = 最高 ÷ 最低 */
  priceSpread: number | null;
  /** 达成最低价的渠道名 */
  lowestChannelName: string | null;
  /** 智能指数 */
  intelligence: IntelligenceScore | null;
  /** 基准分数 */
  scores: Score[];
}

// ───────────────────────────────────────────
// 基准与分数
// ───────────────────────────────────────────

/** 能力域分类 */
export type BenchmarkCategory =
  | 'coding'
  | 'agent'
  | 'knowledge'
  | 'document'
  | 'chart'
  | 'industry';

export interface Benchmark {
  /** slug，如 terminal-bench-4 */
  id: string;
  /** 官方名，如 Terminal-Bench 4.0 */
  name: string;
  /** 能力域 */
  category: BenchmarkCategory;
  /** 一句话说明：测什么 */
  summary: string;
  /** 通俗解释：为什么重要 */
  explanation: string;
  /** 什么时候该看它 */
  useCase: string;
  /** 计分方式说明 */
  scoring: string;
  /** 分数量纲提示，如「百分比」或「Elo」 */
  scale: string;
  /** 是否为厂商自建基准 */
  vendorOwned: boolean;
  /** 基准官方链接 */
  url: string | null;
}

export interface Score {
  modelId: string;
  benchmarkId: string;
  /** 原始分数 */
  value: number;
  /** 推理档位，如 max / xhigh / high */
  effort: string | null;
  /** 该分数是否包含 fallback 调用 */
  includesFallback: boolean | null;
  /** 该分数是否计入内容安全拦截 */
  includesCyberguards: boolean | null;
  /** 评测来源机构，如 Artificial Analysis */
  source: string;
  /** 来源链接 */
  sourceUrl: string | null;
  /** 评测日期 */
  measuredAt: string | null;
}

/** 综合智能指数（Artificial Analysis Intelligence Index） */
export interface IntelligenceScore {
  modelId: string;
  /** 综合分 */
  index: number;
  /** 排名 */
  rank: number | null;
  /** 每完成一项智能指数任务的成本（美元） */
  costPerTaskUsd: number | null;
  /** 输出速度（token/秒） */
  outputTokensPerSec: number | null;
  source: string;
  measuredAt: string | null;
}

// ───────────────────────────────────────────
// 汇率与快照
// ───────────────────────────────────────────

export interface FxRate {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 1 USD = ? CNY */
  usdCny: number;
  /** 来源，如 中国人民银行授权中国外汇交易中心公布 */
  source: string;
  sourceUrl: string | null;
}

export interface Snapshot {
  /** 快照 ID，如 2026-W43 */
  id: string;
  /** 快照日期 */
  date: string;
  /** 本次使用的汇率 */
  usdCny: number;
  /** 各渠道抓取状态 */
  channelStatus: Record<string, ChannelStatus>;
  /** 记录条数统计 */
  counts: {
    models: number;
    channels: number;
    paygPrices: number;
    packagePrices: number;
    scores: number;
  };
  /** 构建时间 */
  builtAt: string;
}

export interface ChannelStatus {
  channelId: string;
  /** ok = 抓取成功；failed = 失败；stale = 沿用上次数据 */
  status: 'ok' | 'failed' | 'stale';
  /** 该渠道数据的实际抓取时间（stale 时为上次成功时间） */
  dataAsOf: string;
  /** 抓到的条数 */
  records: number;
  /** 失败原因 */
  error: string | null;
  /** 与上次相比的价格变动条数 */
  changes: number;
}

/** 两周期间的价格差分 */
export interface PriceChange {
  modelId: string;
  channelId: string;
  billingMode: BillingMode;
  /** 变动类型 */
  kind: 'price' | 'added' | 'removed' | 'promo_started' | 'promo_ended';
  /** 变动前价格（人民币混合价） */
  fromCny: number | null;
  /** 变动后价格（人民币混合价） */
  toCny: number | null;
  /** 变动幅度比例，0.5 表示涨 50% */
  delta: number | null;
  tierLabel: string | null;
}

/** 首页变动模块直接消费的结构（与 changes.json 对应） */
export interface ChangeEntry {
  modelId: string;
  channelId: string;
  billingMode: BillingMode;
  kind: 'price' | 'added' | 'removed' | 'promo_started' | 'promo_ended';
  fromCny: number | null;
  toCny: number | null;
  delta: number | null;
  tierLabel: string | null;
}

// ───────────────────────────────────────────
// 前端消费的顶层数据集
// ───────────────────────────────────────────

export interface Dataset {
  /** 数据快照 ID */
  snapshotId: string;
  /** 数据更新日期 */
  updatedAt: string;
  /** 本期汇率 */
  usdCny: number;
  models: Model[];
  channels: Channel[];
  prices: NormalizedPrice[];
  benchmarks: Benchmark[];
  scores: Score[];
  intelligence: IntelligenceScore[];
  changes: PriceChange[];
  channelStatus: Record<string, ChannelStatus>;
  /** 按模型聚合的结果（模型为主键的落点） */
  aggregates: ModelAggregate[];
}
