/**
 * 把 .probe/aa_intelligence.json（Artificial Analysis 抓取结果）合并进
 * data/seeds/intelligence.json。
 *
 * 铁律：只使用 AA 页面上实际读到的 index 值。映射不到项目模型 id 的直接跳过，
 * 绝不反推、绝不用近似值。
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

interface AARec {
  name: string;
  index: number;
  rank: number;
}

interface Intelligence {
  modelId: string;
  index: number;
  rank: number | null;
  costPerTaskUsd: number | null;
  outputTokensPerSec: number | null;
  source: string;
  measuredAt: string;
  aaName?: string;
  note?: string;
}

/** AA 模型名 → 项目模型 id。左边是 AA 页面上的原文。 */
const AA_TO_SLUG: Record<string, string> = {
  'Claude Opus 5.5 (max with fallback)': 'claude-opus-5-5',
  'Claude Sonnet 5.5 (max with fallback)': 'claude-sonnet-5-5',
  'Claude Haiku 5.5 (max with fallback)': 'claude-haiku-5-5',
  'Claude Fable 5.1 (max with fallback)': 'claude-fable-5-1',
  'GPT-6 Astra (max)': 'gpt-6-astra',
  'GPT-6.1 Sol (max)': 'gpt-6-1-sol',
  'GPT-6.1 Terra (max)': 'gpt-6-1-terra',
  'GPT-6 Luna (max)': 'gpt-6-luna',
  'Gemini 4 Argon (high)': 'gemini-4-argon',
  'Gemini 3.8 Flash (high)': 'gemini-3-8-flash',
  'Grok 4.7 (xhigh)': 'grok-4-7',
  'Kimi K3.1 Pro': 'kimi-k3-1-pro',
  'Muse Wonder (max)': 'muse-wonder',
  'Muse Wonder Full (max)': 'muse-wonder-full',
  'Muse Spark Open (xhigh)': 'muse-spark-open',
  'DeepSeek V4.1 Flash 1017 (max)': 'deepseek-v4-1-flash',
  'GLM-5.3 (max)': 'glm-5-3',
  'MiMo-V2.6-Pro': 'mimo-v2-6-pro',
  'Ling 3.1 Flash 1019': 'ling-3-1-flash-1019',
  'MiniMax-M3.1-Flash': 'minimax-m3-1-flash',
  'Step 5 Preview': 'step-5-preview',
  'Mistral Large 4 Preview': 'mistral-large-4-preview',
  'Qwen3.8 Max (0902)': 'qwen3-8-max-0902',
  'Qwen3.8 27B (xhigh)': 'qwen3-8-27b',
  'K2 Horizon 375B A23B': 'k2-horizon-375b-a23b',
  'Beam 1.0': 'reflection-beam',
  'Nemotron 3.5 Super VL': 'nemotron-3-5-super-vl',
  'Inkling (xhigh)': 'inkling',
};

function main() {
  // AA 抓取结果随仓库入库（CI 的定时任务不会现场抓 AA）
  const aaPath = path.join(ROOT, 'data/snapshots', 'aa_intelligence.json');
  const aa = JSON.parse(fs.readFileSync(aaPath, 'utf8')) as AARec[];
  console.log('AA 抓取:', aa.length, '条');

  const modelsPath = path.join(ROOT, 'data/seeds/models.json');
  const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as { id: string; name: string }[];
  const modelIds = new Set(models.map((m) => m.id));

  const intelPath = path.join(ROOT, 'data/seeds/intelligence.json');
  const prev = JSON.parse(fs.readFileSync(intelPath, 'utf8')) as Intelligence[];
  const byId = new Map(prev.map((r) => [r.modelId, r]));

  const MEASURED_AT = '2026-10-28';
  let added = 0;
  let updated = 0;
  const unmatched: string[] = [];

  for (const r of aa) {
    const slug = AA_TO_SLUG[r.name];
    if (!slug) {
      unmatched.push(r.name);
      continue;
    }
    if (!modelIds.has(slug)) {
      // 模型表里还没有这个模型 —— 记下来，稍后由 build-models 补
      unmatched.push(`${r.name} → ${slug}（模型表无此 id）`);
      continue;
    }
    const old = byId.get(slug);
    if (old) {
      old.index = r.index;
      old.rank = r.rank;
      old.source = 'Artificial Analysis';
      old.measuredAt = MEASURED_AT;
      old.aaName = r.name;
      updated++;
    } else {
      byId.set(slug, {
        modelId: slug,
        index: r.index,
        rank: r.rank,
        costPerTaskUsd: null,
        outputTokensPerSec: null,
        source: 'Artificial Analysis',
        measuredAt: MEASURED_AT,
        aaName: r.name,
      });
      added++;
    }
  }

  /*
   * 清理不可靠的历史数据：
   * 旧文件里有 9 条 index 为小数（45.42 / 42.7 / 41.8 / 25.3）或 null 的记录，
   * 同样标注来源是 Artificial Analysis —— 但 AA 的智能指数是整数，
   * 这些值显然不是从 AA 读到的（可能是早期人工填写或其他口径）。
   * 其中 qwen3-8-max 的 45.42 与本次抓到的真实值 34 直接冲突。
   *
   * 原则：只保留本次从 AA 实际抓到的记录。旧记录若本次未覆盖到，
   * 一律清空 index（保留条目但标注「未收录」），而不是留着一个来源不明的数字。
   */
  const fetchedSlugs = new Set(
    aa.map((r) => AA_TO_SLUG[r.name]).filter((x): x is string => Boolean(x))
  );
  for (const rec of byId.values()) {
    if (fetchedSlugs.has(rec.modelId)) continue;
    if (!rec.aaName) {
      rec.index = null;
      rec.rank = null;
      rec.source = 'Artificial Analysis';
      rec.measuredAt = MEASURED_AT;
      rec.note = '本次快照未覆盖该模型，指数待补';
    }
  }

  const out = [...byId.values()].sort((a, b) => {
    const ai = a.index ?? -1;
    const bi = b.index ?? -1;
    if (bi !== ai) return bi - ai;
    return (a.rank ?? 999) - (b.rank ?? 999);
  });
  fs.writeFileSync(intelPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`更新 ${updated} 条，新增 ${added} 条，合计 ${out.length} 条`);

  if (unmatched.length) {
    console.log('\n未匹配（未写入）：');
    for (const u of unmatched) console.log('  ', u);
  }
}

main();
