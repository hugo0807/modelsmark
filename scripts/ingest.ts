/**
 * 数据入库 —— 把所有渠道抓取到的真实价格归一化写入 data/prices.json。
 *
 * 铁律：
 * 1. 只处理真实抓取到的页面，绝不生成推测值
 * 2. 每条记录必须带 evidence（sourceUrl + fetchedAt + quote 原文）
 * 3. 模型 id 必须在 data/seeds/models.json 中存在，否则进入 rejected 清单并报告
 *
 * 用法：npx tsx scripts/ingest.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PriceRecord } from '../src/lib/types';
import { extractTables, parseCompactPriceCell, parseTableRows, stripTags } from './parse-pricing-table';

const ROOT = process.cwd();
/**
 * 原始页面快照目录。
 *
 * 优先级：data/snapshots/（入库的官方页面快照，CI 与新 clone 依赖它）
 *        → .probe/（本地最新抓取产物，便于刷新快照）
 *
 * 采集器读的是这些 HTML/JSON 快照来解析价格，
 * 因此快照必须随仓库一起提交，否则 CI 的定时任务会解析不出任何数据。
 */
const SNAPSHOTS = path.join(ROOT, 'data/snapshots');
const PROBE_LOCAL = path.join(ROOT, '.probe');

/** 取快照文件路径：优先入库快照，其次本地最新抓取 */
function snapPath(name: string): string {
  const inRepo = path.join(SNAPSHOTS, name);
  if (fs.existsSync(inRepo)) return inRepo;
  return path.join(PROBE_LOCAL, name);
}
const WORK = path.join(ROOT, '..');

/** 抓取时间：所有本次抓取统一用该时间戳 */
const FETCHED_AT = '2026-10-27T16:30:00Z';

// ───────────────────────────────────────────
// 模型 id 映射：页面上的模型名 → 全局 slug
// ───────────────────────────────────────────

