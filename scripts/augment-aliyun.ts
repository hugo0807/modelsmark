/**
 * 阿里云百炼 raw 补齐器
 *
 * 背景：data/raw/aliyun-bailian.json 是人工挑选整理的 44 条记录，
 * 而官网定价页实际有 200+ 个文本模型条目。结果是 GLM-5.3-FlashX、
 * Kimi-K2.5/2.6/2.7-Code、GLM-5.1/5.2、MiniMax-M2.5、DeepSeek-V4-Flash-0731
 * 等主流型号在阿里云这条渠道上没有报价 —— 模型在别的渠道出现了，
 * 阿里云却没有，看起来就像「数据没抓到」。
 *
 * 本脚本从官网定价页快照（data/snapshots/aliyun-pricing.json）解析出
 * 结构简单的文本模型定价行，补进 raw。原则：
 *
 *   1. 只解析「一行 = 一个模型 + 一个输入价 + 一个输出价」的简单表；
 *      阶梯定价按既有惯例只取基础档，并用 tierLabel 标注区间
 *      （isStandardTier 会把带区间的档位排除出最低价计算）。
 *   2. 上下文缓存折扣表跳过 —— 那是缓存价，不是基础价。
 *   3. 地域表只取「全球」，境外部署价不混入国内报价。
 *   4. 免费 / 限时免费跳过。
 *   5. 已存在的 vendorModelId 不覆盖（raw 里的人工口径优先）。
 *
 * 用法：npx tsx scripts/augment-aliyun.ts [--dry]
 */
import * as fs from 'fs';
import * as path from 'path';
import { guessSlug } from './slug-rules';

const ROOT = process.cwd();
const RAW_PATH = path.join(ROOT, 'data/raw/aliyun-bailian.json');
const SNAP_PATH = path.join(ROOT, 'data/snapshots/aliyun-pricing.json');
const DRY = process.argv.includes('--dry');

const SOURCE_URL = 'https://help.aliyun.com/zh/model-studio/model-pricing';

/** 「忙时 3元 闲时 1.5元」→ 解析为峰谷两档 */
function parsePrice(cell: string): { peak: number | null; off: number | null; flat: number | null } {
  const s = String(cell ?? '').trim();
  if (!s) return { peak: null, off: null, flat: null };
  if (/免费/.test(s)) return { peak: null, off: null, flat: null };

  const peakM = s.match(/忙时\s*(\d+(?:\.\d+)?)\s*元/);
  const offM = s.match(/闲时\s*(\d+(?:\.\d+)?)\s*元/);
  if (peakM || offM) {
    return {
      peak: peakM ? Number(peakM[1]) : null,
      off: offM ? Number(offM[1]) : null,
      flat: null,
    };
  }

  // 「原价6元（限时8折）」→ 折后价
  const origM = s.match(/原价\s*(\d+(?:\.\d+)?)\s*元/);
  const discM = s.match(/(\d+(?:\.\d+)?)\s*折/);
  if (origM && discM) {
    const rate = Number(discM[1]) / 10;
    return { peak: null, off: null, flat: Number((Number(origM[1]) * rate).toFixed(4)) };
  }

  // 「输入不超过 512k Token：2.1元 输入超过 512k Token：4.2元」→ 取第一档
  const firstM = s.match(/(\d+(?:\.\d+)?)\s*元/);
  if (firstM) return { peak: null, off: null, flat: Number(firstM[1]) };

  return { peak: null, off: null, flat: null };
}

/**
 * 清理模型 ID，并识别 Batch 半价标记。
 *
 * 官网把「Batch 调用半价」直接拼在模型 ID 后面（如 `qwen-plusBatch调用半价`），
 * 这不是型号的一部分，而是计费档位 —— 要拆开，否则会造出一个不存在的模型。
 */
function cleanModelId(name: string): { id: string; isBatch: boolean } {
  let s = String(name)
    .replace(/\s*上下文缓存享有折扣\s*/g, '')
    .replace(/\s*Session Cache享有折扣\s*/g, '')
    .replace(/\s*当前能力等同于[^\s]+\s*/g, '')
    .trim();
  const isBatch = /Batch调用半价/.test(s);
  s = s.replace(/Batch调用半价/g, '').trim();
  return { id: s, isBatch };
}

/**
 * 同族去重：同一型号族只保留日期最新的一条。
 *
 * 阿里云官网同时挂着同一模型的历史快照（如 qwen3.5-plus-2026-02-15 与
 * qwen3.5-plus-2026-04-20），价格也基本相同。全收会让模型表翻倍，
 * 但它们对选型没有参考价值 —— 只保留最新日期版本。
 */
