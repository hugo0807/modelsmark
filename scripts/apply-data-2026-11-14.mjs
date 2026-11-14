/**
 * ModelsMark 本地数据更新 —— 2026-11-14
 *
 * 范围：Anthropic / OpenAI / Google / 百度 四家的新模型性能与价格。
 *
 * 【接地不变量】每个数字都必须能追到公开来源，来源 URL 与原文锚点写入
 * evidence.sourceUrl / evidence.quote；二手来源在 note 里显式标注。
 * 未公开 / 未评测的数据一律填 null 并写 note，绝不用推测值占位。
 *
 * 一手来源：
 *  - Anthropic 官方定价表  https://platform.claude.com/docs/en/about-claude/pricing
 *  - Anthropic 发布说明    https://platform.claude.com/docs/zh-CN/release-notes/overview
 *  - Google 官方定价页    https://ai.google.dev/gemini-api/docs/pricing
 *  - 百度千帆模型服务计费 https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya （页面更新时间 2026-11-11）
 *  - AA Intelligence Index v5 榜单（Updated 2026-11-13）
 *                          https://aiverso.net/compare/artificial-analysis-intelligence-index-v5
 *  - AA Gemini 4 Carbon 发布页 https://artificialanalysis.ai/models/releases/gemini-4-carbon
 *  - 人民币汇率中间价 6.7152 @ 2026-11-13 https://www.chinamoney.com.cn/chinese/bkccpr/
 * 二手来源（仅用于官方页返回 403 的 OpenAI 一项，已交叉核对两家）：
 *  - https://www.vantasoft.com/resources/llm-prices （CC BY 4.0，标注 Checked November 11, 2026）
 *  - https://aipricing.guru/openai-pricing （Last synced 2026-11-11）
 *  - https://benchlm.ai/openai/api-pricing （November 2026）
 *
 * 用法：node scripts/apply-data-2026-11-14.mjs
 * 幂等：按 id 覆盖，不删除任何既有记录，可重复执行。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const AS_OF = new Date().toISOString();
const TODAY = AS_OF.slice(0, 10);

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const write = (f, v) =>
  fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + '\n', 'utf8');

/** 按 key 覆盖式 upsert，保留原有顺序，新条目追加在末尾 */
function upsert(list, key, rows) {
  const idx = new Map(list.map((x, i) => [x[key], i]));
  for (const row of rows) {
    const i = idx.get(row[key]);
    if (i == null) {
      idx.set(row[key], list.length);
      list.push(row);
    } else {
      list[i] = { ...list[i], ...row };
    }
  }
  return list;
}

/** 价格记录的复合键：模型 + 渠道 + 档位标签 */
const priceKey = (p) => `${p.modelId}|${p.channelId}|${p.tierLabel ?? ''}`;
function upsertPrices(list, rows) {
  const idx = new Map(list.map((x, i) => [priceKey(x), i]));
  for (const row of rows) {
    const k = priceKey(row);
    const i = idx.get(k);
    if (i == null) {
      idx.set(k, list.length);
      list.push(row);
    } else {
      list[i] = row;
    }
  }
  return list;
}

const scoreKey = (s) => `${s.modelId}|${s.benchmarkId}`;
function upsertScores(list, rows) {
  const idx = new Map(list.map((x, i) => [scoreKey(x), i]));
  for (const row of rows) {
    const k = scoreKey(row);
    const i = idx.get(k);
    if (i == null) {
      idx.set(k, list.length);
      list.push(row);
    } else {
      list[i] = { ...list[i], ...row };
    }
  }
  return list;
}

// ───────────────────────────────────────────
// 模型元数据
// ───────────────────────────────────────────
const M = (o) => ({
  id: o.id,
  name: o.name,
  vendor: o.vendor,
  origin: o.origin,
  openWeights: o.openWeights ?? false,
  contextWindow: o.contextWindow ?? null,
  maxOutput: o.maxOutput ?? null,
  releasedAt: o.releasedAt ?? null,
  params: o.params ?? null,
  activeParams: o.activeParams ?? null,
  pricingUrl: o.pricingUrl ?? null,
  docsUrl: o.docsUrl ?? null,
});