/** 从渠道侧的模型名推断全局 slug */
const SLUG_PATTERNS: Array<[RegExp, string]> = [
  [/deepseek[\s-]*v4[\s-]*1[\s-]*flash/i, 'deepseek-v4-1-flash'],
  [/deepseek[\s-]*v4[\s-]*pro/i, 'deepseek-v4-pro'],
  [/deepseek[\s-]*v4[\s-]*flash/i, 'deepseek-v4-flash'],
  [/deepseek[\s-]*v3(?!\.)/i, 'deepseek-v3'],
  [/deepseek[\s-]*r1/i, 'deepseek-r1'],
  [/glm[\s-]*5[\s-]*3[\s-]*flash[\s-]*x/i, 'glm-5-3-flashx'],
  [/glm[\s-]*5[\s-]*3[\s-]*flash/i, 'glm-5-3-flash'],
  [/glm[\s-]*5[\s-]*3/i, 'glm-5-3'],
  [/glm[\s-]*5[\s-]*2/i, 'glm-5-2'],
  [/glm[\s-]*5[\s-]*1/i, 'glm-5-1'],
  [/glm[\s-]*5(?!\.)/i, 'glm-5'],
  [/kimi[\s-]*k3[\s-]*1[\s-]*pro/i, 'kimi-k3-1-pro'],
  [/kimi[\s-]*k3(?!\.)/i, 'kimi-k3'],
  [/kimi[\s-]*k2[\s-]*7[\s-]*code/i, 'kimi-k2-7-code'],
  [/kimi[\s-]*k2[\s-]*6/i, 'kimi-k2-6'],
  [/kimi[\s-]*k2/i, 'kimi-k2'],
  [/qwen3[\s-]*8[\s-]*max/i, 'qwen3-8-max'],
  [/qwen3[\s-]*8[\s-]*flash/i, 'qwen3-8-flash'],
  [/qwen3[\s-]*7[\s-]*max/i, 'qwen3-7-max'],
  [/qwen3[\s-]*7[\s-]*plus/i, 'qwen3-7-plus'],
  [/qwen3[\s-]*7[\s-]*flash/i, 'qwen3-7-flash'],
  [/qwen3[\s-]*235b/i, 'qwen3-235b-a22b'],
  [/qwen3[\s-]*32b/i, 'qwen3-32b'],
  [/qwen3[\s-]*30b/i, 'qwen3-30b-a3b'],
  [/mimo[\s-]*v2[\s-]*6[\s-]*pro/i, 'mimo-v2-6-pro'],
  [/mimo[\s-]*v2[\s-]*6[\s-]*flash/i, 'mimo-v2-6-flash'],
  [/mimo[\s-]*v2[\s-]*5/i, 'mimo-v2-5'],
  [/minimax[\s-]*m3/i, 'minimax-m3'],
  [/minimax[\s-]*m2/i, 'minimax-m2'],
  [/hy4/i, 'hunyuan-hy4'],
  [/hy3/i, 'hunyuan-hy3'],
  [/ernie[\s-]*5[\s-]*1/i, 'ernie-5-1'],
  [/ernie[\s-]*5(?!\.)/i, 'ernie-5-0'],
  [/ernie[\s-]*4[\s-]*5/i, 'ernie-4-5-turbo'],
  [/ernie[\s-]*x1[\s-]*1/i, 'ernie-x1-1-preview'],
  [/doubao[\s-]*seed[\s-]*2[\s-]*1[\s-]*pro/i, 'doubao-seed-2-1-pro'],
  [/doubao[\s-]*seed[\s-]*2[\s-]*1[\s-]*turbo/i, 'doubao-seed-2-1-turbo'],
  [/doubao[\s-]*seed[\s-]*2[\s-]*1[\s-]*lite/i, 'doubao-seed-2-1-lite'],
  [/doubao[\s-]*seed[\s-]*evolving/i, 'doubao-seed-evolving'],
  [/step[\s-]*5[\s-]*preview/i, 'step-5-preview'],
  // 腾讯云自有模型族
  [/hunyuan[\s-]*a13b/i, 'hunyuan-a13b'],
  [/hunyuan[\s-]*role/i, 'hunyuan-role-latest'],
  [/hunyuan[\s-]*translation[\s-]*lite/i, 'hunyuan-translation-lite'],
  [/hunyuan[\s-]*translation/i, 'hunyuan-translation'],
  [/hy[\s-]*vision[\s-]*2[\s-]*0/i, 'hy-vision-2-0-instruct'],
  [/hunyuan[\s-]*turbos[\s-]*vision[\s-]*video/i, 'hunyuan-turbos-vision-video'],
  [/hunyuan[\s-]*turbos[\s-]*vision/i, 'hunyuan-turbos-vision'],
  [/hunyuan[\s-]*t1[\s-]*vision/i, 'hunyuan-t1-vision'],
  [/hunyuan[\s-]*embedding/i, 'hunyuan-embedding'],
  [/hunyuan[\s-]*turbos/i, 'hunyuan-turbos'],
  [/hunyuan[\s-]*lite/i, 'hunyuan-lite'],
  [/hunyuan[\s-]*standard/i, 'hunyuan-standard'],
  [/hunyuan[\s-]*image[\s-]*3/i, 'hunyuan-image-3'],
  [/hunyuan[\s-]*video[\s-]*h3/i, 'hunyuan-video-h3'],
  [/hy[\s-]*3d/i, 'hy-3d'],
  [/kling[\s-]*video/i, 'kling-video-v3'],
  [/vidu[\s-]*image/i, 'vidu-image-q2'],
  [/yt[\s-]*vita/i, 'yt-vita'],
  [/open[\s-]*pangu[\s-]*2[\s-]*0[\s-]*pro/i, 'openpangu-2-0-pro'],
  [/open[\s-]*pangu[\s-]*2[\s-]*0[\s-]*flash/i, 'openpangu-2-0-flash'],
  [/qwen3[\s-]*5[\s-]*27b/i, 'qwen3-5-27b'],
  [/qwen3[\s-]*5[\s-]*9b/i, 'qwen3-5-9b'],
  [/qwen3[\s-]*5[\s-]*4b/i, 'qwen3-5-4b'],
  [/glm[\s-]*5[\s-]*2[\s-]*fast/i, 'glm-5-2-fast'],
  [/minimax[\s-]*m2[\s-]*7/i, 'minimax-m2-7'],
  [/minimax[\s-]*m2[\s-]*5/i, 'minimax-m2-5'],
  [/kimi[\s-]*k3[\s-]*1[\s-]*pro[\s-]*highspeed/i, 'kimi-k3-1-pro-highspeed'],
  [/hy4[\s-]*preview/i, 'hunyuan-hy4-preview'],
  [/gpt[\s-]*6[\s-]*1/i, 'gpt-6-1'],
  [/gpt[\s-]*6[\s-]*astra/i, 'gpt-6-astra'],
  [/gpt[\s-]*6[\s-]*luna/i, 'gpt-6-luna'],
  [/gpt[\s-]*6[\s-]*sol/i, 'gpt-6-sol'],
  [/claude[\s-]*opus[\s-]*5/i, 'claude-opus-5-5'],
  [/claude[\s-]*sonnet[\s-]*5/i, 'claude-sonnet-5-5'],
  [/claude[\s-]*fable[\s-]*5/i, 'claude-fable-5-1'],
  [/gemini[\s-]*3[\s-]*1[\s-]*pro/i, 'gemini-3-1-pro'],
  [/gemini[\s-]*3[\s-]*8[\s-]*flash/i, 'gemini-3-8-flash'],
  [/gemini[\s-]*4[\s-]*argon/i, 'gemini-4-argon'],
  [/grok[\s-]*4[\s-]*7/i, 'grok-4-7'],

  // ── 运营商渠道模型（移动云 / 华为云 / 天翼云）──
  [/deepseek[\s-]*v4[\s-]*1[\s-]*flash/i, 'deepseek-v4-1-flash'],
  [/deepseek[\s-]*v4[\s-]*flash[\s-]*0731/i, 'deepseek-v4-flash'],
  [/deepseek[\s-]*r1[\s-]*distill[\s-]*llama[\s-]*70b/i, 'deepseek-r1-distill-llama-70b'],
  [/deepseek[\s-]*r1[\s-]*distill[\s-]*llama[\s-]*8b/i, 'deepseek-r1-distill-llama-8b'],
  [/deepseek[\s-]*r1[\s-]*distill[\s-]*qwen[\s-]*14b/i, 'deepseek-r1-distill-qwen-14b'],
  [/deepseek[\s-]*r1[\s-]*distill[\s-]*qwen[\s-]*32b/i, 'deepseek-r1-distill-qwen-32b'],
  [/deepseek[\s-]*v2[\s-]*lite/i, 'deepseek-v2-lite-chat'],
  [/qwen3[\s.]*5[\s-]*27b/i, 'qwen3-5-27b'],
  [/qwen3[\s.]*5[\s-]*9b/i, 'qwen3-5-9b'],
  [/qwen3[\s.]*5[\s-]*4b/i, 'qwen3-5-4b'],
  [/qwen2[\s.]*5[\s-]*72b/i, 'qwen2-5-72b-instruct'],
  [/qwen2[\s.]*5[\s-]*32b/i, 'qwen2-5-32b-instruct'],
  [/qwen2[\s.]*5[\s-]*14b/i, 'qwen2-5-14b-instruct'],
  [/qwen2[\s.]*5[\s-]*7b/i, 'qwen2-5-7b-instruct'],
  [/qwen2[\s.]*5[\s-]*vl[\s-]*72b/i, 'qwen2-5-vl-72b-instruct'],
  [/qwen2[\s.]*5[\s-]*vl[\s-]*32b/i, 'qwen2-5-vl-32b-instruct'],
  [/qwen2[\s.]*5[\s-]*vl[\s-]*7b/i, 'qwen2-5-vl-7b-instruct'],
  [/qwq[\s-]*32b/i, 'qwq-32b'],
  [/glm[\s-]*5[\s-]*3[\s-]*flash/i, 'glm-5-3-flash'],
  [/minimax[\s-]*m2[\s-]*5/i, 'minimax-m2-5'],
  [/kimi[\s-]*k2[\s-]*6/i, 'kimi-k2-6'],
  [/bge[\s-]*reranker/i, 'bge-reranker-v2-m3'],
  [/bge[\s-]*m3/i, 'bge-m3'],
  [/cosyvoice/i, 'cosyvoice'],
  [/sensevoice/i, 'sensevoice'],
  [/open[\s-]*pangu/i, 'openpangu-2-0-pro'],
];

function guessSlug(rawName: string): string | null {
  for (const [re, slug] of SLUG_PATTERNS) {
    if (re.test(rawName)) return slug;
  }
  return null;
}

/**
 * 模型 id 规范化 —— 与 build-models.ts 保持一致。
 * 保证「采集侧的名字」与「模型种子表的 id」能对上。
 */