function latestByFamily(ids: string[]): Set<string> {
  const best = new Map<string, { id: string; stamp: string }>();
  const dateRe = /(\d{4})-(\d{2})-(\d{2})/;
  for (const id of ids) {
    const base = id.replace(dateRe, '').replace(/[-_]$/, '');
    const m = id.match(dateRe);
    const stamp = m ? `${m[1]}${m[2]}${m[3]}` : '';
    const cur = best.get(base);
    if (!cur || stamp > cur.stamp) best.set(base, { id, stamp });
  }
  return new Set([...best.values()].map((v) => v.id));
}

/**
 * 只保留「对话 / 推理类文本模型」。
 *
 * 阿里云定价页同时挂着图像生成、语音合成、翻译、向量、重排等模型，
 * 它们的计费单位（张 / 秒 / 万字符）与按 token 计价的文本模型不可比，
 * 混进比价表会让「混合价」失去意义 —— 所以按型号名排除非文本品类。
 *
 * 保留多模态对话模型（omni / vl），它们仍然按 token 计费。
 */
const NON_TEXT_MODEL =
  /(image|img|audio|tts|asr|voice|speech|translate|livetranslate|realtime|mt-|unisound|embed|rerank|ocr|doc-turbo|deep-research|vision|paraformer|fun-asr|gui-plus|decision-model|intent-detect)/i;

/**
 * --repair：只回填 raw 里为空 / 已失效的 modelId，不新增记录。
 *
 * 用于 slug 规则升级后（例如把 [\s-] 放宽为 [\s\-.]），把历史上因为
 * 未命中规则而丢掉 modelId 的记录重新接回全局模型表 —— 否则这些记录
 * 在 ingest 阶段会被整条丢弃，表现为「官网明明有价，站上却查无此价」。
 */
function repairModelIds(raw: any): number {
  let patched = 0;
  const still: string[] = [];
  for (const p of raw.prices) {
    if (p.modelId) continue;
    const slug = guessSlug(String(p.vendorModelId ?? ''));
    if (slug) {
      p.modelId = slug;
      patched += 1;
    } else {
      still.push(String(p.vendorModelId));
    }
  }
  console.log(`回填 modelId ${patched} 条`);
  if (still.length) {
    console.log(`仍无法识别 ${still.length} 条：`);
    for (const s of still) console.log(`  ? ${s}`);
  }
  return patched;
}