const models = read('seeds/models.json');
const ANTHROPIC_PRICING = 'https://platform.claude.com/docs/en/about-claude/pricing';
const GOOGLE_PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';
const BAIDU_PRICING = 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya';

upsert(models, 'id', [
  M({
    id: 'claude-fable-5-2',
    name: 'Claude Fable 5.2',
    vendor: 'Anthropic',
    origin: 'overseas',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    releasedAt: '2026-11-09',
    pricingUrl: ANTHROPIC_PRICING,
    docsUrl: 'https://platform.claude.com/docs/zh-CN/release-notes/overview',
  }),
  M({
    id: 'claude-mythos-5-2',
    name: 'Claude Mythos 5.2',
    vendor: 'Anthropic',
    origin: 'overseas',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    releasedAt: '2026-11-09',
    pricingUrl: ANTHROPIC_PRICING,
    docsUrl: 'https://platform.claude.com/docs/zh-CN/release-notes/overview',
  }),
  M({
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    vendor: 'Anthropic',
    origin: 'overseas',
    // 官方定价页只按「prompts ≤100K / >100K」分档，未公布总上下文窗口，故留空
    contextWindow: null,
    pricingUrl: ANTHROPIC_PRICING,
    docsUrl: ANTHROPIC_PRICING,
  }),
  M({
    id: 'gpt-6-1-terra',
    name: 'GPT-6.1 Terra',
    vendor: 'OpenAI',
    origin: 'overseas',
    contextWindow: 1_050_000,
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
    docsUrl: 'https://developers.openai.com/api/docs/models',
  }),
  M({
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    vendor: 'Google',
    origin: 'overseas',
    contextWindow: 1_000_000,
    pricingUrl: GOOGLE_PRICING,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  }),
  M({
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    vendor: 'Google',
    origin: 'overseas',
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    releasedAt: '2026-11-12',
    pricingUrl: GOOGLE_PRICING,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  }),
  M({
    id: 'ernie-5-5-flash-preview',
    name: '文心 5.5 Flash Preview（ERNIE-5.5-Flash-Preview）',
    vendor: '百度',
    origin: 'domestic',
    // 百度称权重将于 2026-11-25 开源，当前尚未发布，故 openWeights=false
    openWeights: false,
    contextWindow: 1_000_000,
    releasedAt: '2026-11-11',
    params: '280B',
    activeParams: '14B',
    pricingUrl: BAIDU_PRICING,
    docsUrl: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya',
  }),
]);

// 既有 Gemini 4 Argon 补齐上下文（Google 官方 1M）；此前 price 记录为 0 条
const argon = models.find((m) => m.id === 'gemini-4-argon');
if (argon) {
  argon.contextWindow = 1_000_000;
  argon.pricingUrl = GOOGLE_PRICING;
}

// ───────────────────────────────────────────
// 价格记录
// ───────────────────────────────────────────
const P = (o) => ({
  modelId: o.modelId,
  channelId: o.channelId,
  billingMode: 'payg',
  currency: o.currency,
  input: o.input,
  cacheRead: o.cacheRead ?? null,
  cacheWrite: o.cacheWrite ?? null,
  output: o.output,
  tier: o.tier ?? { kind: 'none' },
  tierLabel: o.tierLabel ?? null,
  vendorModelId: o.vendorModelId ?? null,
  promotional: o.promotional ?? false,
  promoNote: o.promoNote ?? null,
  note: o.note ?? null,
  evidence: {
    sourceUrl: o.sourceUrl,
    fetchedAt: AS_OF,
    quote: o.quote,
    pageUpdatedAt: o.pageUpdatedAt ?? null,
  },
  packageQuota: null,
  packageQuotaUnit: 'mixed',
  packagePeriod: null,
  packagePrice: null,
  packageTierName: null,
  packageMerged: null,
  packageManualActivation: null,
  packageCalls: null,
  packageIncludes: null,
});