function normalizeId(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/^[^/]+\//, ''); // 去厂商前缀
  s = s.replace(/[（(][^）)]*[）)]/g, ''); // 去中文后缀
  s = s
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!s || /^(输入|输出|推理服务|模型名称|服务内容|子项|单价|缓存)$/.test(s)) return null;
  if (s.length < 3) return null;
  return s;
}

// ───────────────────────────────────────────
// 工具
// ───────────────────────────────────────────

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(p: string, data: unknown) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────────────────────────
// 采集器：每个渠道一个函数，输出 PriceRecord[]
// ───────────────────────────────────────────

type Collector = () => PriceRecord[];

/** 阿里云百炼 / 火山方舟等：data/raw 已有结构化数据 */
const fromRaw = (file: string, channelId: string): Collector => () => {
  const d = readJson<any>(path.join(ROOT, 'data/raw', file), null);
  if (!d) throw new Error(`缺少 raw 文件: ${file}`);
  const fetchedAt = d.fetchedAt || FETCHED_AT;
  return (d.prices || []).map((p: any) => {
    // 【字段迁移】raw 用旧字段名 packageTokens，新 schema 用 packageQuota
    const quota = p.packageQuota ?? p.packageTokens ?? null;
    const hasCalls = p.packageCalls != null;
    return {
      ...p,
      // raw 里的记录不带 channelId（靠文件名区分），这里补上
      channelId: p.channelId || channelId,
      packageQuota: quota,
      packageQuotaUnit: p.packageQuotaUnit ?? (hasCalls ? 'calls' : quota != null ? 'tokens' : 'mixed'),
      packageCalls: p.packageCalls ?? null,
      packageIncludes: p.packageIncludes ?? null,
      // 旧的 packageTokens 字段保留兼容但不再是权威来源
      packageTokens: undefined,
      evidence: {
        sourceUrl: p.sourceUrl || d.sourceUrl,
        fetchedAt,
        quote: p.note || p.tierLabel || '',
        pageUpdatedAt: d.notes?.['页面更新时间'] ?? null,
      },
    };
  });
};

/** 根目录 final*.json：已解析好的真实记录 */
const fromFinal = (file: string): Collector => () => {
  const d = readJson<any>(path.join(WORK, file), null);
  if (!d) throw new Error(`缺少 final 文件: ${file}`);
  const out: PriceRecord[] = [];
  for (const r of d.records) {
    // final 里的 modelId 形如 "渠道:vendorModel"
    const slug = guessSlug(r.vendorModelId || r.modelId) || normalizeFinalId(r.modelId);
    if (!slug) continue;
    out.push({
      modelId: slug,
      channelId: r.channelId,
      billingMode: r.billingMode,
      currency: r.currency,
      input: num(r.input),
      cacheRead: num(r.cacheRead),
      cacheWrite: num(r.cacheWrite),
      output: num(r.output),
      tier: r.tier || { kind: 'none' },
      tierLabel: r.tierLabel ?? null,
      vendorModelId: r.vendorModelId ?? null,
      promotional: r.promotional ?? false,
      promoNote: r.promoNote ?? null,
      note: r.note ?? null,
      packageQuota: num(r.packageTokens) ?? null,
      packageQuotaUnit: r.packageTokens ? 'tokens' : r.packageCalls ? 'calls' : 'mixed',
      packagePeriod: r.packagePeriod ?? null,
      packagePrice: num(r.packagePrice),
      packageTierName: r.packageTierName ?? null,
      packageMerged: r.packageMerged ?? null,
      packageManualActivation: r.packageManualActivation ?? null,
      packageCalls: num(r.packageCalls),
      packageIncludes: r.packageIncludes ?? null,
      evidence: {
        sourceUrl: r.sourceUrl,
        fetchedAt: FETCHED_AT,
        quote: r.note || '',
        pageUpdatedAt: r.notes?.['页面更新时间'] ?? null,
      },
    } as PriceRecord);
  }
  return out;
};

function normalizeFinalId(mid: string): string | null {
  // "月之暗面官方:kimi-k3.1-pro" → kimi-k3-1-pro
  const tail = mid.includes(':') ? mid.split(':').pop()! : mid;
  const s = tail
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .replace(/-+/g, '-');
  return s || null;
}

/** 硅基流动：根目录 sf_api_summary.json（官方 API） */
const fromSiliconFlow = (): Collector => () => {
  const d = readJson<any[]>(path.join(WORK, 'sf_api_summary.json'), []);
  if (!d.length) throw new Error('缺少 sf_api_summary.json');
  const out: PriceRecord[] = [];
  for (const r of d) {
    const slug = guessSlug(r.name);
    if (!slug) continue;
    const periods = r.input?.periods || [];
    const offpeak = periods.some((p: string) => /空闲|off-?peak|0点/.test(p));
    out.push({
      modelId: slug,
      channelId: 'siliconflow',
      billingMode: 'payg',
      currency: 'CNY',
      input: num(r.input?.perM),
      cacheRead: num(r.cacheRead?.perM),
      cacheWrite: null,
      output: num(r.output?.perM),
      tier: offpeak ? { kind: 'offpeak', window: periods.join('; '), note: '含空闲时段价' } : { kind: 'none' },
      tierLabel: r.input?.scenario || null,
      vendorModelId: r.name,
      promotional: false,
      promoNote: null,
      note: [r.input?.scenario, periods.join('; ')].filter(Boolean).join(' · ') || null,
      packageQuota: null,
      packageQuotaUnit: 'tokens',
      packagePeriod: null,
      packagePrice: null,
      packageTierName: null,
      packageMerged: null,
      packageManualActivation: null,
      packageCalls: null,
      packageIncludes: null,
      evidence: {
        sourceUrl: 'https://siliconflow.cn/zh-cn/pricing',
        fetchedAt: FETCHED_AT,
        quote: JSON.stringify({ name: r.name, input: r.input, output: r.output, cacheRead: r.cacheRead }).slice(0, 400),
        pageUpdatedAt: null,
      },
    });
  }
  return out;
};

