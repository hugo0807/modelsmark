/**
 * ModelsMark 本地数据补充更新 —— 2026-11-14（第二轮：OpenAI 查漏 + 发布状态核查）
 *
 * 触发：用户提出「还有新模型信息没更新，比如 GPT Astra 6.2，再检查下」。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 一、核查结论：GPT-6.2 Astra 截至 2026-11-14 未正式发布，本次不录入
 * ═══════════════════════════════════════════════════════════════════
 * 传闻名：GPT-6.2 Astra / gpt-6.2-astra（用户口语「GPT Astra 6.2」）、GPT-6.2 Sol。
 * 逐项核对（均为 2026-11-12 ~ 11-14 的一手核查或明确标注核查日期的二手核查）：
 *  1) OpenAI 11/12 10:00 PT「Cyber at the Frontier」发布会全程未发布新模型，
 *     GPT-6.2 未被提及；当天只发布 Daybreak Red Team / Defense Factory 两个产品。
 *     https://www.orcarouter.ai/blog/gpt-6-2-cyber-at-the-frontier-no-show （Nov 13）
 *  2) OpenAI 模型目录 / API changelog / 价目表 / Newsroom 均无 6.2 条目；
 *     官方目录只有 5 个 GPT-6 系 id：gpt-6-astra、gpt-6.1-sol、gpt-6.1-terra、
 *     gpt-6-luna、gpt-6-cyber。gpt-6.2-astra / -sol / -terra 的模型文档路径均 404。
 *     https://blog.sandbase.ai/gpt-6-2-is-it-out-whats-confirmed-2026 （核查于 11/12 晚，北京时间）
 *     https://beatapi.io/blog/gpt-6-2-astra-release-watch （Published Nov 12，FAQ 明写 "Is GPT-6.2 Astra out? No."）
 *  3) API changelog 最近的模型条目是 11/5 GPT-6 Cyber、11/4 GPT-Image-2.6；
 *     Artificial Analysis 没有任何 6.2 变体的评测页。
 *  4) 已出现的「证据」只是灰度痕迹，不构成公开发布：Codex 用量日志里出现
 *     gpt-6.2-astra 计费字符串、Google Cloud 配额筛选器 11/4 短暂出现约 3 小时后被撤、
 *     openai-openapi 11/10 一条提交短暂写入「On models 6.2 and later」后 13 小时被移除。
 *  5) 网上流传的价格均不可用：
 *     - $4 输入 / $20 输出：kie.ai 2026-11-01 文章自称「Unconfirmed leak (@SNARKAMOTO)」，OpenAI 未证实；
 *     - $20 输入 / $100 输出：与 GPT-6 Astra 官方 Fast 档价格重合，AI IDE List 核查文列为未证实；
 *     - $10 / $50：BeatAPI 对 6.2 的「预测价」，是沿用 Astra 现价的推测，不是费率表。
 *     https://qcode.cc/gpt-6-2-pricing （逐字转录官方定价页，核于 2026-11-02，更新于 11-10）
 *     https://www.chatgoat.ai/zh/blog/gpt-6-2-astra-release-date-price
 *  → 结论：把 6.2 当作已发布模型写入价格表等于编造数据，违反本站「接地不变量」，
 *    故本次不建模型、不写价格。官方发布后再补。
 *
 * 同类未发布传闻，同样不录入：
 *  - Claude Fable 5.5 / Mythos 5.5：仅 Anthropic 官网 HTML 源码残留、LiteLLM Azure 配置
 *    短暂出现 azure_ai/claude-fable-5-5、以及 X 上的演示视频；官方未发布、无价目表。
 *    https://news.qq.com/rain/a/20261102A040I200 、 https://m.thepaper.cn/newsDetail_forward_34409754
 *  - GPT-6 Rosalind（2026-10-30，生命科学研究专用，trusted access）：官方 changelog 有条目，
 *    但无公开价目与公开基准，信息不足，暂不录入。
 *
 * ═══════════════════════════════════════════════════════════════════
 * 二、本次实际补录：OpenAI 已正式发布但本地缺失 / 元数据有误的模型
 * ═══════════════════════════════════════════════════════════════════
 *  A) GPT-6 Cyber（gpt-6-cyber）—— 2026-11-05 GA，OpenAI 11 月真正发布的新模型。
 *     网络安全专用变体，仅限 Daybreak Red 审批客户（API / Codex），Preparedness 网络安全
 *     评级 Critical。有完整官方费率表，被多家独立站点逐字复述（官方页国内 403 无法直连）。
 *     价格与交叉来源见下方 P() 的 evidence / note。
 *  B) GPT-6 Sol（gpt-6-sol）—— 2026-09-22 发布，仍在售的上一代 Sol。
 *  C) 修正 4 处既有元数据：GPT-6 Astra 发布日 09-01 → 09-03、GPT-6 Luna 09-29 → 09-22、
 *     GPT-6.1 Terra null → 2026-10-26；并给 4 个 GPT-6 系模型补 maxOutput=128000。
 *
 * 来源（本次全部为二手交叉核实，均在 note 中显式标注；官方定价页返回 403）：
 *  - https://www.orcarouter.ai/blog/gpt-6-2-cyber-at-the-frontier-no-show （Nov 13，完整费率卡）
 *  - https://aimodelwatch.dev/models/gpt-6-cyber （Last verified 13 Nov 2026，标称 sourced from official provider documentation）
 *  - https://llmmatchmaker.com/blog/openai-gpt-6-cyber （读官方 launch post / system card / model docs）
 *  - https://www.aixploria.com/en/gpt-6-cyber-openai 、 https://www.bytenote.net/zh/article/gpt-6-2-cyber-critical-model
 *  - http://quidproquo.cc/posts/daily/2026-11-06-model-openai-gpt-6-cyber （模型卡，含 12h 缓存写入价）
 *  - https://qcode.cc/gpt-6-2-pricing （逐字转录 OpenAI 官方定价页 / changelog）
 *  - https://benchlm.ai/benchmarks/artificialanalysis （AA 指数汇编表，11-13 核，GPT-6 Sol 47.6）
 *  - https://www.orcarouter.ai/blog/gpt-6-2-cyber-at-the-frontier-no-show 中「11/12 keynote 无新模型」结论
 *
 * 【接地不变量】每条价格带 sourceUrl + fetchedAt + quote；未公开 / 未评测一律 null 并写 note。
 * 用法：node scripts/apply-data-2026-11-14-openai-supplement.mjs
 * 幂等：按 id / 复合键覆盖，不删除既有记录，可重复执行。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const AS_OF = new Date().toISOString();
const TODAY = AS_OF.slice(0, 10);
const USD_CNY = 6.7152;

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
      list[i] = row;
    }
  }
  return list;
}

// ───────────────────────────────────────────
// 构造器
// ───────────────────────────────────────────
const M = (o) => ({
  id: o.id, name: o.name, vendor: o.vendor, origin: o.origin,
  openWeights: o.openWeights ?? false,
  contextWindow: o.contextWindow ?? null, maxOutput: o.maxOutput ?? null,
  releasedAt: o.releasedAt ?? null,
  params: o.params ?? null, activeParams: o.activeParams ?? null,
  pricingUrl: o.pricingUrl ?? null, docsUrl: o.docsUrl ?? null,
});

const P = (o) => ({
  modelId: o.modelId, channelId: o.channelId, billingMode: 'payg',
  currency: o.currency, input: o.input,
  cacheRead: o.cacheRead ?? null, cacheWrite: o.cacheWrite ?? null, output: o.output,
  tier: o.tier ?? { kind: 'none' }, tierLabel: o.tierLabel ?? null,
  vendorModelId: o.vendorModelId ?? null,
  promotional: o.promotional ?? false, promoNote: o.promoNote ?? null,
  note: o.note ?? null,
  evidence: {
    sourceUrl: o.sourceUrl, fetchedAt: AS_OF, quote: o.quote,
    pageUpdatedAt: o.pageUpdatedAt ?? null,
  },
  packageQuota: null, packageQuotaUnit: 'mixed', packagePeriod: null,
  packagePrice: null, packageTierName: null, packageMerged: null,
  packageManualActivation: null, packageCalls: null, packageIncludes: null,
});

const B = (o) => ({
  id: o.id, name: o.name, category: o.category, summary: o.summary,
  explanation: o.explanation, useCase: o.useCase, scoring: o.scoring,
  scale: o.scale, vendorOwned: o.vendorOwned ?? false, url: o.url ?? null,
});

const S = (modelId, benchmarkId, value, source, sourceUrl, extra = {}) => ({
  modelId, benchmarkId, value,
  effort: extra.effort ?? null,
  includesFallback: null, includesCyberguards: null,
  source, sourceUrl, measuredAt: extra.measuredAt ?? '2026-11-05',
});

const OPENAI_PRICING = 'https://developers.openai.com/api/docs/pricing';
const OPENAI_MODELS = 'https://developers.openai.com/api/docs/models';
const ORCAROUTER = 'https://www.orcarouter.ai/blog/gpt-6-2-cyber-at-the-frontier-no-show';
const QCODE = 'https://qcode.cc/gpt-6-2-pricing';
const CYBER_SRC = 'https://aimodelwatch.dev/models/gpt-6-cyber';

// ───────────────────────────────────────────
// 1. 模型：新增 2 个 + 修正既有元数据
// ───────────────────────────────────────────
const models = read('seeds/models.json');
const modelsBefore = models.length;

upsert(models, 'id', [
  M({
    id: 'gpt-6-cyber', name: 'GPT-6 Cyber', vendor: 'OpenAI', origin: 'overseas',
    contextWindow: 1_050_000, maxOutput: 128_000, releasedAt: '2026-11-05',
    pricingUrl: OPENAI_PRICING, docsUrl: OPENAI_MODELS,
  }),
  M({
    id: 'gpt-6-sol', name: 'GPT-6 Sol', vendor: 'OpenAI', origin: 'overseas',
    contextWindow: 1_050_000, maxOutput: 128_000, releasedAt: '2026-09-22',
    pricingUrl: OPENAI_PRICING, docsUrl: OPENAI_MODELS,
  }),
]);

// 发布日修正依据：BeatAPI / The Agent Times 均记 Astra 于 2026-09-03 发布；
// QCode 逐字转录官方 changelog：09-22 发布 GPT-6 Sol 与 Luna、10-26 发布 GPT-6.1 Terra。
const metaFixes = {
  'gpt-6-astra':  { releasedAt: '2026-09-03', maxOutput: 128_000 },
  'gpt-6-luna':  { releasedAt: '2026-09-22', maxOutput: 128_000 },
  'gpt-6-1-sol': { maxOutput: 128_000 },
  'gpt-6-1-terra': { releasedAt: '2026-10-26', maxOutput: 128_000 },
};
for (const [id, patch] of Object.entries(metaFixes)) {
  const m = models.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
}

// ───────────────────────────────────────────
// 2. 价格：3 条（Cyber 标准档 / Cyber 长上下文档 / Sol 标准档）
// ───────────────────────────────────────────
const CYBER_QUOTE_SHORT =
  'GPT-6 Cyber is billed at $20 input and $100 output per million tokens with cached input at $2 ' +
  'and cache writes at $25 — but only for requests up to 272,000 input tokens. ' +
  'Price to 272K input — $20.00 per million input, $2.00 cached, $25.00 cache write, $100.00 output.';
const CYBER_QUOTE_LONG =
  'Price above 272K input — $40.00 input, $4.00 cached, $150.00 output. ' +
  'The long-context step is roughly double, not a rounding difference.';
const SOL_QUOTE =
  '2026-09-22 官方发布 GPT-6 Sol 与 GPT-6 Luna；更新日志写的标准价是 Sol 输入 $2、缓存输入 $0.20、输出 $10；' +
  '已确认（官方页逐字可核，2026-11-02）OpenAI 定价页的短上下文标准价（输入不超过 272K，每 1M token；' +
  '缓存写入为 30 分钟档）：gpt-6-sol $2.00 / $0.20 / $2.50 / $10.00。';

const CYBER_CROSS =
  '二手来源说明：OpenAI 官方定价页 https://developers.openai.com/api/docs/pricing 本次仍返回 403（Forbidden），' +
  '无法直连复核，故采用 6 家独立站点对官方模型页 / 定价页 / System Card 的逐字复述并交叉核对：' +
  'OrcaRouter（11-13）、AI Model Watch（Last verified 13 Nov 2026）、LLM Match Maker、AIxploria、' +
  'ByteNote、quidproquo 模型卡，$20/$2/$100 六家一致。';

const prices = read('prices.json');
const pricesBefore = prices.length;

upsertPrices(prices, [
  P({
    modelId: 'gpt-6-cyber', channelId: 'openai', currency: 'USD',
    input: 20, cacheRead: 2, cacheWrite: 25, output: 100,
    vendorModelId: 'gpt-6-cyber',
    sourceUrl: ORCAROUTER, quote: CYBER_QUOTE_SHORT,
    note:
      CYBER_CROSS +
      ' cacheWrite 记 30 分钟档 $25，12 小时缓存写入为 $50（quidproquo 模型卡 / LLM Match Maker）。' +
      '【口径警示】这是网络安全专用模型，非通用对话模型：仅限通过 Daybreak Red 审批并经模型级单独授权的客户，' +
      '经 API 与 Codex 使用，默认 IP 白名单，不支持 Batch；Preparedness Framework 网络安全评级 Critical。' +
      'Artificial Analysis 无该模型的评测页，第三方无公开评测套件，故智能指数留空、不纳入通用能力横比。' +
      '官方另设 >272K 长上下文档（单列一条）。价格恰为 GPT-6 Astra 标准档的 2 倍。',
  }),
  P({
    modelId: 'gpt-6-cyber', channelId: 'openai', currency: 'USD',
    input: 40, cacheRead: 4, cacheWrite: null, output: 150,
    tier: { kind: 'long_context', threshold: 272_000, unit: 'token',
      note: '官网口径：Short context ≤272K input tokens / Long context >272K input tokens，整单换价' },
    tierLabel: '>272K 输入', vendorModelId: 'gpt-6-cyber',
    sourceUrl: ORCAROUTER, quote: CYBER_QUOTE_LONG,
    note:
      '长上下文溢价档只公开输入 $40 / 缓存读取 $4 / 输出 $150，未单列缓存写入价，故 cacheWrite 记 null（不推测）。' +
      '来源同标准档，并由 aimodelwatch 说明「unlike gpt-5.6-cyber, a long-context band IS published」佐证。' +
      '不参与标准档均价与官方基准价计算。',
  }),
  P({
    modelId: 'gpt-6-sol', channelId: 'openai', currency: 'USD',
    input: 2, cacheRead: 0.2, cacheWrite: 2.5, output: 10,
    vendorModelId: 'gpt-6-sol',
    sourceUrl: QCODE, quote: SOL_QUOTE,
    note:
      '二手来源说明：本次官方定价页返回 403，采用 QCode 对 OpenAI 官方定价页 / API 更新日志的逐字转录' +
      '（页面标注核于 2026-11-02、更新于 2026-11-10）；并与 BeatAPI 现役 GPT-6 系列表、' +
      'BenchGecko（$2/$10，as of 2026-11-13）交叉核对一致。' +
      'cacheWrite 记 30 分钟档 $2.50。GPT-6.1 Sol 于 09-29 取代本型号，但本型号仍在官方目录与 QCode /models 在售。' +
      '【未展开】官方另设 >272K 长上下文档（按 2 倍输入与缓存价、1.5 倍输出价整单计），' +
      '但本站未找到该型号该档位的逐字费率，故不录推算值；Batch 五折、Fast 翻倍、Ultrafast 6 倍同样未展开。',
  }),
]);

// ───────────────────────────────────────────
// 3. 智能指数
// ───────────────────────────────────────────
const intelligence = read('seeds/intelligence.json');
const intBefore = intelligence.length;
upsert(intelligence, 'modelId', [
  {
    modelId: 'gpt-6-cyber', index: null, rank: null,
    costPerTaskUsd: null, outputTokensPerSec: null,
    source: 'Artificial Analysis（暂未收录）', measuredAt: TODAY,
    aaName: 'GPT-6 Cyber',
    note: 'AA 无该模型评测页；网络安全专用模型目前没有第三方公开评测套件，故 index 留空，不参与能力指数榜。' +
      '官方自测分数见 scores.json（ExploitGym 等，厂商自测、不可与通用基准横比）。',
  },
  {
    modelId: 'gpt-6-sol', index: 48, rank: null,
    costPerTaskUsd: null, outputTokensPerSec: null,
    source: 'Artificial Analysis Intelligence Index（BenchLM 汇编表，口径存疑）',
    measuredAt: '2026-11-13', aaName: 'GPT-6 Sol',
    note: 'BenchLM 的 AA 指数汇编表（2026-11-13 核）列 GPT-6 Sol 47.6%，本站四舍五入记 48。' +
      '【口径警示】该表明确说明「compiled from provider self-reports and secondary reports, can come from different index versions」，' +
      '且该行标注为「Carried from an upstream page」；llmbenchmark.ai 的 AA v5 榜单未给该型号 AA 分。' +
      '因此 48 分与站内 v5 口径可能不一致，仅供参考，不用于能力指数排名。',
  },
]);

// ───────────────────────────────────────────
// 4. 基准定义（GPT-6 Cyber 厂商自建安全评测，2 项）
// ───────────────────────────────────────────
const CYBER_MARK =
  '本节分数来自 OpenAI 2026-11-05 GPT-6 Cyber 发布帖与 System Card，为厂商自测披露，未经第三方独立复现；' +
  '且属网络安全专用评测，与站内 Artificial Analysis 通用口径的分数不可直接横向比较。';
const benchmarks = read('seeds/benchmarks.json');
const benchBefore = benchmarks.length;
upsert(benchmarks, 'id', [
  B({
    id: 'exploitgym', name: 'ExploitGym（OpenAI 自建）', category: 'industry',
    summary: '考察模型针对指定已知漏洞，在授权远程目标上做出可用 exploit 的成功率。',
    explanation: CYBER_MARK + ' 官方披露对照：GPT-5.6 Cyber 32.1%、GPT-6 Astra 42.4%、GPT-6 Cyber 48.5%。',
    useCase: '评估渗透测试 / 漏洞验证专用模型，不适用于通用模型选型',
    scoring: '可用 exploit 产出率（%）', scale: '百分比', vendorOwned: true,
    // 官方发布帖的完整 URL 未在本次来源中逐字给出，不猜链接，留 null
    url: null,
  }),
  B({
    id: 'exploitgym-honeypot', name: 'ExploitGym Honeypot（作用域遵守率）', category: 'industry',
    summary: '在授权目标旁放置越界诱饵服务，考察模型能否判断目标范围、拒绝触碰诱饵。',
    explanation: CYBER_MARK + ' 官方披露：未给部署安全提示词时 99.93% 守住边界，给提示词后 100%；前代 GPT-5.6 Cyber 仅 94.49%。',
    useCase: '评估安全专用模型的授权边界遵守能力',
    scoring: '不触碰诱饵的比例（%）', scale: '百分比', vendorOwned: true,
    // 官方发布帖的完整 URL 未在本次来源中逐字给出，不猜链接，留 null
    url: null,
  }),
]);

// ───────────────────────────────────────────
// 5. 基准分数（GPT-6 Cyber 官方自测 2 项）
// ───────────────────────────────────────────
const CYBER_SCORE_SRC = 'OpenAI 官方发布 / System Card（厂商自测，未经第三方复现）';
const CYBER_SCORE_URL = 'https://www.bytenote.net/zh/article/gpt-6-cyber-critical-model';
const scores = read('seeds/scores.json');
const scoresBefore = scores.length;
const nextScores = upsertScores(scores, [
  S('gpt-6-cyber', 'exploitgym', 48.5, CYBER_SCORE_SRC, CYBER_SCORE_URL),
  S('gpt-6-cyber', 'exploitgym-honeypot', 99.93, CYBER_SCORE_SRC, CYBER_SCORE_URL),
]);

// ───────────────────────────────────────────
// 6. 本期变动（首页变动模块可直接消费）
// ───────────────────────────────────────────
const changes = read('changes.json');
const changeKey = (c) => `${c.modelId}|${c.channelId}|${c.kind}|${c.tierLabel ?? ''}`;
const changeIdx = new Set(changes.map(changeKey));
for (const c of [
  { modelId: 'gpt-6-cyber', channelId: 'openai', billingMode: 'payg', kind: 'added',
    fromCny: null, toCny: Math.round(40 * USD_CNY * 100) / 100, delta: null, tierLabel: null },
  { modelId: 'gpt-6-sol', channelId: 'openai', billingMode: 'payg', kind: 'added',
    fromCny: null, toCny: Math.round(4 * USD_CNY * 100) / 100, delta: null, tierLabel: null },
]) {
  if (!changeIdx.has(changeKey(c))) changes.push(c);
}

// ───────────────────────────────────────────
// 7. 快照元信息
// ───────────────────────────────────────────
const snapshot = read('snapshot.json');
snapshot.id = '2026-W46';
snapshot.date = TODAY;
snapshot.usdCny = USD_CNY;
const byChannel = new Map();
for (const p of prices) byChannel.set(p.channelId, (byChannel.get(p.channelId) ?? 0) + 1);
for (const cid of ['anthropic', 'openai', 'google-ai-studio', 'baidu-qianfan']) {
  snapshot.channelStatus[cid] = {
    channelId: cid, status: 'ok', dataAsOf: AS_OF,
    records: byChannel.get(cid) ?? 0, error: null,
    // 固定值而非累加，保证脚本可重复执行
    changes: cid === 'openai' ? 3 : (snapshot.channelStatus[cid]?.changes ?? 0),
  };
}
snapshot.counts = {
  models: models.length,
  channels: read('seeds/channels.json').length,
  paygPrices: prices.filter((p) => p.billingMode === 'payg').length,
  packagePrices: prices.filter((p) => p.billingMode === 'package').length,
  scores: nextScores.length,
};
snapshot.builtAt = AS_OF;

// ───────────────────────────────────────────
// 落盘
// ───────────────────────────────────────────
write('seeds/models.json', models);
write('prices.json', prices);
write('seeds/intelligence.json', intelligence);
write('seeds/benchmarks.json', benchmarks);
write('seeds/scores.json', nextScores);
write('changes.json', changes);
write('snapshot.json', snapshot);

console.log('════════ 2026-11-14 第二轮补充更新完成 ════════');
console.log(`模型      ${modelsBefore} → ${models.length}（新增 GPT-6 Cyber / GPT-6 Sol，修正 4 处元数据）`);
console.log(`价格      ${pricesBefore} → ${prices.length}（净增 ${prices.length - pricesBefore}）`);
console.log(`智能指数  ${intBefore} → ${intelligence.length}`);
console.log(`基准定义  ${benchBefore} → ${benchmarks.length}`);
console.log(`基准分数  ${scoresBefore} → ${nextScores.length}`);
console.log(`本期变动  +2 条 added`);
console.log('');
console.log('【未收录 · 已核查】GPT-6.2 Astra / GPT-6.2 Sol：未正式发布，模型目录 / changelog / 价目表 / AA 均无；');
console.log('  流传的 $4/$20 为未证实泄露，$20/$100 实为 GPT-6 Astra Fast 档官价，$10/$50 为媒体预测价，均不写入。');
console.log('【未收录 · 已核查】Claude Fable 5.5 / Mythos 5.5：官网 HTML 与 LiteLLM 配置残留，未发布、无价目。');
console.log('【未收录 · 信息不足】GPT-6 Rosalind（10-30，生命科学，trusted access，无公开价目与基准）。');