const ANTHROPIC_QUOTE_52 =
  'Claude Fable 5.2 | $8 / MTok | $10 / MTok | $16 / MTok | $0.20 / MTok | $40 / MTok；' +
  'Claude Mythos 5.2 (limited availability) | $8 / MTok | $10 / MTok | $16 / MTok | $0.20 / MTok | $40 / MTok' +
  '（表头：Base input tokens / 5m cache writes / 1h cache writes / Cache hits and refreshes / Output tokens）';
const GOOGLE_QUOTE_CARBON =
  'Gemini 4 Carbon … Input price 2.00 through November 30, 2026. 4.00 starting December 1, 2026. ' +
  'Output price (including thinking tokens) 10.00 through November 30, 2026. 20.00 starting December 1, 2026. ' +
  'Context caching price 0.10 through November 30, 2026. 0.20 starting December 1, 2026. ' +
  'Implicit caching only (explicit caching is not supported).';
const GOOGLE_QUOTE_ARGON =
  'Gemini 4 Argon … Input price 2.00 through November 30, 2026. 4.00 starting December 1, 2026. ' +
  'Output price (including thinking tokens) 10.00 through November 30, 2026. 20.00 starting December 1, 2026. ' +
  'Context caching price 0.10 through November 30, 2026. 0.20 starting December 1, 2026. ' +
  'Implicit caching only (explicit caching is not supported).';
const GOOGLE_QUOTE_HYDROGEN =
  'Gemini 4 Hydrogen … Input price 1.50. Output price (including thinking tokens) 7.50. ' +
  'Context caching price 0.075. Implicit caching only (explicit caching is not supported).';
const OPENAI_TERRA_QUOTE =
  'GPT-6.1 Terra OpenAI $1.00 $0.05 $5.00 $1.25 (30 min) $2.50 (12 hr) ' +
  'Over 272K tokens: $2.00 in, $7.50 out — Current LLM API prices by model, ' +
  'checked November 11, 2026 (VantaSoft open data, CC BY 4.0)';
const BAIDU_QUOTE =
  'ERNIE-5.5-Flash / ERNIE-5.5-Flash-Preview 推理服务：' +
  '输入(高峰时段:8:00-22:00) 活动价:0.001 原价:0.002 元/千tokens；' +
  '命中缓存(高峰时段:8:00-22:00) 活动价:0.0001 原价:0.0002；' +
  '输出(高峰时段:8:00-22:00) 活动价:0.004 原价:0.008；' +
  '输入(空闲时段:22:00-次日8:00) 活动价:0.0005 原价:0.001；' +
  '命中缓存(空闲时段:22:00-次日8:00) 活动价:0.00005 原价:0.0001；' +
  '输出(空闲时段:22:00-次日8:00) 活动价:0.002 原价:0.004';