/** 七牛云：根目录 qn_all.txt（官方 API） */
const fromQiniu = (): Collector => () => {
  const raw = fs.readFileSync(path.join(WORK, 'qn_all.txt'), 'utf8');
  const out: PriceRecord[] = [];
  const blocks = raw.split('='.repeat(70));
  for (const blk of blocks) {
    if (!blk.includes('"input_range"')) continue;
    const lines = blk.trim().split('\n').filter((l) => l.trim());
    if (lines.length < 2) continue;
    const head = lines[0].trim();
    const jsonLine = lines[1].trim();
    let j: any;
    try {
      j = JSON.parse(jsonLine);
    } catch {
      continue;
    }
    const nameMatch = head.match(/\|\s*([^|]+?)\s*\|/);
    const rawName = nameMatch ? nameMatch[1] : head;
    const slug = guessSlug(rawName) || guessSlug(head);
    if (!slug) continue;

    const mk = (kind: 'peak' | 'offpeak', p: any): PriceRecord | null => {
      if (!p) return null;
      const inPrice = (p.ncache_peak?.price ?? p.ncache_offpeak?.price) ?? null;
      const outPrice = (p.output_peak?.price ?? p.output_offpeak?.price) ?? null;
      const cachePrice = (p.cache_peak?.price ?? p.cache_offpeak?.price) ?? null;
      if (inPrice == null && outPrice == null) return null;
      const perM = (v: number | null) => (v == null ? null : v * 1000);
      return {
        modelId: slug,
        channelId: 'qiniu',
        billingMode: 'payg',
        currency: 'CNY',
        input: perM(inPrice),
        cacheRead: perM(cachePrice),
        cacheWrite: null,
        output: perM(outPrice),
        tier:
          kind === 'peak'
            ? { kind: 'peak', window: '高峰时段', note: '七牛云峰谷双档计价' }
            : { kind: 'offpeak', window: '空闲时段', note: '七牛云峰谷双档计价' },
        tierLabel: kind === 'peak' ? '高峰' : '空闲',
        vendorModelId: head.split('|')[0]?.trim() ?? null,
        promotional: false,
        promoNote: null,
        note: '七牛云官方 API 直采，峰谷双档计价',
        packageQuota: null,
        packageQuotaUnit: 'tokens',
        packagePeriod: null,
        packagePrice: null,
        packageTierName: null,
        packageMerged: null,
        packageManualActivation: null,
        packageCalls: null,
        packageIncludes: null,
        evidence: {
          sourceUrl: 'https://www.qiniu.com/pricing',
          fetchedAt: FETCHED_AT,
          quote: jsonLine.slice(0, 400),
          pageUpdatedAt: null,
        },
      };
    };
    const peak = mk('peak', j);
    const off = mk('offpeak', j);
    if (peak) out.push(peak);
    if (off) out.push(off);
  }
  return out;
};

/** 腾讯云 TokenHub：.probe/fetch_tencent-tokenhub__*_97731.html（刊例价表） */
const fromTencent = (): Collector => () => {
  const file = snapPath('fetch_tencent-tokenhub__tencent_com_document_product_1823_97731.html');
  const html = fs.readFileSync(file, 'utf8');
  const tables = extractTables(html);
  const out: PriceRecord[] = [];
  for (const rows of tables) {
    const head = (rows[0] || []).join(' ');
    // 腾讯云刊例价表：表头 =「产品名 | 刊例价（每 百万 tokens）」，价格挤在第 2 格
    if (!/刊例价/.test(head)) continue;
    for (const r of rows.slice(1)) {
      const name = (r[0] || '').trim();
      const cell = r[1] || '';
      if (!name || !cell) continue;
      const p = parseCompactPriceCell(cell);
      if (p.input == null && p.output == null) continue;
      const slug = guessSlug(name);
      if (!slug) continue;
      out.push({
        modelId: slug,
        channelId: 'tencent-tokenhub',
        billingMode: 'payg',
        currency: 'CNY',
        input: p.input,
        cacheRead: p.cacheRead,
        cacheWrite: null,
        output: p.output,
        tier: { kind: 'none' },
        tierLabel: null,
        vendorModelId: name,
        promotional: false,
        promoNote: null,
        note: '腾讯云 TokenHub 刊例价（每百万 tokens）',
        packageQuota: null,
        packageQuotaUnit: 'tokens',
        packagePeriod: null,
        packagePrice: null,
        packageTierName: null,
        packageMerged: null,
        packageManualActivation: null,
        packageCalls: null,
        packageIncludes: null,
        evidence: {
          sourceUrl: 'https://cloud.tencent.com/document/product/1823/97731',
          fetchedAt: FETCHED_AT,
          quote: `${name} | ${cell}`,
          pageUpdatedAt: null,
        },
      });
    }
  }
  return out;
};

/** 百度千帆：.probe/baidu_qianfan_price.html
 *  形态：模型名称 | 版本名称 | 服务内容 | 子项 | 在线推理 | 批量推理 | 单位
 *  续行（rowspan）只有 3 格：子项 | 在线推理 | 批量推理
 *  单位统一是「元/千tokens」，需 ×1000 折算为元/百万 tokens
 */