function main() {
  const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8'));

  if (process.argv.includes('--repair')) {
    repairModelIds(raw);
    fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2) + '\n');
    console.log(`已写入 ${RAW_PATH}（共 ${raw.prices.length} 条，不新增记录）`);
    return;
  }

  if (!fs.existsSync(SNAP_PATH)) {
    console.error(`缺少官网定价页快照：${SNAP_PATH}`);
    process.exit(1);
  }
  const site = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));

  const existing = new Set<string>();
  for (const p of raw.prices) {
    existing.add(String(p.vendorModelId ?? '').toLowerCase());
  }

  const added: any[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const table of site.tables ?? []) {
    const rows: string[][] = table.rows ?? [];
    if (rows.length < 2) continue;
    const head = rows[0].map((h) => String(h));

    // 定位输入价 / 输出价列
    const inCol = head.findIndex((h) => /输入单价/.test(h));
    const outCol = head.findIndex((h) => /输出单价/.test(h));
    if (inCol < 0 || outCol < 0) continue;

    // 阶梯列（单次请求的输入 Token 数 / 输入 Token 范围）
    const tierCol = head.findIndex((h) => /单次请求的输入Token数|输入Token范围/.test(h));
    // 地域列
    const regionCol = head.findIndex((h) => /服务部署范围/.test(h));
    // 缓存折扣列 —— 命中则整表跳过
    if (head.some((h) => /缓存命中输入单价/.test(h))) continue;

    for (const row of rows.slice(1)) {
      if (!row || row.length <= Math.max(inCol, outCol)) continue;
      const rawId = String(row[0] ?? '').trim();
      if (!rawId) continue;
      // 阶梯续行 / 表头重复
      if (/Token\s*[≤<]/.test(rawId) || /^模型\s*ID/.test(rawId)) continue;

      const cleaned = cleanModelId(rawId);
      const modelId = cleaned.id;
      if (!modelId) continue;
      const isBatch = cleaned.isBatch;

      if (NON_TEXT_MODEL.test(modelId)) {
        skipped.push({ id: modelId, reason: '非文本模型（图像/语音/翻译/向量等）' });
        continue;
      }

      // 缓存折扣表的条目直接跳过
      if (/上下文缓存享有折扣/.test(rawId)) {
        skipped.push({ id: rawId, reason: '缓存折扣条目' });
        continue;
      }
      // 地域表只取全球
      if (regionCol >= 0) {
        const region = String(row[regionCol] ?? '').trim();
        if (region && region !== '全球') {
          skipped.push({ id: modelId, reason: `非全球部署（${region}）` });
          continue;
        }
      }

      const inText = String(row[inCol] ?? '');
      const outText = String(row[outCol] ?? '');
      const pi = parsePrice(inText);
      const po = parsePrice(outText);
      if (pi.flat == null && pi.peak == null && pi.off == null) {
        if (pi.flat == null) skipped.push({ id: modelId, reason: '价格不可解析或免费' });
        continue;
      }
      if (po.flat == null && po.peak == null && po.off == null) {
        skipped.push({ id: modelId, reason: '输出价不可解析或免费' });
        continue;
      }

      // 阶梯档标注
      let tierNote = '';
      if (tierCol >= 0) {
        const tv = String(row[tierCol] ?? '').trim();
        if (tv && tv !== '不区分阶梯') tierNote = tv;
      }

      const push = (input: number | null, output: number | null, tier: any, tierLabel: string | null) => {
        const key = modelId.toLowerCase();
        if (existing.has(key)) return;
        existing.add(key);
        added.push({
          modelId: guessSlug(modelId) ?? '',
          vendorModelId: modelId,
          billingMode: 'payg',
          currency: 'CNY',
          sourceUrl: SOURCE_URL,
          fetchedAt: raw.fetchedAt,
          input,
          cacheRead: null,
          cacheWrite: null,
          output,
          tier,
          tierLabel,
          promotional: false,
          promoNote: null,
          note: `阿里云百炼官网定价页（${modelId}${
            tierNote ? `，输入档位 ${tierNote}` : ''
          }）。上下文缓存折扣表另计，未并入本条。`,
        });
      };

      if (pi.peak != null || pi.off != null) {
        if (pi.peak != null && po.peak != null) {
          push(pi.peak, po.peak, { kind: 'peak', window: '08:00-22:00', note: '阿里云百炼高峰时段' }, '忙时');
        }
        if (pi.off != null && po.off != null) {
          push(pi.off, po.off, { kind: 'offpeak', window: '22:00-08:00', note: '阿里云百炼闲时时段' }, '闲时');
        }
      } else if (pi.flat != null && po.flat != null) {
        // 「无阶梯计价」不是区间，是官网标注该模型不区分阶梯
        const isTiered = tierNote && tierNote !== '无阶梯计价';
        push(
          pi.flat,
          po.flat,
          isBatch ? { kind: 'batch', note: 'Batch 调用半价档（官网在模型 ID 后标注「Batch调用半价」）' } : { kind: 'none' },
          isBatch
            ? 'Batch'
            : isTiered
              ? `≤${tierNote.replace(/.*[≤<]\s*/, '').replace(/Token\s*$/, '')}`
              : null
        );
      }
    }
  }

  /*
   * 同族去重：同一型号族只保留日期最新的那条。
   * 例：qwen3.5-plus-2026-02-15 / -2026-04-20 → 只留 -2026-04-20。
   */
  const keep = latestByFamily(added.map((a) => String(a.vendorModelId)));
  const droppedByFamily = added.filter((a) => !keep.has(String(a.vendorModelId)));
  for (const d of droppedByFamily) {
    skipped.push({ id: String(d.vendorModelId), reason: '同族有更新版本' });
  }
  const finalAdded = added.filter((a) => keep.has(String(a.vendorModelId)));

  console.log(`解析到新增 ${finalAdded.length} 条（同族去重丢弃 ${droppedByFamily.length} 条）`);
  for (const a of finalAdded) {
    console.log(
      `  + ${String(a.vendorModelId).padEnd(34)} ${a.input}/${a.output}  ${a.tierLabel ?? '-'}`
    );
  }
  const reasonCount = new Map<string, number>();
  for (const s of skipped) reasonCount.set(s.reason, (reasonCount.get(s.reason) ?? 0) + 1);
  console.log('\n跳过统计：');
  for (const [r, n] of reasonCount) console.log(`  ${r}: ${n}`);

  if (DRY) {
    console.log('\n(--dry 未写入)');
    return;
  }

  /*
   * 修补历史记录里为空的 modelId —— 用与新增记录同一套 slug 规则推导，
   * 保证整份 raw 的 modelId 都指向全局模型表里的 id。
   */
  let patched = 0;
  for (const p of raw.prices) {
    if (p.modelId) continue;
    const slug = guessSlug(String(p.vendorModelId ?? ''));
    if (slug) {
      p.modelId = slug;
      patched += 1;
    }
  }
  if (patched) console.log(`修补空 modelId ${patched} 条`);

  raw.prices = [...raw.prices, ...finalAdded];
  raw.augmentedAt = new Date().toISOString();
  fs.writeFileSync(RAW_PATH, JSON.stringify(raw, null, 2) + '\n');
  console.log(`\n已写入 ${RAW_PATH}（共 ${raw.prices.length} 条）`);
}

main();