const prices = read('prices.json');
const pricesBefore = prices.length;
upsertPrices(prices, [
  // ── Anthropic ──
  P({
    modelId: 'claude-fable-5-2', channelId: 'anthropic', currency: 'USD',
    input: 8, cacheRead: 0.2, cacheWrite: 10, output: 40,
    vendorModelId: 'claude-fable-5-2',
    sourceUrl: ANTHROPIC_PRICING, quote: ANTHROPIC_QUOTE_52,
    note:
      '官方定价表口径：cacheWrite 记 5m cache writes $10/MTok，1h cache writes 为 $16/MTok；' +
      'cache hits $0.20/MTok = 输入价的 0.025x。相比 Fable 5.1（$10/$50）降价 20%。' +
      '1M 上下文、128K 最大输出、始终开启自适应思考（见 ' + 'https://platform.claude.com/docs/zh-CN/release-notes/overview' + '）。' +
      '官方另提供可选「极速模式」（最高 2.5 倍速，媒体报道 $16/$80），属溢价档，本表未收录。',
  }),
  P({
    modelId: 'claude-mythos-5-2', channelId: 'anthropic', currency: 'USD',
    input: 8, cacheRead: 0.2, cacheWrite: 10, output: 40,
    vendorModelId: 'claude-mythos-5-2',
    sourceUrl: ANTHROPIC_PRICING, quote: ANTHROPIC_QUOTE_52,
    note:
      '与 Claude Fable 5.2 为同一底层模型，差别仅在安全防护与开放权限；' +
      '仅向通过 Anthropic Cyber / Life Sciences 验证计划的组织开放（limited availability）。' +
      'cacheWrite 记 5m 档 $10，1h 档 $16。',
  }),
  P({
    modelId: 'claude-haiku-5-5', channelId: 'anthropic', currency: 'USD',
    input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5,
    tierLabel: '≤100K 输入', vendorModelId: 'claude-haiku-5-5',
    sourceUrl: ANTHROPIC_PRICING,
    quote:
      'Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | ' +
      '$0.20 / MTok | $0.01 / MTok | $0.50 / MTok',
    note: '官方按提示词长度分档。cacheWrite 记 5m 档 $0.125，1h 档 $0.20。>100K 档另列一条。',
  }),
  P({
    modelId: 'claude-haiku-5-5', channelId: 'anthropic', currency: 'USD',
    input: 0.5, cacheRead: 0.05, cacheWrite: 0.625, output: 2.5,
    tier: { kind: 'long_context', threshold: 100_000, unit: 'token', note: '官网原文：for prompts over 100,000 tokens' },
    tierLabel: '>100K 输入', vendorModelId: 'claude-haiku-5-5',
    sourceUrl: ANTHROPIC_PRICING,
    quote:
      'Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | ' +
      '$1 / MTok | $0.05 / MTok | $2.50 / MTok',
    note: '长提示词溢价档，不参与标准档均价与官方基准价计算。',
  }),

  // ── Google ──
  P({
    modelId: 'gemini-4-carbon', channelId: 'google-ai-studio', currency: 'USD',
    input: 2, cacheRead: 0.1, cacheWrite: null, output: 10,
    vendorModelId: 'gemini-4-carbon',
    promotional: true, promoNote: '首发优惠价，至 2026-11-30；12/1 起 $4/$20',
    sourceUrl: GOOGLE_PRICING, quote: GOOGLE_QUOTE_CARBON,
    note:
      '输出价含 thinking tokens。官方明确仅支持隐式缓存（explicit caching is not supported），' +
      '故无缓存写入费，cacheWrite 记 null。自 2026-12-01 起涨至输入 $4、输出 $20、缓存 $0.20。' +
      'Batch API 官方标注 50% 折扣，本表未展开。',
  }),
  P({
    modelId: 'gemini-4-argon', channelId: 'google-ai-studio', currency: 'USD',
    input: 2, cacheRead: 0.1, cacheWrite: null, output: 10,
    vendorModelId: 'gemini-4-argon',
    promotional: true, promoNote: '首发优惠价，至 2026-11-30；12/1 起 $4/$20',
    sourceUrl: GOOGLE_PRICING, quote: GOOGLE_QUOTE_ARGON,
    note:
      '补齐此前该模型 0 条报价的缺口。输出价含 thinking tokens；仅隐式缓存，无缓存写入费。' +
      '自 2026-12-01 起涨至输入 $4、输出 $20、缓存 $0.20。',
  }),
  P({
    modelId: 'gemini-4-hydrogen', channelId: 'google-ai-studio', currency: 'USD',
    input: 1.5, cacheRead: 0.075, cacheWrite: null, output: 7.5,
    vendorModelId: 'gemini-4-hydrogen',
    sourceUrl: GOOGLE_PRICING, quote: GOOGLE_QUOTE_HYDROGEN,
    note:
      '2026-11-12 GA，官方称缓存价为输入价的 95% 折扣。仅隐式缓存，无缓存写入费。' +
      '官方另列 Batch/Flex 五折档（$0.75/$3.75）与 Priority 档（$2.70/$13.50），本表未展开。',
  }),

  // ── OpenAI ──
  P({
    modelId: 'gpt-6-1-terra', channelId: 'openai', currency: 'USD',
    input: 1, cacheRead: 0.05, cacheWrite: 1.25, output: 5,
    vendorModelId: 'gpt-6.1-terra',
    sourceUrl: 'https://www.vantasoft.com/resources/llm-prices', quote: OPENAI_TERRA_QUOTE,
    note:
      '二手来源说明：本次官方定价页 https://developers.openai.com/api/docs/pricing 返回 403，' +
      '无法直连复核，故采用 VantaSoft 公开价格数据集（CC BY 4.0，标注 Checked November 11, 2026，逐周核对厂商定价页），' +
      '并与 aipricing.guru（Last synced 2026-11-11）、benchlm.ai（November 2026）交叉核对，三者 $1/$0.05/$5 一致。' +
      'cacheWrite 记 30 分钟档 $1.25，12 小时档为 $2.50。Batch API 五折。',
  }),
  P({
    modelId: 'gpt-6-1-terra', channelId: 'openai', currency: 'USD',
    input: 2, cacheRead: null, cacheWrite: null, output: 7.5,
    tier: { kind: 'long_context', threshold: 272_000, unit: 'token', note: '官网口径：Over 272K tokens' },
    tierLabel: '>272K 输入', vendorModelId: 'gpt-6.1-terra',
    sourceUrl: 'https://www.vantasoft.com/resources/llm-prices', quote: OPENAI_TERRA_QUOTE,
    note:
      '长上下文溢价档只公开输入 $2 / 输出 $7.50，未单列缓存价，故 cacheRead / cacheWrite 记 null（不推测）。' +
      '来源同标准档。',
  }),

  // ── 百度千帆 ──
  P({
    modelId: 'ernie-5-5-flash-preview', channelId: 'baidu-qianfan', currency: 'CNY',
    input: 2, cacheRead: 0.2, cacheWrite: null, output: 8,
    tier: { kind: 'peak', window: '8:00-22:00', note: '官网口径：高峰时段 8:00-22:00' },
    tierLabel: '高峰时段（原价）', vendorModelId: 'ernie-5.5-flash-preview',
    sourceUrl: BAIDU_PRICING, quote: BAIDU_QUOTE, pageUpdatedAt: '2026-11-11',
    note:
      '官网以「元/千 tokens」计价，此处 ×1000 换算为元/百万 tokens：输入 0.002、缓存命中 0.0002、输出 0.008。' +
      '官网未列缓存写入费，cacheWrite 记 null。限时五折活动价另列两条。',
  }),
  P({
    modelId: 'ernie-5-5-flash-preview', channelId: 'baidu-qianfan', currency: 'CNY',
    input: 1, cacheRead: 0.1, cacheWrite: null, output: 4,
    tierLabel: '高峰时段·限时五折',
    vendorModelId: 'ernie-5.5-flash-preview',
    promotional: true, promoNote: '限时五折，活动截止 2026-11-30 23:50',
    sourceUrl: BAIDU_PRICING, quote: BAIDU_QUOTE, pageUpdatedAt: '2026-11-11',
    note: '官网「活动价」列：输入 0.001、缓存命中 0.0001、输出 0.004 元/千 tokens（×1000 换算）。折扣档，不参与标准档均价。',
  }),
  P({
    modelId: 'ernie-5-5-flash-preview', channelId: 'baidu-qianfan', currency: 'CNY',
    input: 1, cacheRead: 0.1, cacheWrite: null, output: 4,
    tier: { kind: 'offpeak', window: '22:00-次日 8:00', note: '官网口径：空闲时段 22:00-次日 8:00' },
    tierLabel: '空闲时段（原价）', vendorModelId: 'ernie-5.5-flash-preview',
    sourceUrl: BAIDU_PRICING, quote: BAIDU_QUOTE, pageUpdatedAt: '2026-11-11',
    note: '官网「原价」列：输入 0.001、缓存命中 0.0001、输出 0.004 元/千 tokens（×1000 换算）。',
  }),
  P({
    modelId: 'ernie-5-5-flash-preview', channelId: 'baidu-qianfan', currency: 'CNY',
    input: 0.5, cacheRead: 0.05, cacheWrite: null, output: 2,
    tierLabel: '空闲时段·限时五折',
    vendorModelId: 'ernie-5.5-flash-preview',
    promotional: true, promoNote: '限时五折，活动截止 2026-11-30 23:50',
    sourceUrl: BAIDU_PRICING, quote: BAIDU_QUOTE, pageUpdatedAt: '2026-11-11',
    note: '官网「活动价」列：输入 0.0005、缓存命中 0.00005、输出 0.002 元/千 tokens（×1000 换算）。折扣档，不参与标准档均价。',
  }),
]);