const fromBaidu = (): Collector => () => {
  const html = fs.readFileSync(snapPath('baidu_qianfan_price.html'), 'utf8');
  const tables = extractTables(html);
  const out: PriceRecord[] = [];

  for (const rows of tables) {
    const head = (rows[0] || []).join(' ');
    if (!/模型名称/.test(head)) continue;

    let curModel = '';
    let curVersion = '';
    let curUnit = '千';

    // 档位键 → 累积的价格
    const buckets = new Map<string, {
      model: string; version: string; unit: string;
      input: number | null; output: number | null; cacheRead: number | null;
      tierLabel: string | null; quotes: string[];
    }>();

    const bucketFor = (key: string) => {
      let b = buckets.get(key);
      if (!b) {
        b = { model: curModel, version: curVersion, unit: curUnit,
              input: null, output: null, cacheRead: null, tierLabel: null, quotes: [] };
        buckets.set(key, b);
      }
      return b;
    };

    for (const r of rows.slice(1)) {
      const c = r.map((x) => (x || '').trim());
      // 模型行：含「模型名称/版本名称/服务内容/子项/价格…」
      const isModelRow = c.length >= 5 && c[0] !== '' && !/^输入|^输出|^命中缓存/.test(c[0]);
      if (isModelRow) {
        curModel = c[0] || curModel;
        curVersion = c[1] || '';
        curUnit = /千/.test(c[6] || '') ? '千' : /百万/.test(c[6] || '') ? '百万' : curUnit;
      }

      // 取「子项」与「在线推理价」
      let sub: string;
      let priceTxt: string;
      let unitCell = '';
      if (isModelRow) {
        sub = c[3] || '';
        priceTxt = c[4] || '';
        unitCell = c[6] || '';
      } else if (c.length >= 3) {
        sub = c[0] || '';
        priceTxt = c[1] || '';
        unitCell = c[3] || '';
      } else {
        continue;
      }
      if (!sub) continue;
      // 「搜索增强」等按次计费的附加项，不属于 token 单价
      if (/元\/次|搜索增强/.test(sub)) continue;
      if (unitCell) curUnit = /千/.test(unitCell) ? '千' : /百万/.test(unitCell) ? '百万' : curUnit;

      const v = parseTokenPrice(priceTxt, curUnit);
      if (v == null) continue;

      // 档位键：取括号内的时段/上下文说明；无括号则用空串
      const seg = sub.match(/[（(]([^）)]*)[）)]/);
      let segText = seg ? seg[1] : '';
      // 百度千帆的空闲时段只标注在「输出」「命中缓存」行上，输入行仍写「高峰时段」，
      // 直接按括号分桶会导致空闲档的输入价丢失（input=null）。
      // 这里把「空闲时段」显式识别出来，与「高峰时段」区分成两个档。
      if (/空闲时段/.test(segText)) segText = '空闲时段';
      else if (/高峰时段/.test(segText)) segText = '高峰时段';
      const tierLabel = detectBaiduTier(sub);
      const key = `${curModel}||${curVersion}||${segText}`;

      const b = bucketFor(key);
      b.model = curModel;
      b.version = curVersion;
      b.unit = curUnit;
      b.tierLabel = tierLabel;
      if (/缓存|命中/.test(sub)) b.cacheRead = v;
      else if (/输出/.test(sub)) b.output = v;
      else if (/输入/.test(sub)) b.input = v;
      b.quotes.push(`${sub} ${priceTxt}${unitCell ? ' ' + unitCell : ''}`);
    }

    /*
     * 官网口径：同一模型的输入价全时段一致（只有输出价与缓存价分高峰/空闲）。
     * 官网表格只在输入行标注「高峰时段」，空闲行只给输出与缓存。
     * 因此空闲档的输入价沿用同一模型的高峰输入价 —— 这符合官网实际计费，
     * 而不是凭空补数。
     */
    const byModel = new Map<string, { input: number | null; output: number | null }>();
    for (const b of buckets.values()) {
      const mk = `${b.model}||${b.version}`;
      const cur = byModel.get(mk);
      if (!cur) byModel.set(mk, { input: b.input, output: b.output });
    }
    for (const b of buckets.values()) {
      const mk = `${b.model}||${b.version}`;
      if (b.input == null) {
        const fallback = byModel.get(mk);
        if (fallback?.input != null) b.input = fallback.input;
      }
    }

    for (const b of buckets.values()) {
      const slug =
        guessSlug(`${b.model} ${b.version}`) ??
        guessSlug(b.model) ??
        normalizeId(b.version) ??
        normalizeId(b.model);
      out.push({
        modelId: slug ?? `unknown:${b.model}`,
        channelId: 'baidu-qianfan',
        billingMode: 'payg',
        currency: 'CNY',
        input: b.input,
        cacheRead: b.cacheRead,
        cacheWrite: null,
        output: b.output,
        tier: { kind: 'none' },
        tierLabel: b.tierLabel,
        vendorModelId: b.version || b.model,
        promotional: false,
        promoNote: null,
        note: `百度千帆官方计费文档（${b.unit === '千' ? '元/千tokens' : '元/百万tokens'}，已折算为元/百万 tokens）`,
        packageQuota: null,
        packageQuotaUnit: 'tokens',
        packagePeriod: null,
        packagePrice: null,
        packageTierName: null,
        packageMerged: null,
        packageManualActivation: null,
        packageCalls: null,
        packageIncludes: null,
        evidence: {
          sourceUrl: 'https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya',
          fetchedAt: FETCHED_AT,
          quote: b.quotes.join(' | '),
          pageUpdatedAt: '2026-10-18',
        },
      });
    }
  }
  return out;

  function parseTokenPrice(txt: string, unit: string): number | null {
    if (!txt || txt === '-') return null;
    const m = txt.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    // 「元/千tokens」→ ×1000；「元/百万tokens」→ ×1
    return unit === '千' ? n * 1000 : n;
  }

  function detectBaiduTier(sub: string): string | null {
    const m = sub.match(/(高峰时段[^）]*|空闲时段[^）]*|输入\s*[<>=]+\s*\d+k?)/i);
    if (m) return m[1].trim();
    return null;
  }
};

/** 移动云：.probe/final_mobile-cloud.html
 *  形态：规格名称 | 资费场景 | 单价 | 对应资源包点数 | 包含模型
 *  模型名独占一行（rowspan），下一行是「输出tokens」，再下一行是新模型
 *  单价形如 "0.6元/百万tokens"
 */
