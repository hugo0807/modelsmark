/**
 * 扩充模型种子表 —— 从已入库的真实价格记录反推模型清单。
 *
 * 铁律：模型元数据（厂商、归属地、上下文窗口）必须来自官方来源，
 * 不得凭猜测填值。上下文窗口等无法从定价页确证的字段一律留 null。
 *
 * 用法：npx tsx scripts/build-models.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Model, PriceRecord } from '../src/lib/types';

const ROOT = process.cwd();

/** 厂商归属表：模型 id 前缀 → 厂商 */
const VENDOR_RULES: Array<[RegExp, string, 'domestic' | 'overseas']> = [
  [/^kimi|^moonshot/, '月之暗面', 'domestic'],
  [/^glm|^bigmodel/, '智谱 AI', 'domestic'],
  [/^deepseek/, '深度求索', 'domestic'],
  [/^mimo/, '小米', 'domestic'],
  [/^minimax/, 'MiniMax', 'domestic'],
  [/^qwen/, '阿里巴巴', 'domestic'],
  [/^cucloud/, '中国联通', 'domestic'],
  [/^ctyun/, '中国电信', 'domestic'],
  [/^doubao/, '字节跳动', 'domestic'],
  [/^hunyuan|^hy-|^yt-|^kling|^vidu/, '腾讯', 'domestic'],
  [/^openpangu/, '华为', 'domestic'],
  [/^ernie|^qianfan|^paddleocr|^pp-structure/, '百度', 'domestic'],
  [/^internvl/, '上海人工智能实验室', 'domestic'],
  [/^step/, '阶跃星辰', 'domestic'],
  [/^gpt|^o[134]-/, 'OpenAI', 'overseas'],
  [/^claude/, 'Anthropic', 'overseas'],
  [/^gemini/, 'Google', 'overseas'],
  [/^grok/, 'xAI', 'overseas'],
];

/** 展示名映射：需要人工确认的正式名称 */
/**
 * 从采集记录里取该模型在官网上的原始写法。
 * 同一模型在不同渠道写法可能不同（如 "DeepSeek-V4.1-Flash" / "deepseek-v4.1-flash"），
 * 取出现次数最多且带大写可读字符的那个作为展示名。
 */
function buildRawNames(prices: any[], pending: any[] = []): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of [...prices, ...pending]) {
    if (!p.modelId || p.modelId.startsWith('unknown:')) continue;
    // 套餐记录（billingMode=package）的 vendorModelId 是档位名（如「Token Plan 个人版 · Pro」），
    // 不是模型名 —— 用它当展示名会让整张表的「适用模型」列变成同一个档位名。
    if (p.billingMode === 'package') continue;
    const raw = (p.vendorModelId || '').trim();
    if (!raw || raw.length > 60) continue;
    // 排除纯 slug 式的写法（不含大写字母，说明它只是 id 的复述）
    if (!/[A-Z]/.test(raw)) continue;
    const m = counts.get(p.modelId) ?? new Map<string, number>();
    m.set(raw, (m.get(raw) ?? 0) + 1);
    counts.set(p.modelId, m);
  }
  const out = new Map<string, string>();
  for (const [id, m] of counts) {
    let best = '';
    let bestN = 0;
    for (const [raw, n] of m) {
      // 同频时取更短的（更简洁的展示名）
      if (n > bestN || (n === bestN && raw.length < best.length)) {
        best = raw;
        bestN = n;
      }
    }
    if (best) out.set(id, best);
  }
  return out;
}

/**
 * 展示名清洗：把采集侧的「同名重复拼接」收敛成一个名字。
 *
 * 百度千帆的定价表里「模型系列」与「模型版本」是相邻的两列，
 * 而这两列常常是同一个名字的两种写法（"ERNIE-4.5-Turbo-VL" 与
 * "ERNIE-4.5-Turbo-VL-32K"）。采集时若把它们当 model + version 拼起来，
 * 展示名会变成 "ERNIE-4.5-Turbo-VL ERNIE-4.5-Turbo-VL-32K" ——
 * 表格里一眼看去像是同一个模型录了两遍，且和真身重名。
 *
 * 规则：两个空格分隔的片段若互为前缀，取更具体的（更长的）那个。
 */