// ───────────────────────────────────────────
// 智能指数（Artificial Analysis Intelligence Index v5，11-13 榜单）
// ───────────────────────────────────────────
const AA_V5 = 'Artificial Analysis Intelligence Index v5';
const AA_DATE = '2026-11-13';
const I = (o) => ({
  modelId: o.modelId,
  index: o.index ?? null,
  rank: o.rank ?? null,
  costPerTaskUsd: o.costPerTaskUsd ?? null,
  outputTokensPerSec: o.outputTokensPerSec ?? null,
  source: o.source ?? AA_V5,
  measuredAt: o.measuredAt ?? AA_DATE,
  ...(o.note ? { note: o.note } : {}),
  aaName: o.aaName,
});

const intelligence = read('seeds/intelligence.json');
upsert(intelligence, 'modelId', [
  I({ modelId: 'claude-fable-5-2', index: 65, rank: 1, costPerTaskUsd: 26.5, aaName: 'Claude Fable 5.2 (max)',
      note: 'AA v5 榜首；max effort 单任务成本约 $26.5，约为 Opus 5.5 (max) 的 2.6 倍。' }),
  I({ modelId: 'claude-mythos-5-2', aaName: 'Claude Mythos 5.2',
      note: '与 Fable 5.2 同一底层模型，仅安全策略不同；AA 未单独发布指数，此处留空以免误读为独立评测。' }),
  I({ modelId: 'gemini-4-carbon', index: 60, rank: 2, costPerTaskUsd: 7.76, outputTokensPerSec: 80, aaName: 'Gemini 4 Carbon (high)' }),
  I({ modelId: 'claude-opus-5-5', index: 59, rank: 3, costPerTaskUsd: 10.04, outputTokensPerSec: 98, aaName: 'Claude Opus 5.5 (max with fallback)',
      note: 'v5 榜单较 10-28 快照 +1（58→59）。' }),
  I({ modelId: 'gpt-6-astra', index: 57, rank: 4, costPerTaskUsd: 6.24, outputTokensPerSec: 66, aaName: 'GPT-6 Astra (max)' }),
  I({ modelId: 'gpt-6-1-sol', index: 55, rank: 5, costPerTaskUsd: 0.72, aaName: 'GPT-6.1 Sol (max)' }),
  I({ modelId: 'claude-sonnet-5-5', index: 55, rank: 6, costPerTaskUsd: 10.02, outputTokensPerSec: 138, aaName: 'Claude Sonnet 5.5 (max with fallback)',
      note: 'v5 榜单较 10-28 快照 +1（54→55）。' }),
  I({ modelId: 'gemini-4-hydrogen', index: 54, rank: 7, aaName: 'Gemini 4 Hydrogen' }),
  I({ modelId: 'gpt-6-1-terra', index: 51, rank: 8, aaName: 'GPT-6.1 Terra' }),
  I({ modelId: 'gemini-4-argon', index: 50, rank: 9, costPerTaskUsd: 3.84, outputTokensPerSec: 82, aaName: 'Gemini 4 Argon (high)' }),
  I({ modelId: 'claude-haiku-5-5', index: 36, rank: 13, aaName: 'Claude Haiku 5.5' }),
  I({ modelId: 'ernie-5-5-flash-preview', outputTokensPerSec: 200,
      source: 'Artificial Analysis（暂未收录）', measuredAt: TODAY, aaName: 'ERNIE 5.5 Flash Preview',
      note: '2026-11-11 发布，AA 智能指数尚未收录，index 留空。outputTokensPerSec=200 为百度官方披露的「每秒超过 200 tokens」，非第三方实测；官方公布的 8 项基准分数见 scores.json。' }),
]);
const fable51 = intelligence.find((x) => x.modelId === 'claude-fable-5-1');
if (fable51) fable51.note = 'AA v5（11-13）榜单未单列 Fable 5.1；本站沿用 10-28 快照的 50 分，口径可能与 v5 略有差异。';