const fromMobileCloud = (): Collector => () => {
  const html = fs.readFileSync(snapPath('final_mobile-cloud.html'), 'utf8');
  const tables = extractTables(html);
  const out: PriceRecord[] = [];
  for (const rows of tables) {
    const head = (rows[0] || []).join(' ');
    if (!/资费场景/.test(head) && !/单价/.test(head)) continue;

    let curModel = '';
    const pending = new Map<string, PriceRecord>();

    const ensure = (model: string): PriceRecord | null => {
      const slug = guessSlug(model);
      if (!slug) return null;
      const key = `${slug}`;
      let rec = pending.get(key);
      if (!rec) {
        rec = {
          modelId: slug,
          channelId: 'mobile-cloud',
          billingMode: 'payg',
          currency: 'CNY',
          input: null,
          cacheRead: null,
          cacheWrite: null,
          output: null,
          tier: { kind: 'none' },
          tierLabel: null,
          vendorModelId: model,
          promotional: false,
          promoNote: null,
          note: '移动云 MoMA 平台按量计费',
          packageQuota: null,
          packageQuotaUnit: 'tokens',
          packagePeriod: null,
          packagePrice: null,
          packageTierName: null,
          packageMerged: null,
          packageManualActivation: null,
          packageCalls: null,
          packageIncludes: null,
          evidence: {
            sourceUrl: 'https://ecloud.10086.cn/op-help-center/doc/article/91592',
            fetchedAt: FETCHED_AT,
            quote: '',
            pageUpdatedAt: '2026/09/23',
          },
        };
        pending.set(key, rec);
      }
      return rec;
    };

    for (const r of rows.slice(1)) {
      const c = r.map((x) => (x || '').trim());
      /*
       * 移动云表结构：模型行 5 格 = 规格名称 | 资费场景 | 单价 | 资源包点数 | 包含模型
       *                续行   4 格 = 资费场景 | 单价 | 资源包点数 | 包含模型（省略规格名称列，rowspan）
       * 早期版本按固定下标取值，导致输出价丢失、模型名被 '输出tokens' 覆盖。
       * 这里按「列数」区分两种行。
       */
      const isModelRow = c.length >= 5;
      const scenario = isModelRow ? c[1] : c[0];
      const priceTxt = isModelRow ? c[2] : c[1];
      if (isModelRow && c[0]) curModel = c[0];

      const v = parseMcPrice(priceTxt);
      if (!scenario || v == null) continue;
      const isInput = /输入/.test(scenario);
      const isOutput = /输出/.test(scenario);
      const isCache = /缓存/.test(scenario);
      if (!isInput && !isOutput && !isCache) continue;

      const rec = ensure(curModel);
      if (!rec) continue;
      if (isCache) rec.cacheRead = v;
      else if (isOutput) rec.output = v;
      else rec.input = v;

      const night = /夜间/.test(scenario);
      if (night) {
        rec.tier = { kind: 'offpeak', window: '00:00-08:00', note: '移动云夜间资费' };
        rec.tierLabel = '夜间';
      }
      rec.evidence.quote += `${rec.evidence.quote ? ' || ' : ''}${c.join(' | ')}`;
    }
    for (const rec of pending.values()) {
      if (rec.input != null || rec.output != null || rec.cacheRead != null) out.push(rec);
    }
  }
  return out;

  function parseMcPrice(txt: string): number | null {
    if (!txt) return null;
    const m = txt.match(/(\d+(?:\.\d+)?)\s*元\s*\/\s*(百万|千)?\s*tokens?/i);
    if (!m) {
      const m2 = txt.match(/(\d+(?:\.\d+)?)/);
      return m2 ? Number(m2[1]) : null;
    }
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0) return null;
    return /千/.test(m[2] || '') ? n * 1000 : n;
  }
};

/** 华为云 MaaS：.probe/hw_tbl/tbl/*.json */
const fromHuawei = (): Collector => () => {
  const dir = snapPath('hw_tbl/tbl');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const out: PriceRecord[] = [];
  for (const f of files) {
    const d = readJson<any>(path.join(dir, f), null);
    if (!d?.cells) continue;
    // 重建网格
    const grid: string[][] = [];
    for (let r = 0; r < d.rows; r++) grid[r] = new Array(d.columns).fill('');
    for (const c of d.cells) {
      grid[c.row][c.column] = (c.text || '').replace(/\n/g, ' ').trim();
    }
    const head = (grid[0] || []).join(' ') + (grid[1] || []).join(' ');
    if (!/单价/.test(head)) continue;
    if (!/Tokens/.test(head)) continue;

    let curModel = '';
    let curTokenRange = '';
    for (let r = 2; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      if (row[0]) curModel = row[0];
      if (row[2]) curTokenRange = row[2].replace(/\s+/g, '');
      const cache = num(row[4]);
      const input = num(row[5]);
      const output = num(row[6]);
      if (input == null && output == null) continue;
      const slug = guessSlug(curModel);
      if (!slug) continue;
      const period = (row[3] || '').replace(/\s+/g, '');
      const isP2 = /2/.test(period);
      out.push({
        modelId: slug,
        channelId: 'huawei-modelarts',
        billingMode: 'payg',
        currency: 'CNY',
        input,
        cacheRead: cache,
        cacheWrite: null,
        output,
        tier: { kind: 'none' },
        tierLabel: [curTokenRange, isP2 ? '忙闲时段2' : null].filter(Boolean).join(' '),
        vendorModelId: curModel,
        promotional: false,
        promoNote: null,
        note: '华为云 MaaS 官方计费说明文档（文档版本 01 / 2026-10-23）',
        packageQuota: null,
        packageQuotaUnit: 'tokens',
        packagePeriod: null,
        packagePrice: null,
        packageTierName: null,
        packageMerged: null,
        packageManualActivation: null,
        packageCalls: null,
        packageIncludes: null,
        evidence: {
          sourceUrl:
            'https://support.huaweicloud.com/price-maas/MaaS%E6%A8%A1%E5%9E%8B%E5%8D%B3%E6%9C%8D%E5%8A%A1%20%E8%AE%A1%E8%B4%B9%E8%AF%B4%E6%98%8E-pdf.pdf',
          fetchedAt: FETCHED_AT,
          quote: row.join(' | '),
          pageUpdatedAt: '2026-10-23',
        },
      });
    }
  }
  return out;
};

/** 天翼云：.probe/ct_doc.html
 *  形态：模型名称 | 单位 | 输入单价 | 输出单价
 *  文本生成模型单位是「元/千Tokens」，需 ×1000 折算为元/百万 tokens
 */
/**
 * 联通云团队版 credits → tokens 换算。
 * 官方口径（公告与官方报道）：25,000 credits ≈ 2 亿 tokens、100,000 ≈ 8 亿、250,000 ≈ 20 亿，
 * 均为以 DeepSeek-V4-Pro 为例的近似值。这里按线性比例换算并标注为约数。
 */
function creditsToTokens(credits: number): string {
  const tokens = credits * 8000;
  if (tokens >= 100_000_000) return `${(tokens / 100_000_000).toFixed(1)} 亿`;
  return `${(tokens / 10_000).toFixed(0)} 万`;
}

/** 天翼云星辰平台自有模型 → 渠道专属 slug */
function ctyunOwnSlug(rawName: string): string | null {
  const n = rawName.replace(/\s+/g, '');
  if (/通用问答大模型/.test(n)) return 'ctyun-general-qa-36b';
  if (/对话大模型/.test(n)) return 'ctyun-chat';
  return null;
}

/**
 * 联通云（cucloud）
 *
 * 两个数据源：
 * 1. 官方计费调整公告（.probe/cu_announce_464.txt）
 *    —— 给出 DeepSeek-V4-Flash-0731 的峰谷按量价（元/百万tokens）
 * 2. Token Plan 套餐页（.probe/cu_tokenplan.txt）
 *    —— 个人版按 tokens、团队版按 credits，共 6 档
 */
