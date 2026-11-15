/**
 * ModelsMark 本地数据更新 —— 2026-11-15
 *
 * 范围：Gemini 4 Hydrogen 一个模型的「性能 + 价格」补全。
 *
 * 背景：11-14 入库时 Hydrogen 只有 1 条标准档价格 + 1 条智能指数，
 * 基准分数 0 条 —— 详情页没有四项基准柱图，报价表也只显示一档。
 * 11-12 Google 正式发布后，11-13 出现了完整的官方基准表与
 * Artificial Analysis 独立评测，本次一并补齐。
 *
 * 【接地不变量】每个数字都必须能在 sourceUrl 指向的页面逐字找到。
 * 官方页 ai.google.dev 与 blog.google 在国内网络不可达（WebFetch 失败），
 * 因此采用「公开媒体对官方表格 / AA 数据的逐字转录」作为证据页，
 * 并在 source 里显式标注原始出处与「二手来源 / 厂商自测」。
 *
 * ── 一手来源（原始出处，国内不可达，仅作溯源线索）──
 *  - Google 官方定价页   https://ai.google.dev/gemini-api/docs/pricing
 *  - Google 官方发布页   https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-hydrogen/
 *  - Google 官方模型页   https://ai.google.dev/gemini-api/docs/models
 *  - AA Hydrogen 评测页  https://artificialanalysis.ai/models/releases/gemini-4-hydrogen
 *
 * ── 实际取证页（本次逐字核对，写入 evidence / sourceUrl）──
 *  - 三档费率 + AA 成本/吞吐：https://iosnack.com/blog/gemini-4-hydrogen-price-benchmarks-business
 *      「TierInputOutputCached input Standard$1.50$7.50$0.075
 *        Batch or Flex$0.75$3.75$0.0375 Priority$2.70$13.50$0.135」
 *      「Output speed is 188 tokens a second.」「$3.16」「Index score 54」
 *  - AA 独立评测逐字复述：https://www.heise.de/en/news/Gemini-4-Hydrogen-Google-s-efficient-alternative-to-Argon-and-Carbon-11523905.html
 *      「54 points ... xhigh」「51 points at high, but only 27 at low」
 *      「33% of tasks in the GDP.pdf benchmark」「hallucination rate ... just 8%」
 *      「It scores 54% on Terminal-Bench 4.0」「between $0.29 at low and $3.16 at xhigh」
 *  - Google 官方基准表逐字转录：https://aitoolsrecap.com/Comparisons/gemini-4-hydrogen-vs-gemini-4-argon-2026
 *      「AA Intelligence Index 51 high, 54 xhigh」「SWE-sweep, agentic coding 13.5%」
 *      「Agents' Last Exam v1.1 71.6%」「OSWorld-2.1, offline subset 77.6%」
 *      「Chartography 66.6%」「Terminal-Bench 4.0 not published」
 *  - Terminal-Bench 4.1 57%：https://www.163.com/tech/article/LBK07QIN00098IEO.html
 *      「Terminal-Bench 4.1得分从18.2% 提升至57%」
 *  - 交叉核对：https://aitodaybrief.com/en/news/optimization/gemini-4-hydrogen-artificial-analysis-benchmarks-expose-terminal-coding-weakness
 *      （8% 幻觉率、54% Terminal-Bench 4.0、33% GDP.pdf、$1.87/$3.16）
 *      https://modelfit.io/blog/gemini-4-hydrogen-cloud-only-no-weights （57.0% 4.1、71.6% ALE v1.1）
 *
 * ── 三个必须记住的口径陷阱（写错就是编数据）──
 *  1. Terminal-Bench 4.0 与 4.1 是两个版本：Google 官方表里 4.0 一栏是
 *     「not published」，宣传的 57% 是 4.1；AA 独立测的 4.0 是 54%。
 *     本脚本分别记为 terminal-bench-4(54, AA) 与 terminal-bench-4-1(57, 厂商自测)。
 *  2. 厂商自测 vs 第三方评测：71.6 / 77.6 / 66.6 / 57 / 13.5 来自 Google
 *     11-12 发布表（自测，未经第三方复现），54 / 33 / 8 来自 AA 独立评测。
 *     两者在 source 里逐条标注，不混成同一口径。
 *  3. AA-Omniscience 幻觉率是**反向指标**（8% 越低越好）。柱图按数值画宽度，
 *     所以把它排在分数数组末位、不进前四项柱图，只在完整基准表里出现，
 *     并在 benchmark 定义里写明「反向指标」。
 *
 * 用法：node scripts/apply-data-2026-11-15-hydrogen.mjs
 * 幂等：按 id / 复合键覆盖，不删除既有记录；snapshot.changes 写绝对值。
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
      list[i] = { ...list[i], ...row };
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

// ── 来源 URL ────────────────────────────────────────────────
const SRC = {
  pricing: 'https://iosnack.com/blog/gemini-4-hydrogen-price-benchmarks-business',
  aa: 'https://www.heise.de/en/news/Gemini-4-Hydrogen-Google-s-efficient-alternative-to-Argon-and-Carbon-11523905.html',
  googleTable: 'https://aitoolsrecap.com/Comparisons/gemini-4-hydrogen-vs-gemini-4-argon-2026',
  tb41: 'https://www.163.com/tech/article/LBK07QIN00098IEO.html',
};

const AA_SOURCE = 'Artificial Analysis 独立评测（heise online 逐字复述；原始出处 artificialanalysis.ai）';
const GOOGLE_SOURCE =
  'Google 官方 11-12 发布表（AIToolsRecap 逐字转录；厂商自测、未经第三方复现，不与站内 AA 口径横比）';

// ───────────────────────────────────────────
// 1. 新增 3 个基准定义
// ───────────────────────────────────────────
const benchmarks = read('seeds/benchmarks.json');
upsert(benchmarks, 'id', [
  {
    id: 'terminal-bench-4-1',
    name: 'Terminal-Bench 4.1',
    category: 'coding',
    summary: 'Terminal-Bench 4.1 版本的终端软件工程任务通过率，与站内 4.0 版题目集不同，不可直接比较。',
    explanation:
      'Google 在 Gemini 4 Hydrogen 发布表里宣传的是 4.1 版 57%（对比 Gemini 3.8 Flash 的 18.2%），而官方表 4.0 一栏明确标注未公布。站内另有 Terminal-Bench 4.0（AA 独立评测口径），两个版本题目集与评分协议不同，切勿把 57% 当成 4.0 的成绩。',
    useCase: '核对厂商宣传口径、区分基准版本时',
    scoring: '任务通过率（%）',
    scale: '百分比',
    vendorOwned: false,
    url: 'https://www.tbench.ai',
  },
  {
    id: 'swe-sweep',
    name: 'SWE-sweep（智能体编码）',
    category: 'coding',
    summary: '在真实代码库里连续完成多步缺陷修复的智能体编码测试，考察长链路工具调用与验证能力。',
    explanation:
      'Google 11-12 基准表用它对比 Hydrogen 与 Argon（13.5% vs 4.3%）。与站内 SWE Marathon 不是同一套题目，分数不能互换；本条是厂商自测值，未经第三方复现。',
    useCase: '评估「模型自己跑完一整轮改代码」的智能体场景',
    scoring: '任务通过率（%）',
    scale: '百分比',
    vendorOwned: false,
    url: null,
  },
  {
    id: 'aa-omniscience-hallucination',
    name: 'AA-Omniscience 幻觉率',
    category: 'knowledge',
    summary: '知识问答中编造事实的比例。**反向指标：数值越低越好**，与站内其它「越高越好」的基准相反。',
    explanation:
      'Artificial Analysis 的知识可靠性测试，专门统计模型在不确定时胡编的比例。Gemini 4 Hydrogen 为 8%，同期 Claude Sonnet 5.5 为 43%、GPT-6.1 Sol 为 52%。因是反向指标，柱图按数值画宽度会显得「很短」，所以本项只进完整基准表、不进四项柱图。',
    useCase: 'RAG 校验、文档问答、事实核查等对「不瞎编」要求高的场景',
    scoring: '幻觉率（%，越低越好）',
    scale: '百分比（反向指标，越低越好）',
    vendorOwned: false,
    url: 'https://artificialanalysis.ai',
  },
]);

// ───────────────────────────────────────────
// 2. Hydrogen 的 8 条基准分数
//    数组顺序 = 详情页柱图候选顺序（KEY 优先 + 其余按此顺序补位）
//    前四项：TB4.0(AA) / GDP.pdf(AA) / ALE(官方) / OSWorld(官方)
//    幻觉率排末位，避免反向指标进柱图
// ───────────────────────────────────────────
const scores = read('seeds/scores.json');
const M = 'gemini-4-hydrogen';
const S = (benchmarkId, value, effort, source, sourceUrl) => ({
  modelId: M,
  benchmarkId,
  value,
  effort,
  includesFallback: null,
  includesCyberguards: null,
  source,
  sourceUrl,
  measuredAt: '2026-11-13',
});

const newScores = [
  // ── AA 独立评测（可与站内 AA 口径横比）──
  S(
    'terminal-bench-4',
    54,
    'xhigh',
    `${AA_SOURCE}；Terminal-Bench 4.0 = 54%，high→xhigh 无提升`,
    SRC.aa
  ),
  S(
    'gdp-pdf',
    33,
    'medium',
    `${AA_SOURCE}；33% all-pass，与榜首并列`,
    SRC.aa
  ),
  // ── Google 官方发布表（厂商自测，标注口径）──
  S(
    'agents-last-exam',
    71.6,
    null,
    `${GOOGLE_SOURCE}；Agents' Last Exam v1.1 变体，与站内 AA 口径可能不同`,
    SRC.googleTable
  ),
  S(
    'osworld-v2-1',
    77.6,
    null,
    `${GOOGLE_SOURCE}；OSWorld-2.1 offline subset`,
    SRC.googleTable
  ),
  S(
    'chartography-tools',
    66.6,
    null,
    `${GOOGLE_SOURCE}；官方表写作 Chartography，未注明 w/ tools`,
    SRC.googleTable
  ),
  S(
    'terminal-bench-4-1',
    57,
    'high',
    'Google 官方发布（厂商自测，Terminal-Bench 4.1 版本；网易科技逐字转录）',
    SRC.tb41
  ),
  S('swe-sweep', 13.5, null, GOOGLE_SOURCE, SRC.googleTable),
  // ── 反向指标，只在完整表中出现 ──
  S(
    'aa-omniscience-hallucination',
    8,
    null,
    `${AA_SOURCE}；幻觉率 8%（越低越好），同期 Sonnet 5.5 = 43%`,
    SRC.aa
  ),
];
upsertScores(scores, newScores);

// ───────────────────────────────────────────
// 3. 价格：更新标准档备注 + 补 Batch/Flex、Priority 两档
//    两档必须被 isStandardTier 排除：
//      Batch  → tier.kind === 'batch' 且 label 含「五折」
//      Priority → label 含「优先」命中 PREMIUM_TIER
// ───────────────────────────────────────────
const prices = read('prices.json');
const pricesBefore = prices.length;

const PACKAGE_FIELDS = {
  packageQuota: null,
  packageQuotaUnit: 'mixed',
  packagePeriod: null,
  packagePrice: null,
  packageTierName: null,
  packageMerged: null,
  packageManualActivation: null,
  packageCalls: null,
  packageIncludes: null,
};

const TIER_QUOTE =
  'TierInputOutputCached input Standard$1.50$7.50$0.075 ' +
  'Batch or Flex$0.75$3.75$0.0375 Priority$2.70$13.50$0.135';

const basePrice = {
  modelId: M,
  channelId: 'google-ai-studio',
  billingMode: 'payg',
  currency: 'USD',
  cacheWrite: null,
  vendorModelId: 'gemini-4-hydrogen',
  promotional: false,
  promoNote: null,
  ...PACKAGE_FIELDS,
};

upsertPrices(prices, [
  // 标准档：数值与 evidence 一律不动（官方页本次仍不可达，不能谎称重抓），
  // 只把过时的「本表未展开」备注改成实际状态。
  {
    modelId: M,
    channelId: 'google-ai-studio',
    tierLabel: null,
    note:
      '2026-11-12 GA，1,048,576 token 上下文内统一计价，思考 token 按输出计费。缓存价为输入价的 95% 折扣（$0.075），仅隐式缓存、无缓存写入费，且需 ≥4,096 token 才生效。Batch/Flex 五折档与 Priority 优先档已在本表另列；官方页未列出 Hydrogen 的调价计划（Carbon/Argon 12-01 涨价不适用）。',
  },
  {
    ...basePrice,
    input: 0.75,
    cacheRead: 0.0375,
    output: 3.75,
    tier: {
      kind: 'batch',
      note: 'Google 官方 Batch / Flex 档：面向可等待的离线任务，输入、输出、缓存读价均为标准档五折。',
    },
    tierLabel: 'Batch / Flex 五折档',
    note:
      '二手来源：Google 官方定价页 ai.google.dev 国内网络不可达，此档价格取自 IOSnack 对官方价目表的逐字转录（2026-11-13 读取），并与 heise 的标准档 $0.075 缓存价交叉核对。折扣档，不参与标准档均价与最低价计算。Flex 与 Batch 共用此费率。',
    evidence: {
      sourceUrl: SRC.pricing,
      fetchedAt: AS_OF,
      quote: TIER_QUOTE,
      pageUpdatedAt: null,
    },
  },
  {
    ...basePrice,
    input: 2.7,
    cacheRead: 0.135,
    output: 13.5,
    tier: { kind: 'none' },
    tierLabel: 'Priority 优先档',
    note:
      '二手来源：同上，取自 IOSnack 对 Google 官方价目表的逐字转录。Priority 为常设溢价档（非限时促销），约为标准档 1.8 倍，不参与标准档均价与最低价计算。TierCondition 枚举没有 priority 类型，故以 kind=none + 档位标签表达。',
    evidence: {
      sourceUrl: SRC.pricing,
      fetchedAt: AS_OF,
      quote: TIER_QUOTE,
      pageUpdatedAt: null,
    },
  },
]);

// ───────────────────────────────────────────
// 4. 智能指数：补齐 AA 的成本与吞吐（口径与 index=54 的 xhigh 档一致）
// ───────────────────────────────────────────
const intelligence = read('seeds/intelligence.json');
upsert(intelligence, 'modelId', [
  {
    modelId: M,
    costPerTaskUsd: 3.16,
    outputTokensPerSec: 188,
    // index=54 / rank=7 保持不变：站内 rank 是自有收录排序，
    // AA 全球榜的 16th/78 是另一套口径，不混用。
  },
]);

// ───────────────────────────────────────────
// 5. 快照元信息同步
// ───────────────────────────────────────────
const snapshot = read('snapshot.json');
snapshot.id = '2026-W46';
snapshot.date = TODAY;
// 汇率沿用 11-13 央行中间价：11-15 为周日，无新中间价发布。
snapshot.usdCny = 6.7152;

const byChannel = new Map();
for (const p of prices) byChannel.set(p.channelId, (byChannel.get(p.channelId) ?? 0) + 1);
const cid = 'google-ai-studio';
snapshot.channelStatus[cid] = {
  ...(snapshot.channelStatus[cid] ?? {}),
  channelId: cid,
  status: 'ok',
  dataAsOf: AS_OF,
  records: byChannel.get(cid) ?? 0,
  error: null,
  // 绝对值而非累加：保证脚本可重复执行
  changes: 2,
};
snapshot.counts = {
  models: read('seeds/models.json').length,
  channels: read('seeds/channels.json').length,
  paygPrices: prices.filter((p) => p.billingMode === 'payg').length,
  packagePrices: prices.filter((p) => p.billingMode === 'package').length,
  scores: scores.length,
};
snapshot.builtAt = AS_OF;

// ───────────────────────────────────────────
// 落盘
// ───────────────────────────────────────────
write('seeds/benchmarks.json', benchmarks);
write('seeds/scores.json', scores);
write('prices.json', prices);
write('seeds/intelligence.json', intelligence);
write('snapshot.json', snapshot);

console.log('════════ 2026-11-15 Gemini 4 Hydrogen 数据补全 ════════');
console.log(`价格      ${pricesBefore} → ${prices.length} 条（新增 2 档，标准档仅改备注）`);
console.log(`基准定义  ${benchmarks.length} 项（新增 3）`);
console.log(`基准分数  ${scores.length} 条（Hydrogen 新增 ${newScores.length}）`);
console.log(`智能指数  costPerTaskUsd=3.16 / outputTokensPerSec=188`);
console.log(`快照      ${snapshot.id} / ${snapshot.date} · 汇率 6.7152`);
console.log(`抓取时间  ${AS_OF}`);