// ───────────────────────────────────────────
// 基准定义（文心 5.5 发布图表新增 5 项）
// ───────────────────────────────────────────
const B = (o) => ({
  id: o.id, name: o.name, category: o.category, summary: o.summary,
  explanation: o.explanation, useCase: o.useCase, scoring: o.scoring,
  scale: o.scale, vendorOwned: false, url: null,
});
const benchmarks = read('seeds/benchmarks.json');
const BAIDU_MARK = '本节分数来自百度 2026-11-11 文心 5.5 Flash Preview 发布图表，为厂商自测披露，未经第三方独立复现；与站内 Artificial Analysis 口径的分数不可直接横向比较。';
upsert(benchmarks, 'id', [
  B({ id: 'deep-swe-v1-1', name: 'DeepSWE v1.1', category: 'coding',
      summary: '在真实代码库上解决需要多轮修改与验证的软件工程任务。',
      explanation: BAIDU_MARK, useCase: '对比长周期编码 Agent 的任务完成率时参考',
      scoring: '任务通过率（%）', scale: '百分比' }),
  B({ id: 'automation-bench', name: 'AutomationBench（百度发布图表口径）', category: 'agent',
      summary: '考察模型跨应用编排、调用工具完成自动化工作流的能力。',
      explanation: BAIDU_MARK + ' 注意与 Artificial Analysis 的 AutomationBench-AA 不是同一评测配置。',
      useCase: '评估企业流程自动化 Agent', scoring: '任务成功率（%）', scale: '百分比' }),
  B({ id: 'apex-agents-1-1', name: 'APEX-Agents 1.1', category: 'agent',
      summary: '高难度多步智能体任务，考察规划、工具使用与长程一致性。',
      explanation: BAIDU_MARK, useCase: '评估长程 Agent 应用', scoring: '任务成功率（%）', scale: '百分比' }),
  B({ id: 'draco', name: 'DRACO', category: 'document',
      summary: '面向密集文档与专业资料的理解、检索与综合推理。',
      explanation: BAIDU_MARK, useCase: '评估知识工作 / 深度研究场景', scoring: '得分（%）', scale: '百分比' }),
  B({ id: 'spreadsheet-bench-v2', name: 'SpreadsheetBench V2', category: 'document',
      summary: '在真实电子表格里完成公式、格式与数据分析任务。',
      explanation: BAIDU_MARK, useCase: '评估办公自动化与表格处理', scoring: '任务通过率（%）', scale: '百分比' }),
]);