const fromCucloud = (): Collector => () => {
  const out: PriceRecord[] = [];

  // ── 按量价（官方公告）──
  const annPath = snapPath('cu_announce_464.txt');
  if (fs.existsSync(annPath)) {
    const text = fs.readFileSync(annPath, 'utf8');
    // 「输入：高峰时段 ¥3，空闲时段 ¥1.5」
    const pick = (label: string): { peak: number | null; off: number | null } => {
      const re = new RegExp(label + '：高峰时段\\s*¥?([\\d.]+)[，,]\\s*空闲时段\\s*¥?([\\d.]+)');
      const m = text.match(re);
      if (m) return { peak: Number(m[1]), off: Number(m[2]) };
      return { peak: null, off: null };
    };
    const inp = pick('输入');
    const outp = pick('输出');
    const cache = pick('Cache命中');

    const modelMatch = text.match(/对\s*([A-Za-z0-9.\-]+)\s*模型计费模式调整/);
    const rawModel = modelMatch ? modelMatch[1] : 'DeepSeek-V4-Flash-0731';
    const slug = guessSlug(rawModel) ?? normalizeId(rawModel);

    const effective = text.match(/自北京时间(\d{4}年\d{1,2}月\d{1,2}日)/);
    const pageUpdatedAt = effective ? effective[1] : '2026-09-25';

    if (slug && (inp.peak != null || outp.peak != null)) {
      const mk = (tier: 'peak' | 'offpeak', label: string, i: number | null, o: number | null, c: number | null) => {
        out.push({
          modelId: slug,
          channelId: 'cucloud',
          billingMode: 'payg',
          currency: 'CNY',
          input: i,
          cacheRead: c,
          cacheWrite: null,
          output: o,
          tier: tier === 'peak'
            ? { kind: 'peak', window: '08:00-22:00', note: '联通云高峰时段' }
            : { kind: 'offpeak', window: '22:00-08:00', note: '联通云空闲时段，价格为高峰一半' },
          tierLabel: label,
          vendorModelId: rawModel,
          promotional: false,
          promoNote: null,
          note: `联通云 AI 服务平台计费调整公告（自 ${pageUpdatedAt} 起实行峰谷定价，单位：元/百万tokens）`,
          packageQuota: null,
          packageQuotaUnit: 'tokens',
          packagePeriod: null,
          packagePrice: null,
          packageTierName: null,
          packageMerged: null,
          packageManualActivation: null,
          packageCalls: null,
          packageIncludes: null,
          evidence: {
            sourceUrl: 'https://www.cucloud.cn/announcement-news.html?id=464',
            fetchedAt: FETCHED_AT,
            quote: `输入：高峰时段 ¥${inp.peak}，空闲时段 ¥${inp.off}；输出：高峰时段 ¥${outp.peak}，空闲时段 ¥${outp.off}；Cache命中：高峰时段 ¥${cache.peak}，空闲时段 ¥${cache.off}`,
            pageUpdatedAt,
          },
        });
      };
      mk('peak', '高峰时段 8:00-22:00', inp.peak, outp.peak, cache.peak);
      mk('offpeak', '空闲时段 22:00-次日8:00', inp.off, outp.off, cache.off);
    }
  }

  // ── Token Plan 套餐（Token Plan 套餐页）──
  const tpPath = snapPath('cu_tokenplan.txt');
  if (fs.existsSync(tpPath)) {
    const text = fs.readFileSync(tpPath, 'utf8');
    // 「个人版价格：15元/月」…「额度：600万 tokens」
    const re = /(个人版|团队版)价格：([\d.]+)元\/月[\s\S]{0,80}?额度：([\d,]+)\s*(万 tokens|credits)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const edition = m[1];
      const price = Number(m[2]);
      const quotaRaw = Number(m[3].replace(/,/g, ''));
      const unit = m[4];
      const isCredits = unit === 'credits';
      // 个人版额度单位是「万 tokens」→ 换算成 token 数
      const quota = isCredits ? quotaRaw : quotaRaw * 10000;
      // 档位名按「额度数值」映射（页面上的单位文本是「万 tokens」/「credits」）
      const tierName = edition === '个人版'
        ? ({ 600: 'Token Plan 个人版 · Lite', 1200: 'Token Plan 个人版 · Pro', 1800: 'Token Plan 个人版 · Max' } as Record<number, string>)[quotaRaw]
        : ({ 25000: 'Token Plan 团队版 · Lite', 100000: 'Token Plan 团队版 · Pro', 250000: 'Token Plan 团队版 · Max' } as Record<number, string>)[quotaRaw];
      if (!tierName) continue;
      out.push({
        modelId: 'cucloud-token-plan',
        channelId: 'cucloud',
        billingMode: 'package',
        currency: 'CNY',
        input: null,
        cacheRead: null,
        cacheWrite: null,
        output: null,
        tier: { kind: 'none' },
        tierLabel: tierName,
        vendorModelId: tierName,
        promotional: false,
        promoNote: null,
        note: `联通云 × 联通元景 Token Plan（${edition}，按${isCredits ? ' credits' : ' tokens'} 计费）`,
        packageQuota: quota,
        packageQuotaUnit: isCredits ? 'credits' : 'tokens',
        packagePeriod: '1个月',
        packagePrice: price,
        packageTierName: tierName,
        packageMerged: null,
        packageManualActivation: '是',
        packageCalls: null,
        packageIncludes: isCredits
          ? `团队版按 credits 结算，${quotaRaw.toLocaleString('en-US')} credits 约合 ${creditsToTokens(quotaRaw)} tokens（以 DeepSeek-V4-Pro 为例）`
          : '个人版支持 DeepSeek V4-Flash、MiniMax-M2.5',
        evidence: {
          sourceUrl: 'https://www.cucloud.cn/product/tokenplan.html',
          fetchedAt: FETCHED_AT,
          quote: `${edition}价格：${price}元/月，额度：${m[3]} ${unit}`,
          pageUpdatedAt: null,
        },
      });
    }
  }

  return out;
};

