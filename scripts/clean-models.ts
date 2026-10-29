/**
 * 模型归并 —— 清理采集过程中的冗余模型名。
 *
 * 问题：同一模型在不同渠道叫法不同（deepseek-ai/DeepSeek-R1 vs DeepSeek-R1），
 * 会产生多个 id，导致首页矩阵出现重复点、模型详情页出现「只有一个渠道」的孤岛。
 *
 * 做法：
 * 1. 建立别名表，把采集侧的变体名映射到规范 id
 * 2. 归并后的记录改写 modelId
 * 3. 删掉归并后不再有价格的模型
 *
 * 用法：npx tsx scripts/clean-models.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PriceRecord } from '../src/lib/types';

const ROOT = process.cwd();

/**
 * 别名归一 —— 把渠道侧的各种写法收敛到规范 id。
 *
 * 规则分两层：
 * 1. 去厂商前缀："qwen/Qwen3-8-Max" → "Qwen3-8-Max"，"deepseek-ai/DeepSeek-R1" → "DeepSeek-R1"
 * 2. 拼写纠错："deep-seek-v4-1-flash" → "deepseek-v4-1-flash"（渠道侧把 deepseek 拆开了）
 */
function normalizeAlias(raw: string): string {
  let s = raw.trim();
  // 去厂商前缀（斜杠前一段是厂商名时）
  s = s.replace(/^[^/]+\//, '');
  s = s.toLowerCase();
  // 拼写归一
  s = s.replace(/deep-seek/g, 'deepseek');
  s = s.replace(/qwen-qwen/g, 'qwen');
  s = s.replace(/zai-org-/g, '');
  s = s.replace(/open-pangu/g, 'openpangu');
  s = s.replace(/^openpangu/g, 'openpangu');
  s = s
    .replace(/\./g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s;
}

/** 显式别名表（归一化之后的 id → 规范 id） */
const ALIASES: Record<string, string> = {
  'deepseek-v4-1-flash-1017': 'deepseek-v4-1-flash',
  'deepseek-v4-flash-0731': 'deepseek-v4-flash',
  'deepseek-v4-flash-20260731': 'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-v4-flash',
  'deepseek-v3-1-terminus': 'deepseek-v3',
  'deepseek-v3-2': 'deepseek-v3',
  'deepseek-ai-deepseek-r1': 'deepseek-r1',
  'deepseek-ai-deepseek-v3': 'deepseek-v3',
  'zai-org-glm-5-1': 'glm-5-1',
  'glm-5-2-arkts-spark': 'glm-5-2',
  'moonshotai-kimi-k2-6': 'kimi-k2-6',
  'moonshotai-kimi-k2-7-code': 'kimi-k2-7-code',
  'moonshotai-kimi-k3': 'kimi-k3',
  'moonshotai-kimi-k3-1-pro': 'kimi-k3-1-pro',
  'tencent-hy4-preview': 'hunyuan-hy4-preview',
  'hy4-preview': 'hunyuan-hy4-preview',
  'qwen3-30-b-a3b': 'qwen3-30b-a3b',
  'qwen3-30b-a3b-instruct-2507': 'qwen3-30b-a3b',
  'qwen3-32-b': 'qwen3-32b',
  'deepseek-r1-0528-qwen3-8b': 'deepseek-r1-0528-qwen3-8b',
  'hunyuan-a13b-instruct': 'hunyuan-a13b',
  'mimo-v2-5-pro': 'mimo-v2-5',
  'qwen2-5-72b-instruct-128k': 'qwen2-5-72b-instruct',
  /*
   * ERNIE 4.5 Turbo 有三个独立规格，价格完全不同（VL 版 3/9，
   * 32K 版 0.8/3.2，128K 版另有定价），不能并成一个模型 ——
   * 并了以后表里会出现「同款差 3.2 倍」这种假的渠道价差。
   */
  'ernie-4-5-turbo-32k': 'ernie-4-5-turbo-32k',
  'ernie-4-5-turbo-128k-preview': 'ernie-4-5-turbo-128k-preview',
  'ernie-4-5-turbo-vl-32k': 'ernie-4-5-turbo-vl-32k',
  'ernie-4-5-turbo-vl': 'ernie-4-5-turbo-vl-32k',
};

/**
 * 主流模型白名单 —— 这些模型即使只有 1 个渠道也要保留。
 * 它们是行业代表性模型，用户会直接搜名字，缺失比"多一个孤岛"更糟。
 */
const MAJOR_MODELS = new Set([
  'kimi-k3-1-pro', 'kimi-k3-1-pro-highspeed', 'kimi-k3', 'kimi-k2-6', 'kimi-k2',
  'glm-5-3', 'glm-5-3-flash', 'glm-5-3-flashx', 'glm-5-2', 'glm-5-2-fast', 'glm-5-1', 'glm-5',
  'glm-4-5-air', 'glm-4-5v', 'glm-4-32b-0414', 'glm-4-9b-0414', 'glm-z1-9b-0414',
  'deepseek-v4-1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v3', 'deepseek-r1',
  'mimo-v2-6-pro', 'mimo-v2-6-flash', 'mimo-v2-5',
  'minimax-m3', 'minimax-m2-7', 'minimax-m2-5', 'minimax-m2',
  'qwen3-8-max', 'qwen3-8-max-0902', 'qwen3-8-flash', 'qwen3-8-27b', 'qwen3-8b',
  'qwen3-7-max', 'qwen3-7-plus', 'qwen3-7-flash',
  'qwen3-30b-a3b', 'qwen3-32b', 'qwen3-235b-a22b',
  'doubao-seed-2-1-pro', 'doubao-seed-2-1-lite', 'doubao-seed-2-1-turbo', 'doubao-seed-evolving',
  'hunyuan-hy3', 'hunyuan-hy4-preview', 'hunyuan-a13b',
  'ernie-5-1', 'ernie-5-0', 'ernie-4-5-turbo', 'ernie-4-5-turbo-32k',
  'ernie-4-5-turbo-128k-preview', 'ernie-4-5-turbo-vl-32k', 'ernie-x1-1-preview',
  'gpt-6-1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-6-1',
  'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1',
  'gemini-3-1-pro', 'gemini-3-8-flash', 'gemini-4-argon',
  'grok-4-7',
  'step-5-preview', 'step-3-5-flash',
  'qwq-32b', 'seed-oss-36b-instruct',
]);

/** 保留但不属于「主流模型」的：这些是特定能力模型，单独成页有意义 */
const KEEP_SINGLETON = new Set([
  'glm-5-3-flashx',
  'kimi-k2-7-code',
  'deepseek-r1-0528-qwen3-8b',
  'internvl3-38b',
  'paddleocr-vl-0-9b',
  'pp-structurev3',
  'deepseek-ocr',
  'qianfan-ocr',
  'hunyuan-a13b',
  'hunyuan-role-latest',
  'hunyuan-translation',
  'hunyuan-translation-lite',
  'hy-vision-2-0-instruct',
  'hunyuan-turbos-vision',
  'hunyuan-turbos-vision-video',
  'hunyuan-t1-vision',
  'hunyuan-embedding',
  'openpangu-2-0-pro',
  'openpangu-2-0-flash',
  'qwen3-235b-a22b',
  'qwen3-32b',
  'qwen3-30b-a3b',
  'qwen3-5-27b',
  // 运营商套餐载体模型：套餐记录挂在它下面，本身没有按量报价
  'cucloud-token-plan',
  'qwen3-5-9b',
  'qwen3-5-4b',
  'qwen3-5-397b-a17b',
  'qwen3-5-122b-a10b',
  'qwen3-5-35b-a3b',
  'ernie-x1-1-preview',
  'ernie-4-5-turbo-vl-32k',
  'ernie-4-5-turbo-128k-preview',
  'doubao-seed-2-1-lite',
  'doubao-seed-2-1-turbo',
  'doubao-seed-evolving',
  'step-5-preview',
  'longcat-2-0',
  'hunyuan-video-h3',
  'hunyuan-image-3',
  'kling-video-v3',
  'vidu-image-q2',
  'yt-vita',
  'hy-3d',
  'glm-5-2-fast',
  'minimax-m2-7',
  'glm-5',
  'glm-5-1',
  'glm-5-2',
  'kimi-k2',
  'kimi-k2-6',
  'deepseek-v3',
  'deepseek-r1',
  'deepseek-v4-flash',
  'mimo-v2-5',
  'ernie-5-0',
]);

/**
 * 不属于「大模型 API 比价」范畴的模型 —— 一律不收录。
 *
 * OCR / 版面解析 / 向量 / 翻译 / 视频生成这类模型按「页 / 张 / 秒 / 字符」计费，
 * 与按 token 计费的对话模型不可比；硬塞进表里，它们既没有官方混合价、
 * 也没有智能指数，整行只剩横杠，把真正可比的模型淹没了。
 *
 * 注意：cucloud-token-plan 是套餐记录的载体 id（不是真模型），
 * 价格记录要留着在「套餐」页展示，因此不在这里剔除，
 * 靠「没有按量报价」自然不进速览表。
 */
const NON_CHAT_MODEL = [
  'ocr',
  'pp-structure',
  'structure',
  'embedding',
  'translation',
  'rerank',
  'vision-video',
  'video-h3',
  'image-3',
  'kling-video',
  'vidu-image',
  'tts',
  'asr',
  'hy-3d',
  'yt-vita',
];
const isNonChat = (id: string) => NON_CHAT_MODEL.some((t) => id.includes(t));

function main() {
  const prices = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/prices.json'), 'utf8')
  ) as PriceRecord[];
  const models = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/seeds/models.json'), 'utf8')
  ) as any[];

  const modelMap = new Map(models.map((m) => [m.id, m]));

  // 1. 归并价格记录：先做通用归一，再查显式别名表
  let merged = 0;
  const rename = new Map<string, string>();
  for (const p of prices) {
    const norm = normalizeAlias(p.modelId);
    const target = ALIASES[norm] ?? norm;
    if (target !== p.modelId) {
      if (rename.has(p.modelId) && rename.get(p.modelId) !== target) {
        console.warn(`⚠ 归并冲突: ${p.modelId} → ${rename.get(p.modelId)} / ${target}`);
      }
      rename.set(p.modelId, target);
      p.modelId = target;
      merged++;
    }
  }

  // 2. 去重（归并后可能出现完全相同的记录）
  /*
   * 去重：同渠道 + 同模型 + 同计费模式 + 同档位 + 同价格 → 只留一条。
   *
   * 阿里云百炼的定价表里，同一模型常出现多行（不同规格说明、不同地域、
   * 不同服务商代理），价格可能完全相同。此时保留 note 更长的那条 ——
   * 它的口径信息更全，来源可追溯性更好。
   *
   * 注意：vendorModelId 不参与去重 key —— 例如「开源 2.4T-A95B」是
   * 同一模型的版本标注，归一后应视为不同档位（tierLabel 已区分）。
   */
  const dedup: PriceRecord[] = [];
  const dupIndex = new Map<string, number>();
  for (const p of prices) {
    const key = `${p.modelId}|${p.channelId}|${p.billingMode}|${p.tierLabel ?? ''}|${p.input}|${p.output}|${p.packageTierName ?? ''}`;
    const at = dupIndex.get(key);
    if (at === undefined) {
      dupIndex.set(key, dedup.length);
      dedup.push(p);
      continue;
    }
    /*
     * 择优规则：缓存命中价有值的优先（官网规格页给出缓存价，
     * 通用定价页往往只写「请参见控制台」记为 null）；
     * 同等条件下取 note 更长、口径说明更全的那条。
     */
    const prev = dedup[at];
    const prevHasCache = prev.cacheRead != null;
    const curHasCache = p.cacheRead != null;
    const prevLen = (prev.note ?? '').length;
    const curLen = (p.note ?? '').length;
    if (curHasCache !== prevHasCache) {
      if (curHasCache) dedup[at] = p;
    } else if (curLen > prevLen) {
      dedup[at] = p;
    }
  }

  // 3. 统计每个模型的渠道数
  const channelCount = new Map<string, Set<string>>();
  for (const p of dedup) {
    const s = channelCount.get(p.modelId) ?? new Set();
    s.add(p.channelId);
    channelCount.set(p.modelId, s);
  }

  // 4. 剔除「只有 1 个渠道且不是特定能力模型」的噪声模型
  const dropped: string[] = [];
  /*
   * 有 Artificial Analysis 智能指数的模型一律保留。
   * 它们是能力榜与性价比矩阵的关键坐标 —— 即便当前只被 1 个渠道收录、
   * 甚至暂无价格记录，也不应从站点上消失。
   */
  const intelIds = new Set<string>();
  try {
    const intel = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data/seeds/intelligence.json'), 'utf8')
    ) as { modelId: string }[];
    for (const it of intel) if (it?.modelId) intelIds.add(it.modelId);
  } catch {
    /* 读不到就按空集处理 */
  }

  /* 挂着套餐记录（billingMode=package）的模型一律保留 */
  const pkgModelIds = new Set<string>();
  for (const p of dedup) {
    if (p.billingMode === 'package' && p.modelId) pkgModelIds.add(p.modelId);
  }

  const keptModels: any[] = [];
  for (const m of models) {
    if (isNonChat(m.id)) {
      dropped.push(m.id);
      continue;
    }
    const n = channelCount.get(m.id)?.size ?? 0;
    if (n === 0) {
      // 没有按量价格的模型：只要挂着套餐记录或有跑分数据就保留
      if (intelIds.has(m.id) || pkgModelIds.has(m.id)) {
        keptModels.push(m);
      } else {
        dropped.push(m.id);
      }
      continue;
    }
    if (
      n === 1 &&
      !KEEP_SINGLETON.has(m.id) &&
      !MAJOR_MODELS.has(m.id) &&
      !intelIds.has(m.id)
    ) {
      dropped.push(m.id);
      continue;
    }
    keptModels.push(m);
  }

  // 5. 剔除孤儿价格记录（模型已被剔除的记录不能留在 prices.json）
  const droppedSet = new Set(dropped);
  const keptIds = new Set(keptModels.map((m) => m.id));
  const finalPrices = dedup.filter((p) => keptIds.has(p.modelId));

  // 6. 归并后新增的模型（别名目标不在原表里的）
  for (const [id] of channelCount) {
    if (!modelMap.has(id)) {
      const src = models.find((m) => ALIASES[m.id] === id);
      keptModels.push({
        ...(src ?? {}),
        id,
        name: src?.name ?? id,
        vendor: src?.vendor ?? '未知厂商',
        origin: src?.origin ?? 'domestic',
        openWeights: false,
        contextWindow: null,
        maxOutput: null,
        releasedAt: null,
        params: null,
        activeParams: null,
        pricingUrl: src?.pricingUrl ?? null,
        docsUrl: null,
      });
    }
  }

  fs.writeFileSync(
    path.join(ROOT, 'data/prices.json'),
    JSON.stringify(finalPrices, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(ROOT, 'data/seeds/models.json'),
    JSON.stringify(keptModels.sort((a, b) => a.id.localeCompare(b.id)), null, 2),
    'utf8'
  );

  const counts = [...channelCount.values()].map((s) => s.size);
  console.log(`归并价格记录 ${merged} 条，去重后 ${dedup.length} 条，最终保留 ${finalPrices.length} 条`);
  console.log(`模型 ${models.length} → ${keptModels.length}（剔除噪声 ${dropped.length}）`);
  console.log(`渠道覆盖：最多 ${Math.max(...counts)} 个，最少 ${Math.min(...counts)} 个`);
  console.log('\n多渠道模型（矩阵会显示这些）:');
  for (const [id, s] of [...channelCount.entries()].sort((a, b) => b[1].size - a[1].size)) {
    if (s.size >= 2) console.log(`  ${id.padEnd(26)} ${s.size} 个渠道`);
  }
  console.log('\n剔除的噪声模型:');
  console.log('  ' + dropped.join(', '));
}

main();