// ───────────────────────────────────────────
// 基准分数
// ───────────────────────────────────────────
const S = (modelId, benchmarkId, value, source, sourceUrl, extra = {}) => ({
  modelId, benchmarkId, value,
  effort: extra.effort ?? null,
  includesFallback: null, includesCyberguards: null,
  source, sourceUrl, measuredAt: extra.measuredAt ?? '2026-11-11',
});
const BAIDU_SRC = '百度官方发布（厂商自测，未经第三方复现）';
const BAIDU_URL =
  'http://mp.weixin.qq.com/s?__biz=MjM5NzU2OTgyMg==&mid=2663222701&idx=1&sn=f1ef78cfe903f2e8f4b9f12091b42c97';
const AA_URL = 'https://artificialanalysis.ai/models/releases/gemini-4-carbon';

const scores = read('seeds/scores.json');
upsertScores(scores, [
  // 文心 5.5 Flash Preview：官方发布图表 8 项
  S('ernie-5-5-flash-preview', 'terminal-bench-4', 46.5, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'deep-swe-v1-1', 71.2, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'automation-bench', 61.9, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'apex-agents-1-1', 64.2, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'draco', 84.9, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'spreadsheet-bench-v2', 36.4, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'officeqa-pro-v2', 67.9, BAIDU_SRC, BAIDU_URL),
  S('ernie-5-5-flash-preview', 'agents-last-exam', 29.0,
    '百度官方发布（Agents\' Last Exam CLI 变体，厂商自测；与站内 AA 口径可能不同）', BAIDU_URL),
  // Claude Fable 5.2：AA v5 报告披露的三项，对齐站内既有基准 ID
  S('claude-fable-5-2', 'terminal-bench-4', 60, AA_V5 + '（max effort）', AA_URL, { effort: 'max', measuredAt: AA_DATE }),
  S('claude-fable-5-2', 'terminal-bench-science', 73, AA_V5 + '（max effort）', AA_URL, { effort: 'max', measuredAt: AA_DATE }),
  S('claude-fable-5-2', 'gdp-pdf', 24, AA_V5 + '（max effort，24% all-pass）', AA_URL, { effort: 'max', measuredAt: AA_DATE }),
  // Gemini 4 Carbon：AA v5 披露
  S('gemini-4-carbon', 'terminal-bench-4', 65, AA_V5 + '（high effort）', AA_URL, { effort: 'high', measuredAt: AA_DATE }),
]);