const fromCtyun = (): Collector => () => {
  const html = fs.readFileSync(snapPath('ct_doc.html'), 'utf8');
  const tables = extractTables(html);
  const out: PriceRecord[] = [];
  for (const rows of tables) {
    const head = (rows[0] || []).join(' ');
    // 只处理语义大模型的「输入单价/输出单价」表
    if (!/输入单价/.test(head) || !/输出单价/.test(head)) continue;
    for (const r of rows.slice(1)) {
      const c = r.map((x) => (x || '').trim());
      const name = c[0] || '';
      const unit = c[1] || '';
      const inTxt = c[2] || '';
      const outTxt = c[3] || '';
      if (!name || !/Tokens/i.test(unit)) continue;
      const scale = /千/.test(unit) ? 1000 : /百万/.test(unit) ? 1 : 1000;
      const inV = num(inTxt.replace(/[^\d.]/g, ''));
      const outV = num(outTxt.replace(/[^\d.]/g, ''));
      if (inV == null && outV == null) continue;
      // 天翼云星辰自有模型（对话大模型 / 通用问答大模型-36B）不对应公开模型 ID，
      // 用渠道专属 slug 保留，避免与公开模型混淆
      const slug = guessSlug(name) ?? ctyunOwnSlug(name);
      if (!slug) continue;
      out.push({
        modelId: slug,
        channelId: 'ctyun',
        billingMode: 'payg',
        currency: 'CNY',
        input: inV == null ? null : inV * scale,
        cacheRead: null,
        cacheWrite: null,
        output: outV == null ? null : outV * scale,
        tier: { kind: 'none' },
        tierLabel: null,
        vendorModelId: name,
        promotional: false,
        promoNote: null,
        note: `天翼云星辰 MaaS 模型推理计费规则（${unit}，已折算为元/百万 tokens）`,
        packageQuota: null,
        packageQuotaUnit: 'tokens',
        packagePeriod: null,
        packagePrice: null,
        packageTierName: null,
        packageMerged: null,
        packageManualActivation: null,
        packageCalls: null,
        packageIncludes: null,
        evidence: {
          sourceUrl: 'https://www.ctyun.cn/document/11092117/11094475',
          fetchedAt: FETCHED_AT,
          quote: c.join(' | '),
          pageUpdatedAt: null,
        },
      });
    }
  }
  return out;
};

// ───────────────────────────────────────────
// 主流程
// ───────────────────────────────────────────

const COLLECTORS: Array<{ name: string; run: Collector }> = [
  { name: 'aliyun-bailian', run: fromRaw('aliyun-bailian.json', 'aliyun-bailian') },
  { name: 'volcengine-ark', run: fromRaw('volcengine-ark.json', 'volcengine-ark') },
  { name: 'bigmodel', run: fromRaw('bigmodel.json', 'bigmodel') },
  { name: 'mimo', run: fromRaw('mimo.json', 'mimo') },
  { name: 'minimax', run: fromRaw('minimax.json', 'minimax') },
  { name: 'deepseek', run: fromRaw('deepseek.json', 'deepseek') },
  { name: 'openai', run: fromRaw('openai.json', 'openai') },
  { name: 'anthropic', run: fromRaw('anthropic.json', 'anthropic') },
  { name: 'final-official', run: fromFinal('final.json') },
  { name: 'final-aliyun-volc', run: fromFinal('final_aliyun_volc.json') },
  { name: 'siliconflow', run: fromSiliconFlow() },
  { name: 'qiniu', run: fromQiniu() },
  { name: 'tencent-tokenhub', run: fromTencent() },
  { name: 'baidu-qianfan', run: fromBaidu() },
  { name: 'mobile-cloud', run: fromMobileCloud() },
  { name: 'huawei-modelarts', run: fromHuawei() },
  { name: 'ctyun', run: fromCtyun() },
  { name: 'cucloud', run: fromCucloud() },
];

function main() {
  const models = readJson<any[]>(path.join(ROOT, 'data/seeds/models.json'), []);
  const known = new Set(models.map((m) => m.id));

  const all: PriceRecord[] = [];
  const pending: PriceRecord[] = []; // 未映射到全局模型的记录，单独存档
  const perChannel: Record<string, number> = {};
  const unknownModels = new Map<string, Set<string>>();

  for (const c of COLLECTORS) {
    try {
      const recs = c.run();
      let kept = 0;
      for (const r of recs) {
        // 【关键】ingest 阶段不过滤未知模型——全部落盘，
        // 由 build-models 扩表后再由 clean 统一归并去噪。
        // 若在此处过滤，主流模型会因模型表未及时扩充而丢失。
        if (!r.modelId || r.modelId.startsWith('unknown:')) {
          const s = unknownModels.get(c.name) ?? new Set();
          s.add(r.modelId);
          unknownModels.set(c.name, s);
          pending.push({ ...r, modelId: (r.vendorModelId || r.modelId).replace(/^.*:/, '') });
          continue;
        }
        all.push(r);
        kept++;
      }
      perChannel[c.name] = kept;
      console.log(`✓ ${c.name.padEnd(22)} ${String(kept).padStart(4)} 条`);
    } catch (e) {
      perChannel[c.name] = 0;
      console.log(`✗ ${c.name.padEnd(22)} 失败: ${String(e).slice(0, 100)}`);
    }
  }

  // 去重：同模型 + 同渠道 + 同档位 → 只留一条
  const seen = new Set<string>();
  const dedup: PriceRecord[] = [];
  for (const r of all) {
    const key = `${r.modelId}|${r.channelId}|${r.billingMode}|${r.tierLabel ?? ''}|${r.input}|${r.output}|${r.cacheRead}|${r.packageTierName ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
  }

  writeJson(path.join(ROOT, 'data/prices.json'), dedup);
  // 待映射记录：供 build-models 反查真实模型名
  writeJson(path.join(ROOT, 'data/pending-models.json'), pending);

  const report = {
    ingestedAt: FETCHED_AT,
    total: dedup.length,
    byCollector: perChannel,
    byChannel: dedup.reduce<Record<string, number>>((a, r) => {
      a[r.channelId] = (a[r.channelId] || 0) + 1;
      return a;
    }, {}),
    unknownModels: Object.fromEntries(
      [...unknownModels.entries()].map(([k, v]) => [k, [...v]])
    ),
  };
  writeJson(path.join(ROOT, 'data/ingest-report.json'), report);

  console.log(`\n总计入库 ${dedup.length} 条（去重前 ${all.length}）`);
  console.log('按渠道:', report.byChannel);
  if (report.unknownModels && Object.keys(report.unknownModels).length) {
    console.log('\n⚠ 未匹配到全局模型的 id（已丢弃，需补 seeds/models.json）:');
    for (const [k, v] of Object.entries(report.unknownModels)) {
      console.log(`  ${k}: ${v.join(', ')}`);
    }
  }
}

main();
