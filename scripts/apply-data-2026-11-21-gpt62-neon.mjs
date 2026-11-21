/**
 * ModelsMark 本地数据更新 —— 2026-11-21（ISO 周 2026-W47）
 *
 * 采集窗口：最近 7 天 = 2026-11-15 → 2026-11-21（上次快照 11-15 之后）
 * 范围：窗口内「正式发布、且尚未入库」的三个模型 ——
 *   · OpenAI  GPT-6.2 Astra / GPT-6.2 Sol   （2026-11-17 发布）
 *   · Google  Gemini 4 Neon                 （2026-11-18 发布，北京时间 11-19 报道）
 *
 * ════════════════════════════════════════════════════════════════
 * 一、全部来源 URL（一手原始出处 + 实际取证页）
 * ════════════════════════════════════════════════════════════════
 *
 * 【一手来源 = 原始出处，国内网络不可达 / 403，仅作溯源线索，不冒充直采】
 *  - OpenAI 官方定价页        https://developers.openai.com/api/docs/pricing        （WebFetch 实测 403 Forbidden）
 *  - OpenAI API changelog     https://developers.openai.com/api/docs/changelog
 *  - GPT-6.2 Astra model 页  https://developers.openai.com/api/docs/models/gpt-6.2-astra
 *  - GPT-6.2 Sol   model 页  https://developers.openai.com/api/docs/models/gpt-6.2-sol
 *  - OpenAI 发布公告          https://community.openai.com/t/gpt-6-2-astra-and-sol-are-now-available/1417531
 *  - Google 官方定价页        https://ai.google.dev/gemini-api/docs/pricing       （国内不可达，已知阻断）
 *  - Google 官方发布页        blog.google「Introducing Gemini 4 Neon」(2026-11-18)
 *  - Google Cloud Model Garden「Agent Platform Pricing」
 *  - AA 官方榜单/模型页       https://artificialanalysis.ai                        （v5.0.1，未经直连复核）
 *  - 央行中间价原始出处        https://www.chinamoney.com.cn/chinese/bkccpr/
 *
 * 【实际取证页 = 本次逐字核对，写入 evidence.sourceUrl / evidence.quote】
 *  OpenAI 官方价目表逐字转录（多家独立站点交叉，四组数字完全一致）：
 *  - https://www.promptea.me/en/blog/openai-gpt-6-2-astra-sol-launch
 *      「Astra costs $8 per million input tokens and $40 per million output tokens,
 *        with cached input at $0.40.」「Sol costs $2 input and $10 output, with
 *        cached input at $0.10, the same as GPT-6.1 Sol.」「A 30-minute cache
 *        write costs $10 per million tokens on Astra and $2.50 on Sol.」
 *  - https://modelsatwork.news/article/openai-gpt-6-2-astra-sol-chatgpt-api-astra-rate-20-percent-lower-ultrafast-3x
 *      「GPT-6.2 Astra lists at $8 per million input tokens and $40 per million
 *        output, 20% below GPT-6 Astra's $10 and $50; GPT-6.2 Sol stays at
 *        GPT-6.1 Sol's $2 and $10, OpenAI's pricing page shows.」
 *      「Text the model has already read in a session, which OpenAI bills as
 *        cached input, falls from $1.00 to $0.40, 60% lower.」
 *  - https://casrai.org/news/openai-gpt-6-2-astra-sol-release-2026
 *      （表格逐字列）「$8 / $0.40 / $40」「$2 / $0.10 / $10」
 *  - https://www.siliconreport.com/openai-releases-gpt-6-2-astra-and-sol-cutting-astra-api-rates-20
 *      （长上下文溢价档取证页，HTTP 200 可达）「For requests with more than
 *        272,000 input tokens, OpenAI doubles input and cache rates and applies
 *        a 1.5-times multiplier to output tokens, lifting long-context Astra
 *        calls to $16 per million input tokens and $60 per million output tokens.」
 *  - https://kingy.ai/blog/gpt-6-2-astra-sol-benchmarks-pricing-reviews
 *      （交叉核对线索；该站 HEAD/GET 返回 403，故不作为 evidence.sourceUrl）
 *      「Astra becomes $16 input and $60 output per million; Sol becomes $4 and $15.」
 *      「OpenAI lists a higher tier when input exceeds 272,000 tokens: input and
 *        cached-read rates double and output rates rise by 50% for the entire request.」
 *  - https://www.i-scoop.eu/gpt-6-2-astra-sol
 *      「$8 and $40, 20% below GPT-6 Astra」「$0.40」「$2 and $10」「$0.10」
 *  - https://router.tmhcorps.cn/openai/gpt-6.2-astra-20261117 （OpenRouter 镜像，逐字）
 *      「GPT-6.2 Astra costs $8.00/M input tokens and $40.00/M output tokens, with
 *        separate rates for Cache Read at $0.40/M tokens, Cache Write at $10.00/M tokens」
 *
 *  Gemini 4 Neon 官方发布定价逐字转录（多家独立媒体 + 中文权威财经媒体交叉）：
 *  - https://www.cls.cn/detail/2538684 （财联社 · 科创板日报，2026-11-19）
 *      「该模型定价为每百万输入token 3美元（缓存输入token享0.5折优惠，仅需0.15
 *        美元/百万），每百万输出token 15美元。」
 *  - https://www.163.com/dy/article/LC3H928A0514R9OJ.html （环球网 / 网易，11-19）
 *      「该模型API调用输入每百万词元费用为3美元，输出每百万词元费用为15美元，
 *        缓存输入每百万词元收费0.15美元，设置Low、medium、high、xhigh四档推理级别。」
 *      「在xhigh最高推理档位下，Gemini 4 Neon在Artificial Analysis智能指数榜单位列第三，
 *        编程AI智能体指数取得58.6分，位居榜单首位。」
 *  - https://www.163.com/dy/article/LC5LM19F0512B07B.html （每日经济新闻，11-20）
 *      「该模型定价为每百万输入token 3美元（缓存输入token享0.5折优惠，仅需0.15
 *        美元/百万），每百万输出token 15美元。」
 *  - https://baike.baidu.com/item/Gemini%204%20Neon/69782450
 *      「每百万输入 token 3 美元 (缓存输入 token 享 0.5 折优惠,仅需 0.15 美元/百万),
 *        每百万输出 token 15 美元」「智能指数61分居全球第三,编程智能体指数58.6分居第一」
 *  - https://csuite.so/blog/ai-models-roundup-november-2026 （Updated Nov 19, 2026）
 *      「It costs $3 in and $15 out per million tokens on the paid tier only」
 *      「Google's third Gemini 4 release in nine days came on November 18.」
 *  - https://www.harperflow.io/harperflow-blog/gemini-4-neon-explained-specs-pricing-benchmarks
 *      「Gemini 4 Neon scores 61 at xhigh on the Artificial Analysis Intelligence
 *        Index as of Nov 18, 2026」「The provider page confirms the 61 score for
 *        Neon Xhigh」「citing 65.2% on Terminal-Bench 4.1 and 46.2% on FrontierCode
 *        2.0 at its default high setting」
 *  - https://www.yumiza.ph/articles/dfdc93c9f9
 *      「Neon scores 61 at the xhigh reasoning setting, compared with Carbon's 60
 *        at high and Hydrogen's 54 at xhigh」「Artificial Analysis measures Neon
 *        at 110 tokens per second」「a 1,048,576-token context」
 *  - https://aibacon.net/posts/google-gemini-4-neon-launch-beats-carbon-coding-agents-32-percent-cheaper-per-task-swe-sweep-12-8-to-39-nov-18.html
 *      「On SWE-sweep, Neon leads the mini-SWE harness at 12.8%. The same model
 *        inside Antigravity scores 39%」「61 aa intelligence index at xhigh」「$3/$15」
 *  - https://xiaoan.cc/article/gemini-4-neon-fa-bu-qian-yan-zhi-neng-geng-kuai-geng-pian-yi-baf
 *      「Terminal-Bench 4.1为65.2%,FrontierCode 2.0默认档位46.2%」「智能指数得61分」
 *
 *  Artificial Analysis Intelligence Index v5.0.1（第三方评测，非厂商自测）：
 *  - https://www.heise.de/en/news/GPT-6-2-Astra-OpenAI-warns-of-new-risks-from-AI-self-improvement-11529050.html
 *      「GPT-6.2 Astra scores 62 points on the Intelligence Index with maximum
 *        reasoning effort, ranking No. 2 among the most capable AI models」
 *      「GPT-6.2 Sol gains two points to reach 57」
 *      「Astra costs $8 per million input tokens and $40 per million output tokens...
 *        Cached inputs cost 60% less, at $0.40 per million tokens.」
 *  - https://www.i-scoop.eu/gpt-6-2-astra-sol
 *      「Model / Index score / Cost per task: Claude Fable 5.2 65 $26.54 /
 *        GPT-6.2 Astra 62 $4.00 / GPT-6 Astra 57 $6.24 / GPT-6.2 Sol 57 $1.01 /
 *        GPT-6.1 Sol 55 $1.27」「Source: Artificial Analysis Intelligence Index,
 *        17 November 2026.」
 *  - https://www.worldprogramming.org/posts/gpt-62-astra-vs-sol-why-the-2-model-is-the-smarter-default-x4jfav
 *      （AA v5 max effort 九项逐字表格）「Intelligence Index (composite) 62 57」
 *      「Terminal-Bench-Science 0.1 78.1% 67.6%」「HLE-Diamond 72.2% 64.0%」
 *      「Terminal-Bench 4.0 (agentic coding) 64.1% 60.1%」「GDP.pdf 29.8% 30.0%」
 *      「Cost per Intelligence Index task $4.00 $1.01」
 *  - https://emergent.sh/learn/gpt-6-2-astra-vs-claude-fable-5-2
 *      「HLE-Diamond 72.2% 80.2%」「GDP.pdf 29.8% 24.2%」
 *      「Terminal-Bench 4.0 64.1% 59.6%」「Terminal-Bench-Science 0.1 78.1% 73.3%」
 *      「Figures accessed November 19, 2026」「maximum reasoning effort」
 *  - https://openai.luzhipeng.com/openai/gpt-6.2-astra （OpenRouter 镜像，AA Max 逐字）
 *      「Artificial Analysis GPT-6.2 Astra (Max) Intelligence Index 62.1」
 *  - https://blog.wentuo.ai/zh-hant/gpt-6-2-sol-daily-tasks-vs-coding-review-zh-hant.html
 *      「AA-Omniscience 幻覺率(Max)上,GPT-6.2 Sol 爲 55%,Astra 爲 59%」
 *
 *  汇率（央行中间价，多家权威逐字一致）：
 *  - https://www.financialnews.com.cn/2026-11/20/content_461318.html （金融时报·中国金融新闻网）
 *      「2026年11月20日银行间外汇市场人民币汇率中间价为1美元对人民币6.7131元」
 *  - https://www.chinanews.com/cj/2026/11-20/10735059.shtml （中新网）
 *  - https://finance.ce.cn/fe/gdxw/202611/t20261120_3300458.shtml （中国经济网）
 *  - https://my-h5news.app.xinhuanet.com/h5/article.html?articleId=202611201cb78a6094d4416882d571e81fbf161e （新华网）
 *      「100美元 671.31人民币」→ 6.7131；前一交易日 11-19 为 6.7128。
 *
 * ════════════════════════════════════════════════════════════════
 * 二、核查结论（窗口 11-15 → 11-21）
 * ════════════════════════════════════════════════════════════════
 *  1. 【录入】GPT-6.2 Astra / Sol：11-17 正式 GA（OpenAI changelog + 官方 model
 *     pages），价格 / 智能指数 / 基准分数均有多家独立站点交叉，证据充分。
 *  2. 【录入】Gemini 4 Neon：11-18 正式发布（Google 官方发布页 + AA 页面确认
 *     61 分），定价由财联社/环球网/每经/百度百科四家逐字转录一致。
 *  3. 【已入库，不重复】Claude Fable 5.2 / Mythos 5.2（11-09）、
 *     Gemini 4 Carbon（11-10 GA）、Gemini 4 Hydrogen（11-12）、
 *     文心 5.5 Flash Preview（11-11）—— 均在 11-14/11-15 两次更新中入库。
 *  4. 【不录入，仅报告】按「未正式发布的传闻/灰度模型不录入价格表」红线：
 *     · Claude 6 / Claude 6.x —— Anthropic 未公布发布日期，11-19 仅为 Nasdaq
 *       上市（ANT）资本事件，无新模型、无调价（aitoolsrecap / csuite）。
 *     · 阿里 Qwen4-Max（11-16）—— 预览版，仅 Token Plan 订阅、不公布按量单价，
 *       且 11-25 退役、正式版 11-26 才发布；csuite 的 $1.50/$4.50 为第三方
 *       美元口径，与官方「订阅制无按量价」冲突，不进官网报价表。
 *     · 腾讯混元 Hy4 flash（11-16）—— 仅 OpenRouter 五折折扣挂牌价，属折扣档
 *       且非厂商官方刊例价，不录入。
 *     · 火山引擎 SeedRealtime 1.0（11-19）—— 实时音视频端到端模型，非文本
 *       token 计价，超出本站收录口径。
 *  5. 【扫描其余在售渠道结论】窗口内未发现本站已收录渠道的官网刊例价调整：
 *     · Gemini 4 Carbon / Argon「12-01 起 $4/$20」是 11-14 已入库的**未来预告**，
 *       非窗口内新发生调价，价格未变（引入价 $2/$10 有效至 11-30），不改动。
 *     · 百度千帆文心 5.5 Flash 限时五折 11-14 已入库，11-19「正式挂上千帆 API」
 *       价格未变；百度 11-16 财报为营收数据，非调价。
 *     · Anthropic 窗口内无新模型/调价；Fable 5.2 自查见 11-09 发布说明。
 *     · modelcompare.dev 11-15 changelog 中的大量变动均为 OpenRouter / edenai /
 *       kilo 等**第三方转售平台挂牌价**（且多为折扣档），无官网原文 quote，
 *       与本站「官网报价」口径不同，未录入。
 *  6. 【折扣/限时/溢价档】GPT-6.2 的 Batch 五折、Fast 2x、Ultrafast 3x/6x、
 *     Background 2h -30% / 8h -40%、data residency +10%，以及 Gemini 的
 *     Batch/Flex 一律**不录入价格表**，仅在 note 中逐字列明口径 —— 天然不进
 *     首页均价与最低价。唯一录入的非标准档是 Astra 的「>272K 输入」长上下文
 *     溢价档（tier.kind=long_context + label 含「>」），被 isStandardTier 双重
 *     排除，用于实证档位隔离生效。
 *
 * ════════════════════════════════════════════════════════════════
 * 三、五个必须记住的口径陷阱（写错就是编数据）
 * ════════════════════════════════════════════════════════════════
 *  1. Terminal-Bench 4.0 与 4.1 是两个不同基准：Astra/Sol 的 64.1/60.1 是 AA
 *     评测的 **4.0**（terminal-bench-4）；Neon 的 65.2% 是 Google 官方自测的
 *     **4.1**（terminal-bench-4-1）。绝不互换、绝不合并。
 *  2. 厂商自测 vs 第三方评测：Astra/Sol 的九项分数来自 Artificial Analysis
 *     （第三方，max effort）；Neon 的 65.2 / 46.2 / 12.8 来自 Google 11-18
 *     发布表（厂商自测、未经第三方复现）。每条 score 的 source 逐条标注，
 *     不混成同一口径。
 *  3. 反向指标：AA-Omniscience 幻觉率（Astra 59% / Sol 55%，越低越好）排在本
 *     模型分数数组**末位**，只在「其余基准」完整表出现，不进四项柱图。
 *  4. 智能指数版本：站内既有表为 AA Intelligence Index v5（11-13 榜单），本次
 *     新增为 v5.0.1（11-17/11-18 读数）。Fable 5.2=65 / Carbon=60 /
 *     Opus 5.5=59 在两版读数一致，可横比；但 name/rank 口径各家转录冲突
 *     （heise「No.2」、emergent「3rd out of 96」、Google「#3 overall」且
 *     harperflow 明确称 AA 页面未直接给出 rank），故三个新模型 rank 一律留
 *     null，不用推测值占位 —— 详情页会走「未列入全球排名」分支。
 *  5. 首页最低价 / 均价：只取 isStandardTier 通过的标准档。新模型标准档
 *     3:1 混合价（USD）= Astra 16 / Sol 4 / Neon 6，折算后均远高于现网
 *     最低 0.35 CNY，不会污染首页；长上下文溢价档被排除。
 *
 * 用法：node scripts/apply-data-2026-11-21-gpt62-neon.mjs
 * 幂等：按 id / 复合键 upsert，不删除既有记录，不改动既有 evidence.fetchedAt
 *       （仅新增记录使用本次 AS_OF，绝不篡改旧记录假装重抓）；
 *       snapshot.changes / counts 写绝对值，可重复执行。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = path.join(ROOT, 'data');
const AS_OF = new Date().toISOString();
// 本次快照日期与 ISO 周固定：运行日 2026-11-21 为周六，属 2026-W47
// （W46 的 11-15 是周日、该周最后一天；11-21 不是 W48）。
const TODAY = '2026-11-21';
const WEEK_ID = '2026-W47';
const USD_CNY = 6.7131; // 央行中间价 @ 2026-11-20（周五）；11-21 周六沿用上一交易日

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

// ── 实际取证页 URL（写入 evidence.sourceUrl）─────────────────
const SRC = {
  openaiPrice: 'https://www.promptea.me/en/blog/openai-gpt-6-2-astra-sol-launch',
  openaiCross: 'https://modelsatwork.news/article/openai-gpt-6-2-astra-sol-chatgpt-api-astra-rate-20-percent-lower-ultrafast-3x',
  openaiLong: 'https://www.siliconreport.com/openai-releases-gpt-6-2-astra-and-sol-cutting-astra-api-rates-20',
  neonPrice: 'https://www.cls.cn/detail/2538684',
  neonCross: 'https://www.163.com/dy/article/LC3H928A0514R9OJ.html',
  aaHeise: 'https://www.heise.de/en/news/GPT-6-2-Astra-OpenAI-warns-of-new-risks-from-AI-self-improvement-11529050.html',
  aaIScoop: 'https://www.i-scoop.eu/gpt-6-2-astra-sol',
  aaTable: 'https://www.worldprogramming.org/posts/gpt-62-astra-vs-sol-why-the-2-model-is-the-smarter-default-x4jfav',
  aaEmergent: 'https://emergent.sh/learn/gpt-6-2-astra-vs-claude-fable-5-2',
  aaWentuo: 'https://blog.wentuo.ai/zh-hant/gpt-6-2-sol-daily-tasks-vs-coding-review-zh-hant.html',
  neonHarper: 'https://www.harperflow.io/harperflow-blog/gemini-4-neon-explained-specs-pricing-benchmarks',
  neonBacon: 'https://aibacon.net/posts/google-gemini-4-neon-launch-beats-carbon-coding-agents-32-percent-cheaper-per-task-swe-sweep-12-8-to-39-nov-18.html',
  neonXiaoan: 'https://xiaoan.cc/article/gemini-4-neon-fa-bu-qian-yan-zhi-neng-geng-kuai-geng-pian-yi-baf',
  neonYumiza: 'https://www.yumiza.ph/articles/dfdc93c9f9',
  fxOfficial: 'https://www.financialnews.com.cn/2026-11/20/content_461318.html',
};

const OFFICIAL_OPENAI = 'https://developers.openai.com/api/docs/pricing';
const OFFICIAL_GOOGLE = 'https://ai.google.dev/gemini-api/docs/pricing';

// ═══════════════════════════════════════════
// 1. 模型元数据（3 个新增）
// ═══════════════════════════════════════════
const models = read('seeds/models.json');
const modelsBefore = models.length;
const M = (o) => ({
  id: o.id,
  name: o.name,
  vendor: o.vendor,
  origin: o.origin,
  openWeights: false,
  contextWindow: o.contextWindow ?? null,
  maxOutput: o.maxOutput ?? null,
  releasedAt: o.releasedAt ?? null,
  params: null,
  activeParams: null,
  pricingUrl: o.pricingUrl ?? null,
  docsUrl: o.docsUrl ?? null,
});
upsert(models, 'id', [
  M({
    id: 'gpt-6-2-astra', name: 'GPT-6.2 Astra', vendor: 'OpenAI', origin: 'overseas',
    contextWindow: 1_050_000, maxOutput: 128_000, releasedAt: '2026-11-17',
    pricingUrl: OFFICIAL_OPENAI, docsUrl: 'https://developers.openai.com/api/docs/models/gpt-6.2-astra',
  }),
  M({
    id: 'gpt-6-2-sol', name: 'GPT-6.2 Sol', vendor: 'OpenAI', origin: 'overseas',
    contextWindow: 1_050_000, maxOutput: 128_000, releasedAt: '2026-11-17',
    pricingUrl: OFFICIAL_OPENAI, docsUrl: 'https://developers.openai.com/api/docs/models/gpt-6.2-sol',
  }),
  M({
    id: 'gemini-4-neon', name: 'Gemini 4 Neon', vendor: 'Google', origin: 'overseas',
    contextWindow: 1_048_576, maxOutput: 65_536, releasedAt: '2026-11-18',
    pricingUrl: OFFICIAL_GOOGLE, docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  }),
]);

// ═══════════════════════════════════════════
// 2. 价格记录（3 条标准档 + 1 条长上下文溢价档）
//    非标准档（Batch/Fast/Ultrafast/Background/Priority）一律不录入，
//    只在 note 中逐字说明 —— 不进首页均价与最低价。
// ═══════════════════════════════════════════
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

const QUOTE_OPENAI_STD =
  'Astra costs $8 per million input tokens and $40 per million output tokens, with cached input at $0.40. ' +
  'Sol costs $2 input and $10 output, with cached input at $0.10, the same as GPT-6.1 Sol. ' +
  'A 30-minute cache write costs $10 per million tokens on Astra and $2.50 on Sol.';
const QUOTE_OPENAI_LONG =
  'For requests with more than 272,000 input tokens, OpenAI doubles input and cache rates and applies ' +
  'a 1.5-times multiplier to output tokens, lifting long-context Astra calls to $16 per million input ' +
  'tokens and $60 per million output tokens.';
const QUOTE_NEON_STD =
  '该模型定价为每百万输入token 3美元（缓存输入token享0.5折优惠，仅需0.15美元/百万），每百万输出token 15美元。';

const OPENAI_NOTE_STD =
  '二手来源：OpenAI 官方定价页 https://developers.openai.com/api/docs/pricing 本次实测返回 403 Forbidden（已知阻断），' +
  '无法直连复核，故采用 Promptea 对 OpenAI 官方 model pages 价目表的逐字转录（2026-11-21 核对），' +
  '并与 Models at Work、CASRAI、Silicon Report、I-Scoop、OpenRouter 镜像五家独立站点交叉核对，' +
  '四组数字（$8/$0.40/$40、$2/$0.10/$10）完全一致。原始出处：OpenAI 官方定价页与 GPT-6.2 Astra/Sol model pages。' +
  '本条为标准档（Standard，≤272K 输入 token），按每 1M tokens 计价；cacheWrite 记 30 分钟缓存写入价，' +
  '官方另有 12 小时缓存写入档（更贵、未列具体数值）。' +
  '【不录入的档位，均不参与首页均价与最低价】Batch 半价、Fast 2x、Ultrafast 3x（2027-02-28 前）/6x（2027-03-01 起）、' +
  'Background 2 小时 -30% / 8 小时 -40%、data residency +10%；>272K 输入的长上下文溢价档另列一条。' +
  '两模型均不支持 Flex。1,050,000 token 上下文、最大输出 128,000 token；Astra 知识截止 2026-05-18、Sol 2026-06-01。';
const OPENAI_NOTE_LONG =
  '二手来源：同上，OpenAI 官方页 403 无法直连复核，此档价格取自 Silicon Report 对 OpenAI 官方 model page ' +
  '长上下文计费规则的逐字转录（2026-11-21 核对，页面 HTTP 200 可达），并与 Models at Work' +
  '「Above 272,000 input tokens in one request, input rates double and output costs 1.5 times as much for the whole request」、' +
  'Kingy AI「Astra becomes $16 input and $60 output per million」交叉核对。' +
  '长上下文溢价档：输入 >272,000 token 时输入与缓存读价翻倍、输出按 1.5x 对整次请求计费。' +
  'tier.kind=long_context 且档位标签含「>」，被 isStandardTier 双重排除，' +
  '不参与首页均价、最低价与官方刊例价计算。';

const NEON_NOTE_STD =
  '二手来源：Google 官方定价页 ' + OFFICIAL_GOOGLE + ' 国内网络不可达（已知阻断），' +
  '无法直连复核，故采用财联社《科创板日报》对 Google 2026-11-18 官方发布定价的逐字转录（2026-11-21 核对），' +
  '并与环球网/网易、每日经济新闻、百度百科、CSuite 五家独立来源交叉核对，$3/$0.15/$15 完全一致。' +
  '原始出处：Google「Introducing Gemini 4 Neon」官方发布页（2026-11-18）与 Google Cloud「Agent Platform Pricing」价目表。' +
  '本条为付费层标准档（官方明确无免费 API tier），按每 1M tokens 计价；缓存输入享 0.5 折（即输入价的 5%）为常设缓存读价，' +
  '非限时促销；官方未单列缓存写入费，cacheWrite 记 null。' +
  '四档推理级别 low/medium/high/xhigh 属 effort 设置、不是价格档，不另列报价。' +
  '输出价是否含 thinking tokens 官方转录未说明，此处不推测。1,048,576 token 上下文，同步输出上限 65,536 token。' +
  '窗口内另有 12-01 起 Carbon/Argon 引入价到期的预告，与本模型无关。';

const prices = read('prices.json');
const pricesBefore = prices.length;
upsertPrices(prices, [
  {
    modelId: 'gpt-6-2-astra', vendorModelId: 'gpt-6.2-astra', channelId: 'openai',
    billingMode: 'payg', currency: 'USD',
    input: 8, cacheRead: 0.4, cacheWrite: 10, output: 40,
    tier: { kind: 'none' }, tierLabel: null,
    promotional: false, promoNote: null,
    note: OPENAI_NOTE_STD.replace('两模型均不支持 Flex。', 'Astra 较 GPT-6 Astra（$10/$50）降价 20%，缓存读价降 60%。两模型均不支持 Flex。'),
    evidence: { sourceUrl: SRC.openaiPrice, fetchedAt: AS_OF, quote: QUOTE_OPENAI_STD, pageUpdatedAt: null },
    ...PACKAGE_FIELDS,
  },
  {
    modelId: 'gpt-6-2-astra', vendorModelId: 'gpt-6.2-astra', channelId: 'openai',
    billingMode: 'payg', currency: 'USD',
    input: 16, cacheRead: null, cacheWrite: null, output: 60,
    tier: { kind: 'long_context', threshold: 272_000, unit: 'token', note: '官网口径：Over 272K tokens' },
    tierLabel: '>272K 输入',
    promotional: false, promoNote: null,
    note: OPENAI_NOTE_LONG + ' 该档只公开输入 $16 / 输出 $60，未单列缓存读价，故 cacheRead 记 null（不推测）。',
    evidence: { sourceUrl: SRC.openaiLong, fetchedAt: AS_OF, quote: QUOTE_OPENAI_LONG, pageUpdatedAt: null },
    ...PACKAGE_FIELDS,
  },
  {
    modelId: 'gpt-6-2-sol', vendorModelId: 'gpt-6.2-sol', channelId: 'openai',
    billingMode: 'payg', currency: 'USD',
    input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10,
    tier: { kind: 'none' }, tierLabel: null,
    promotional: false, promoNote: null,
    note: OPENAI_NOTE_STD.replace('两模型均不支持 Flex。', 'Sol 定价与 GPT-6.1 Sol 完全一致（$2/$10/$0.10），为 Astra 的四分之一。两模型均不支持 Flex。'),
    evidence: { sourceUrl: SRC.openaiPrice, fetchedAt: AS_OF, quote: QUOTE_OPENAI_STD, pageUpdatedAt: null },
    ...PACKAGE_FIELDS,
  },
  {
    modelId: 'gemini-4-neon', vendorModelId: 'gemini-4-neon', channelId: 'google-ai-studio',
    billingMode: 'payg', currency: 'USD',
    input: 3, cacheRead: 0.15, cacheWrite: null, output: 15,
    tier: { kind: 'none' }, tierLabel: null,
    promotional: false, promoNote: null,
    note: NEON_NOTE_STD,
    evidence: { sourceUrl: SRC.neonPrice, fetchedAt: AS_OF, quote: QUOTE_NEON_STD, pageUpdatedAt: null },
    ...PACKAGE_FIELDS,
  },
]);

// ═══════════════════════════════════════════
// 3. 基准定义（新增 2 项，均为「不与站内既有基准混口径」的独立 ID）
// ═══════════════════════════════════════════
const benchmarks = read('seeds/benchmarks.json');
const benchmarksBefore = benchmarks.length;
upsert(benchmarks, 'id', [
  {
    id: 'hle-diamond',
    name: 'HLE-Diamond（AA v5.0.1）',
    category: 'knowledge',
    summary: "Artificial Analysis Intelligence Index v5.0.1 九项子评测之一， Humanity's Last Exam 的 Diamond 子集，考察高难度推理与专业知识。",
    explanation:
      '与站内已有的 hle-full-tools（HLE Full w/ tools）不是同一题目集与配置：本项是 AA v5.0.1 的 HLE-Diamond 子集（max effort），' +
      '分数不可与 hle-full-tools 直接横比。GPT-6.2 Astra 72.2% / Sol 64.0% 来自 Artificial Analysis 第三方评测的逐字转录，非厂商自测。',
    useCase: '对比 AA v5.0.1 榜单内部各模型的高难度推理表现',
    scoring: '答题正确率（%）',
    scale: '百分比',
    vendorOwned: false,
    url: 'https://artificialanalysis.ai',
  },
  {
    id: 'frontiercode-2',
    name: 'FrontierCode 2.0（Google 发布表口径）',
    category: 'coding',
    summary: '考察对真实开源代码库提交的改动是否达到项目维护者可合并标准的编码基准。',
    explanation:
      '本项记录 Google 2026-11-18 Gemini 4 Neon 官方发布表披露的「FrontierCode 2.0」自测值（46.2%，默认 high 档），' +
      '属厂商自测、未经第三方独立复现。与 Artificial Analysis 的「FrontierCode-AA 2.0」虽同名但评测配置与 harness 不同，' +
      '分数不可直接横比，故单独建 ID、不并入站内任何 AA 口径基准。',
    useCase: '核对 Google 官方发布表口径，区分厂商自测与第三方评测时',
    scoring: '可合并改动通过率（%）',
    scale: '百分比',
    vendorOwned: false,
    url: null,
  },
]);

// ═══════════════════════════════════════════
// 4. 基准分数
//    数组顺序 = 详情页柱图候选顺序（KEY 优先 + 其余按此顺序补位）
//    · Astra / Sol：4 项正向 AA 第三方分数在前，幻觉率（反向）排末位
//    · Neon：3 项 Google 官方自测（均为 4.1 / 2.0 / mini-SWE 口径）
// ═══════════════════════════════════════════
const scores = read('seeds/scores.json');
const scoresBefore = scores.length;
const S = (modelId, benchmarkId, value, source, sourceUrl, extra = {}) => ({
  modelId, benchmarkId, value,
  effort: extra.effort ?? null,
  includesFallback: null, includesCyberguards: null,
  source, sourceUrl,
  measuredAt: extra.measuredAt ?? '2026-11-17',
});

const AA_MAX =
  'Artificial Analysis Intelligence Index v5.0.1 九项子评测（第三方评测，max effort；' +
  'World Programming 逐字转录 AA 对比表，并与 Emergent.sh / OpenRouter 镜像交叉核对，2026-11-21 读取）';
const AA_HALLU =
  'Artificial Analysis AA-Omniscience 幻觉率（Max 档，越低越好；WentuoAI 逐字转录并与 I-Scoop 交叉核对）。' +
  '反向指标，仅进完整基准表，不进四项柱图';
const GOOGLE_SELF =
  'Google 2026-11-18 Gemini 4 Neon 官方发布表（厂商自测、未经第三方独立复现；' +
  'HarperFlow / AI Bacon / 小安 逐字转录，2026-11-21 读取）。与站内 AA 口径不可横比';

upsertScores(scores, [
  // ── GPT-6.2 Astra：AA v5.0.1 max effort（第三方）──
  S('gpt-6-2-astra', 'terminal-bench-4', 64.1,
    `${AA_MAX}；Terminal-Bench **4.0** = 64.1%，与 4.1 不同版本`, SRC.aaTable, { effort: 'max' }),
  S('gpt-6-2-astra', 'gdp-pdf', 29.8,
    `${AA_MAX}；GDP.pdf = 29.8%`, SRC.aaEmergent, { effort: 'max' }),
  S('gpt-6-2-astra', 'terminal-bench-science', 78.1,
    `${AA_MAX}；Terminal-Bench-Science 0.1 = 78.1%`, SRC.aaTable, { effort: 'max' }),
  S('gpt-6-2-astra', 'hle-diamond', 72.2,
    `${AA_MAX}；HLE-Diamond = 72.2%（非 hle-full-tools 口径）`, SRC.aaEmergent, { effort: 'max' }),
  // 反向指标排末位
  S('gpt-6-2-astra', 'aa-omniscience-hallucination', 59,
    `${AA_HALLU}；Astra 59%（同期 Sol 55%）`, SRC.aaWentuo, { effort: 'max' }),

  // ── GPT-6.2 Sol：AA v5.0.1 max effort（第三方）──
  S('gpt-6-2-sol', 'terminal-bench-4', 60.1,
    `${AA_MAX}；Terminal-Bench **4.0** = 60.1%，与 4.1 不同版本`, SRC.aaTable, { effort: 'max' }),
  S('gpt-6-2-sol', 'gdp-pdf', 30.0,
    `${AA_MAX}；GDP.pdf = 30.0%`, SRC.aaTable, { effort: 'max' }),
  S('gpt-6-2-sol', 'terminal-bench-science', 67.6,
    `${AA_MAX}；Terminal-Bench-Science 0.1 = 67.6%`, SRC.aaTable, { effort: 'max' }),
  S('gpt-6-2-sol', 'hle-diamond', 64.0,
    `${AA_MAX}；HLE-Diamond = 64.0%（非 hle-full-tools 口径）`, SRC.aaTable, { effort: 'max' }),
  // 反向指标排末位
  S('gpt-6-2-sol', 'aa-omniscience-hallucination', 55,
    `${AA_HALLU}；Sol 55%（同期 Astra 59%）`, SRC.aaWentuo, { effort: 'max' }),

  // ── Gemini 4 Neon：Google 官方发布表（厂商自测，与 AA 分开标注）──
  S('gemini-4-neon', 'terminal-bench-4-1', 65.2,
    `${GOOGLE_SELF}；Terminal-Bench **4.1** = 65.2%，与站内 4.0 版题目集不同，不可直接比较`, SRC.neonHarper,
    { effort: 'high', measuredAt: '2026-11-18' }),
  S('gemini-4-neon', 'frontiercode-2', 46.2,
    `${GOOGLE_SELF}；FrontierCode 2.0 默认 high 档 = 46.2%，与 AA 的 FrontierCode-AA 2.0 不同配置`, SRC.neonXiaoan,
    { effort: 'high', measuredAt: '2026-11-18' }),
  S('gemini-4-neon', 'swe-sweep', 12.8,
    `${GOOGLE_SELF}；SWE-sweep mini-SWE 独立 harness = 12.8%。同一权重在 Antigravity harness 下为 39%，` +
    `属不同外围框架口径，本条只记 solo harness 值、不与 39% 混写`, SRC.neonBacon,
    { measuredAt: '2026-11-18' }),
]);

// ═══════════════════════════════════════════
// 5. 智能指数（AA v5.0.1 第三方；rank 留 null，不推测名次）
// ═══════════════════════════════════════════
const intelligence = read('seeds/intelligence.json');
const AA_V501 = 'Artificial Analysis Intelligence Index v5.0.1（第三方评测）';
upsert(intelligence, 'modelId', [
  {
    modelId: 'gpt-6-2-astra',
    index: 62,
    rank: null,
    costPerTaskUsd: 4.00,
    outputTokensPerSec: 49,
    source: AA_V501,
    measuredAt: '2026-11-17',
    aaName: 'GPT-6.2 Astra (max)',
    note:
      'AA v5.0.1 综合指数 62（max / xhigh effort 同分），单任务成本 $4.00、输出约 49 tokens/s。' +
      '逐字来源：heise「GPT-6.2 Astra scores 62 points on the Intelligence Index with maximum reasoning effort」、' +
      'I-Scoop「GPT-6.2 Astra 62 $4.00」「Source: Artificial Analysis Intelligence Index, 17 November 2026」、' +
      'Emergent.sh（62 @ Max / 49 tokens per second）交叉核对。' +
      'rank 留 null：各家转录名次冲突（heise「No.2」、Emergent「3rd out of 96 models」、I-Scoop「ranks second」），' +
      '且含 effort 变体，不用推测值占位；详情页走「未列入全球排名」分支。' +
      '与站内 AA v5（11-13 榜单）可横比：Fable 5.2=65 / Carbon=60 / Opus 5.5=59 两版读数一致。',
  },
  {
    modelId: 'gpt-6-2-sol',
    index: 57,
    rank: null,
    costPerTaskUsd: 1.01,
    outputTokensPerSec: null,
    source: AA_V501,
    measuredAt: '2026-11-17',
    aaName: 'GPT-6.2 Sol (max)',
    note:
      'AA v5.0.1 综合指数 57（max effort），单任务成本 $1.01，与上一代旗舰 GPT-6 Astra 同分但成本约其 1/6。' +
      '逐字来源：heise「GPT-6.2 Sol gains two points to reach 57」、I-Scoop「GPT-6.2 Sol 57 $1.01」、' +
      'World Programming 九项对比表交叉核对。输出速度官方/第三方未给出本档可靠数值，留 null。' +
      'rank 留 null，理由同 Astra。',
  },
  {
    modelId: 'gemini-4-neon',
    index: 61,
    rank: null,
    costPerTaskUsd: null,
    outputTokensPerSec: 110,
    source: AA_V501,
    measuredAt: '2026-11-18',
    aaName: 'Gemini 4 Neon (xhigh)',
    note:
      'AA v5.0.1 综合指数 61（xhigh effort），输出速度 110 tokens/s（Yumiza 逐字转录「Artificial Analysis measures Neon ' +
      'at 110 tokens per second」）。逐字来源：HarperFlow「Gemini 4 Neon scores 61 at xhigh on the Artificial Analysis ' +
      'Intelligence Index as of Nov 18, 2026」「The provider page confirms the 61 score for Neon Xhigh」、' +
      '百度百科「智能指数61分居全球第三」、环球网「在xhigh最高推理档位下…智能指数榜单位列第三」交叉核对。' +
      'programming-AA 的「编程 AI 智能体指数 58.6 分 / 第一」是另一套独立指数，不并入本项。' +
      'costPerTaskUsd 留 null：唯一公开的 $3.74/任务是 high 档（对应 60 分）的成本，与 xhigh 档 61 分不同口径，不混写。' +
      'rank 留 null：HarperFlow 明确指出 AA provider 页面未直接给出「#3 overall」名次，该说法系 Google 归因，' +
      '按不推测占位原则留空。',
  },
]);

// ═══════════════════════════════════════════
// 6. 汇率（fx.json）：追加 2026-11-20 央行中间价
// ═══════════════════════════════════════════
const fx = read('fx.json');
if (!fx.rates.some((r) => r.date === '2026-11-20')) {
  fx.rates.push({
    date: '2026-11-20',
    usdCny: USD_CNY,
    source: '中国人民银行授权中国外汇交易中心公布 · 银行间外汇市场人民币汇率中间价',
    sourceUrl: SRC.fxOfficial,
  });
  fx.rates.sort((a, b) => a.date.localeCompare(b.date));
}

// ═══════════════════════════════════════════
// 7. 本期变动（changes.json）：3 个新增模型，按复合键去重保证幂等
// ═══════════════════════════════════════════
const changes = read('changes.json');
const changeKey = (c) => `${c.modelId}|${c.channelId}|${c.kind}|${c.tierLabel ?? ''}`;
const changeIdx = new Set(changes.map(changeKey));
const blendUsd = (input, output) => (input * 3 + output) / 4;
for (const c of [
  {
    kind: 'added', modelId: 'gpt-6-2-astra', channelId: 'openai', billingMode: 'payg',
    fromCny: null, toCny: Math.round(blendUsd(8, 40) * USD_CNY * 100) / 100,
    delta: null, tierLabel: null,
  },
  {
    kind: 'added', modelId: 'gpt-6-2-sol', channelId: 'openai', billingMode: 'payg',
    fromCny: null, toCny: Math.round(blendUsd(2, 10) * USD_CNY * 100) / 100,
    delta: null, tierLabel: null,
  },
  {
    kind: 'added', modelId: 'gemini-4-neon', channelId: 'google-ai-studio', billingMode: 'payg',
    fromCny: null, toCny: Math.round(blendUsd(3, 15) * USD_CNY * 100) / 100,
    delta: null, tierLabel: null,
  },
]) {
  if (!changeIdx.has(changeKey(c))) {
    changes.push(c);
    changeIdx.add(changeKey(c));
  }
}

// ═══════════════════════════════════════════
// 8. 快照元信息（snapshot.json）
//    只更新本次真实变动的两个渠道 dataAsOf；其它渠道一律保留原值，
//    不伪造「全量重抓」。counts / changes 写绝对值保证幂等。
// ═══════════════════════════════════════════
const snapshot = read('snapshot.json');
snapshot.id = WEEK_ID;
snapshot.date = TODAY;
snapshot.usdCny = USD_CNY;

const byChannel = new Map();
for (const p of prices) byChannel.set(p.channelId, (byChannel.get(p.channelId) ?? 0) + 1);
for (const [cid, n] of [
  ['openai', 3],
  ['google-ai-studio', 1],
]) {
  snapshot.channelStatus[cid] = {
    ...(snapshot.channelStatus[cid] ?? {}),
    channelId: cid,
    status: 'ok',
    dataAsOf: AS_OF,
    records: byChannel.get(cid) ?? 0,
    error: null,
    changes: n, // 绝对值：本次该渠道新增记录数
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

// ═══════════════════════════════════════════
// 落盘
// ═══════════════════════════════════════════
write('seeds/models.json', models);
write('prices.json', prices);
write('seeds/benchmarks.json', benchmarks);
write('seeds/scores.json', scores);
write('seeds/intelligence.json', intelligence);
write('fx.json', fx);
write('changes.json', changes);
write('snapshot.json', snapshot);

console.log('════════ 2026-11-21 GPT-6.2 / Gemini 4 Neon 数据更新 ════════');
console.log(`模型      ${modelsBefore} → ${models.length}（新增 3）`);
console.log(`价格      ${pricesBefore} → ${prices.length}（新增 ${prices.length - pricesBefore}，含 1 条长上下文溢价档）`);
console.log(`基准定义  ${benchmarksBefore} → ${benchmarks.length}（新增 2）`);
console.log(`基准分数  ${scoresBefore} → ${scores.length}（新增 ${scores.length - scoresBefore}）`);
console.log(`智能指数  新增/更新 3（Astra 62 / Sol 57 / Neon 61，rank=null）`);
console.log(`汇率      ${USD_CNY} @ 2026-11-20（周六沿用上一交易日）`);
console.log(`快照      ${snapshot.id} / ${snapshot.date}`);
console.log(`counts    ${JSON.stringify(snapshot.counts)}`);
console.log(`抓取时间  ${AS_OF}`);