// ───────────────────────────────────────────
// 汇率 / 快照元信息
// ───────────────────────────────────────────
const fx = read('fx.json');
if (!fx.rates.some((r) => r.date === '2026-11-13')) {
  fx.rates.push({
    date: '2026-11-13', usdCny: 6.7152,
    source: '中国人民银行授权中国外汇交易中心公布',
    sourceUrl: 'https://www.chinamoney.com.cn/chinese/bkccpr/',
  });
  fx.rates.sort((a, b) => a.date.localeCompare(b.date));
}

const snapshot = read('snapshot.json');
snapshot.id = '2026-W46';
snapshot.date = TODAY;
snapshot.usdCny = 6.7152;
const byChannel = new Map();
for (const p of prices) byChannel.set(p.channelId, (byChannel.get(p.channelId) ?? 0) + 1);
for (const cid of ['anthropic', 'openai', 'google-ai-studio', 'baidu-qianfan']) {
  snapshot.channelStatus[cid] = {
    channelId: cid, status: 'ok', dataAsOf: AS_OF,
    records: byChannel.get(cid) ?? 0, error: null,
    changes: (snapshot.channelStatus[cid]?.changes ?? 0),
  };
}
snapshot.counts = {
  models: models.length,
  channels: read('seeds/channels.json').length,
  paygPrices: prices.filter((p) => p.billingMode === 'payg').length,
  packagePrices: prices.filter((p) => p.billingMode === 'package').length,
  scores: scores.length,
};
snapshot.builtAt = AS_OF;

// ───────────────────────────────────────────
// 落盘
// ───────────────────────────────────────────
write('seeds/models.json', models);
write('prices.json', prices);
write('seeds/intelligence.json', intelligence);
write('seeds/benchmarks.json', benchmarks);
write('seeds/scores.json', scores);
write('fx.json', fx);
write('snapshot.json', snapshot);

const addedPrices = prices.length - pricesBefore;
console.log('════════ 2026-11-14 数据更新完成 ════════');
console.log(`模型      ${models.length} 个（新增 7）`);
console.log(`价格      ${prices.length} 条（净增 ${addedPrices}）`);
console.log(`智能指数  ${intelligence.length} 条（更新/新增 12）`);
console.log(`基准定义  ${benchmarks.length} 项（新增 5）`);
console.log(`基准分数  ${scores.length} 条（新增 12）`);
console.log(`汇率      6.7152 @ 2026-11-13`);
console.log(`快照      ${snapshot.id} / ${snapshot.date}`);
console.log(`抓取时间  ${AS_OF}`);