function sanitizeDisplayName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts;
    const na = a.replace(/[\s\-–—]+$/, '').toLowerCase();
    const nb = b.replace(/[\s\-–—]+$/, '').toLowerCase();
    if (na && nb && nb.startsWith(na)) return b;
    if (na && nb && na.startsWith(nb)) return a;
  }
  return (name || '').trim();
}

/**
 * slug → 可读展示名的兜底规则。
 * 把 "hunyuan-embedding" 变成 "Hunyuan Embedding"、"ernie-4-5-turbo-32k" 变成
 * "ERNIE 4.5 Turbo 32K"。用于采集原始名不可用（缺失或全小写）的情况。
 */
function humanizeSlug(id: string): string {
  const SPECIAL: Record<string, string> = {
    glm: 'GLM', gpt: 'GPT', qwen: 'Qwen', ernie: 'ERNIE', hy: 'HY',
    hunyuan: 'Hunyuan', doubao: 'Doubao', kimi: 'Kimi', deepseek: 'DeepSeek',
    minimax: 'minimax', mimo: 'MiMo', step: 'Step', kling: 'Kling',
    vidu: 'Vidu', yt: 'YT', claude: 'Claude', gemini: 'Gemini', grok: 'Grok',
    pangu: 'Pangu', bge: 'BGE', cosyvoice: 'CosyVoice', sensevoice: 'SenseVoice',
    longcat: 'LongCat', openpangu: 'openPangu', qwq: 'QwQ',
  };
  return id
    .split('-')
    .map((w) => {
      if (SPECIAL[w]) return SPECIAL[w];
      if (/^\d+(\.\d+)?$/.test(w)) return w;          // 数字段原样
      if (w.length <= 3) return w.toUpperCase();          // 短词大写
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ')
    .replace(/(\d)\.(\d)/g, '$1.$2');
}

/**
 * 套餐载体模型：有些渠道把套餐挂在专门的模型 id 下
 * （如联通云 Token Plan 挂在 cucloud-token-plan）。这类模型没有按量报价，
 * 展示名必须固定，不能用采集时的 vendorModelId（那是档位名）。
 */
const PACKAGE_CARRIERS = ['cucloud-token-plan'];

/** 读 JSON，失败返回兜底值 */
function readJsonSafe<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function modelMapHas(models: { id: string }[], id: string): boolean {
  return models.some((m) => m.id === id);
}

const DISPLAY_NAMES: Record<string, string> = {
  'cucloud-token-plan': '联通元景 Token Plan',
  'kimi-k3-1-pro': 'Kimi K3.1 Pro',
  'kimi-k3-1-pro-highspeed': 'Kimi K3.1 Pro（高速版）',
  'kimi-k3': 'Kimi K3',
  'kimi-k2-6': 'Kimi K2.6',
  'kimi-k2': 'Kimi K2',
  'glm-5-3': 'GLM-5.3',
  'glm-5-3-flash': 'GLM-5.3-Flash',
  'glm-5-3-flashx': 'GLM-5.3-FlashX',
  'glm-5-2': 'GLM-5.2',
  'glm-5-2-fast': 'GLM-5.2-Fast',
  'glm-5-1': 'GLM-5.1',
  'glm-5': 'GLM-5',
  'glm-4-5-turbo': 'GLM-4.5-Turbo',
  'deepseek-v4-1-flash': 'DeepSeek V4.1 Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v3': 'DeepSeek V3',
  'deepseek-r1': 'DeepSeek R1',
  'mimo-v2-6-pro': 'MiMo-V2.6-Pro',
  'mimo-v2-6-flash': 'MiMo-V2.6-Flash',
  'mimo-v2-5': 'MiMo-V2.5',
  'mimo-v2-5-pro': 'MiMo-V2.5-Pro',
  'minimax-m3': 'minimax M3',
  'minimax-m2': 'minimax M2',
  'minimax-m2-7': 'minimax M2.7',
  'minimax-m2-5': 'minimax M2.5',
  'qwen3-8-max': 'Qwen3.8-Max',
  'qwen3-8-max-0902': 'Qwen3.8-Max-0902',
  'qwen3-7-max': 'Qwen3.7-Max',
  'qwen3-7-plus': 'Qwen3.7-Plus',
  'qwen3-7-flash': 'Qwen3.7-Flash',
  'qwen3-8-flash': 'Qwen3.8-Flash',
  'qwen3-8-27b': 'Qwen3.8-27B',
  'qwen3-235b-a22b': 'Qwen3-235B-A22B',
  'qwen3-32b': 'Qwen3-32B',
  'qwen3-30b-a3b': 'Qwen3-30B-A3B',
  'qwen3-5-27b': 'Qwen3.5-27B',
  'qwen3-5-9b': 'Qwen3.5-9B',
  'qwen3-5-4b': 'Qwen3.5-4B',
  'doubao-seed-2-1-pro': 'Doubao-Seed-2.1-Pro',
  'doubao-seed-2-1-turbo': 'Doubao-Seed-2.1-Turbo',
  'doubao-seed-2-1-lite': 'Doubao-Seed-2.1-Lite',
  'doubao-seed-evolving': 'Doubao-Seed-Evolving',
  'hunyuan-hy3': '混元 Hy3',
  'hunyuan-hy4': '混元 Hy4 Preview',
  'hunyuan-hy4-preview': '混元 Hy4 Preview',
  'ernie-5-1': 'ERNIE 5.1',
  'ernie-5-0': 'ERNIE 5.0',
  // 千帆把 4.5 Turbo 拆成多个规格行（32K / 128K-Preview / 20260402 / VL-32K），
  // 前三个同价、VL 版价格完全不同，因此展示名必须带上规格后缀，
  // 否则表格里会出现「同名不同价」，看起来像同一模型被录了两遍。
  'ernie-4-5-turbo': 'ERNIE-4.5-Turbo-20260402',
  'ernie-4-5-turbo-32k': 'ERNIE-4.5-Turbo-32K',
  'ernie-4-5-turbo-128k-preview': 'ERNIE-4.5-Turbo-128K-Preview',
  'ernie-4-5-turbo-vl-32k': 'ERNIE-4.5-Turbo-VL-32K',
  'ernie-x1-1-preview': 'ERNIE X1.1 Preview',
  'gpt-6-1-sol': 'GPT-6.1 Sol',
  'gpt-6-1': 'GPT-6.1',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-6-sol': 'GPT-6 Sol',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-fable-5-1': 'Claude Fable 5.1',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-3-1-pro': 'Gemini 3.1 Pro',
  'gemini-3-8-flash': 'Gemini 3.8 Flash',
  'grok-4-7': 'Grok 4.7',
  'step-5-preview': 'Step 5 Preview',
};

/** 官方定价页：按渠道给模型定位来源 */
function pricingUrlFor(id: string, records: PriceRecord[]): string | null {
  const official = records.find((r) => r.channelId && /official/.test(''));
  const withUrl = records.find((r) => r.evidence?.sourceUrl);
  return withUrl?.evidence.sourceUrl ?? official?.evidence?.sourceUrl ?? null;
}

/** 规范化模型 id：小写、点转连字符、去掉厂商前缀与中文后缀 */
function normalizeId(raw: string): string | null {
  let s = raw.trim();
  // 去掉厂商前缀："deepseek-ai/DeepSeek-V4-Pro" → "DeepSeek-V4-Pro"
  s = s.replace(/^[^/]+\//, '');
  // 去掉版本后缀里的中文说明："GLM-5（即将下线）" → "GLM-5"
  s = s.replace(/[（(][^）)]*[）)]/g, '');
  s = s
    .toLowerCase()
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // 明显不是模型名的行
  if (!s || /^(输入|输出|推理服务|模型名称|服务内容|子项|单价|缓存)$/.test(s)) return null;
  if (s.length < 3) return null;
  return s;
}

function main() {
  const prices = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/prices.json'), 'utf8')
  ) as PriceRecord[];
  const pending = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/pending-models.json'), 'utf8')
  ) as PriceRecord[];
  const rawNames = buildRawNames(prices, pending);
  const existing = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/seeds/models.json'), 'utf8')
  ) as Model[];

  // 收集所有出现过的 modelId（含待映射记录里的真实模型名）
  const byModel = new Map<string, PriceRecord[]>();
  for (const p of [...prices, ...pending]) {
    if (!p.modelId || p.modelId.startsWith('unknown:')) continue;
    const id = normalizeId(p.modelId);
    if (!id) continue;
    const arr = byModel.get(id) ?? [];
    arr.push(p);
    byModel.set(id, arr);
  }

  /*
   * 补充「有智能指数但暂无价格记录」的模型。
   * 这些模型（如 Gemini 4 Argon、Grok 4.7）只被个别渠道收录，
   * 但它们是能力榜与矩阵的关键坐标，不应因价格渠道少而消失。
   */
  for (const id of PACKAGE_CARRIERS) {
    if (!byModel.has(id)) byModel.set(id, []);
  }

  /*
   * 关键：套餐载体模型即使没有按量价格，也必须写进模型表。
   * 否则 clean 阶段会以「孤儿价格记录」为由把套餐全部删掉
   * （finalPrices 只保留模型表里存在的 modelId）。
   */

  const intelligence = readJsonSafe<any[]>(path.join(ROOT, 'data/seeds/intelligence.json'), []);
  for (const it of intelligence) {
    if (!it?.modelId) continue;
    if (byModel.has(it.modelId)) continue;
    if (modelMapHas(existing, it.modelId)) continue;
    byModel.set(it.modelId, []);
  }

  const existingMap = new Map(existing.map((m) => [m.id, m]));
  const added: Model[] = [];
  const kept: Model[] = [];

  for (const [id, recs] of byModel) {
    if (existingMap.has(id)) {
      const prev = existingMap.get(id)!;
      // 展示名同步刷新：原来写成了 slug 的，现在用官网原始名或可读化结果纠正
      const betterName = PACKAGE_CARRIERS.includes(id)
        ? DISPLAY_NAMES[id] ?? prev.name
        : prev.name === prev.id
          ? rawNames.get(id) ?? DISPLAY_NAMES[id] ?? humanizeSlug(id)
          : prev.name;
      kept.push({ ...prev, name: sanitizeDisplayName(betterName) });
      continue;
    }
    // 推导厂商
    let vendor = '未知厂商';
    let origin: 'domestic' | 'overseas' = 'domestic';
    for (const [re, v, o] of VENDOR_RULES) {
      if (re.test(id)) {
        vendor = v;
        origin = o;
        break;
      }
    }
    const model: Model = {
      id,
      // 展示名优先级：官网原始模型名 > 人工映射表 > slug
      // 官网原始名（如 "Qwen3.5-27B"、"DeepSeek-V4.1-Flash"）是各渠道真实写法，最可靠
      name: sanitizeDisplayName(rawNames.get(id) ?? DISPLAY_NAMES[id] ?? humanizeSlug(id)),
      vendor,
      origin,
      openWeights: false,
      // 上下文窗口等无法从定价页确证，留 null（宁可空着也不填猜测值）
      contextWindow: null,
      maxOutput: null,
      releasedAt: null,
      params: null,
      activeParams: null,
      pricingUrl: pricingUrlFor(id, recs),
      docsUrl: null,
    };
    added.push(model);
  }

  // 保留原表中未出现在价格数据里的模型（它们可能只有跑分没有价格）
  const usedIds = new Set(byModel.keys());
  for (const m of existing) {
    if (!usedIds.has(m.id)) kept.push(m);
  }

  const all = [...kept, ...added].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(
    path.join(ROOT, 'data/seeds/models.json'),
    JSON.stringify(all, null, 2),
    'utf8'
  );

  console.log(`模型种子表：${existing.length} → ${all.length}（新增 ${added.length}）`);
  console.log('\n新增模型:');
  for (const m of added) console.log(`  ${m.id.padEnd(28)} ${m.name.padEnd(24)} ${m.vendor}`);
}

main();
