/**
 * 把 Artificial Analysis 的榜单快照合并进 data/seeds/intelligence.json。
 *
 * 数据源优先级：
 *   1. data/snapshots/aa_leaderboard.json  —— /leaderboards/models 全量榜单（272 行）
 *   2. data/snapshots/aa_intelligence.json —— /models 图表榜（仅 28 行，兜底）
 *
 * 为什么改用榜单：/models 图表默认只渲染 28 条，导致 75 个模型里只有 13 个
 * 有智能指数，页面上整列是横杠。榜单一次性给出全量，覆盖直接翻三倍。
 *
 * 铁律：只使用 AA 页面上实际读到的数值。映射不到项目模型 id 的直接跳过，
 * 绝不反推、绝不用近似值。
 */
import fs from 'fs';
import path from 'path';
import { guessSlug } from './slug-rules';

const ROOT = process.cwd();

interface LeaderRow {
  name: string;
  creator: string;
  context: string;
  license: string;
  index: number | null;
  costPerTaskUsd: number | null;
  inputUsd: number | null;
  outputUsd: number | null;
  outputTokensPerSec: number | null;
}

interface Intelligence {
  modelId: string;
  index: number | null;
  rank: number | null;
  costPerTaskUsd: number | null;
  outputTokensPerSec: number | null;
  source: string;
  measuredAt: string;
  aaName?: string;
  note?: string;
}

/**
 * AA 模型名 → 项目模型 id 的人工兜底。
 *
 * guessSlug 处理绝大多数写法，剩下的是「同一型号有多个推理档位」
 * 或「带日期版本」的情况 —— 这类必须人工确认，否则会把
 * Qwen3.8 Max (0902) 的分数记到 Qwen3.8 Max 头上。
 */
const AA_TO_SLUG: Record<string, string> = {
  'Qwen3.8 Max (0902)': 'qwen3-8-max-0902',
  'DeepSeek V4.1 Flash 1017 (max)': 'deepseek-v4-1-flash',
  'DeepSeek V4 Pro 0813 (max)': 'deepseek-v4-pro',
  'MiniMax-M3.1-Flash': 'minimax-m3-1-flash',
};

/** 榜单里带推理档位后缀的名字，去掉后缀再试一次 slug 规则 */
const STRIP_SUFFIX =
  /\s*\((?:max|xhigh|high|medium|low|minimal|non-reasoning|thinking|with fallback|default fallback|[^)]*)\)\s*$/i;

function loadLeaderboard(): { rows: LeaderRow[]; measuredAt: string; sourceUrl: string } {
  const lbPath = path.join(ROOT, 'data/snapshots', 'aa_leaderboard.json');
  if (fs.existsSync(lbPath)) {
    const lb = JSON.parse(fs.readFileSync(lbPath, 'utf8'));
    return {
      rows: lb.rows as LeaderRow[],
      measuredAt: lb.fetchedAt ?? new Date().toISOString().slice(0, 10),
      sourceUrl: lb.sourceUrl ?? 'https://artificialanalysis.ai/leaderboards/models',
    };
  }

  // 兜底：旧的 /models 图表快照（只有 28 条，且没有成本/速度字段）
  const aaPath = path.join(ROOT, 'data/snapshots', 'aa_intelligence.json');
  const aa = JSON.parse(fs.readFileSync(aaPath, 'utf8')) as {
    name: string;
    index: number;
    rank: number;
  }[];
  return {
    rows: aa.map((r) => ({
      name: r.name,
      creator: '',
      context: '',
      license: '',
      index: r.index,
      costPerTaskUsd: null,
      inputUsd: null,
      outputUsd: null,
      outputTokensPerSec: null,
    })),
    measuredAt: '2026-10-28',
    sourceUrl: 'https://artificialanalysis.ai/models',
  };
}

function slugFor(name: string): string | null {
  const manual = AA_TO_SLUG[name];
  if (manual) return manual;
  return guessSlug(name) ?? guessSlug(name.replace(STRIP_SUFFIX, '').trim()) ?? null;
}

function main() {
  const { rows, measuredAt } = loadLeaderboard();
  console.log('AA 榜单:', rows.length, '条');

  const modelsPath = path.join(ROOT, 'data/seeds/models.json');
  const models = JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as { id: string; name: string }[];
  const modelIds = new Set(models.map((m) => m.id));

  const intelPath = path.join(ROOT, 'data/seeds/intelligence.json');
  const prev = JSON.parse(fs.readFileSync(intelPath, 'utf8')) as Intelligence[];
  const byId = new Map(prev.map((r) => [r.modelId, r]));

  /*
   * 排名：按榜单全量行降序编号（与 AA 榜单顺序一致）。
   * 只算有指数的行 —— 没有指数的行不占名次。
   */
  const ranked = rows
    .filter((r) => r.index != null)
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
  const rankOf = new Map<LeaderRow, number>();
  ranked.forEach((r, i) => rankOf.set(r, i + 1));

  /*
   * 同一型号在榜单里有多个推理档位（max / high / low…），分数不同。
   * AA 自己的图表用的是该型号的最高档，这里保持一致：每个型号只取指数最高的那一行。
   */
  const best = new Map<string, { row: LeaderRow; rank: number }>();
  for (const r of rows) {
    if (r.index == null) continue;
    const slug = slugFor(r.name);
    if (!slug || !modelIds.has(slug)) continue;
    const cur = best.get(slug);
    if (!cur || r.index > (cur.row.index ?? 0)) {
      best.set(slug, { row: r, rank: rankOf.get(r) ?? null });
    }
  }

  let added = 0;
  let updated = 0;
  for (const [slug, { row, rank }] of best) {
    const old = byId.get(slug);
    const next: Intelligence = {
      modelId: slug,
      index: row.index,
      rank,
      costPerTaskUsd: row.costPerTaskUsd,
      outputTokensPerSec: row.outputTokensPerSec,
      source: 'Artificial Analysis',
      measuredAt,
      aaName: row.name,
    };
    if (old) {
      byId.set(slug, { ...old, ...next });
      updated++;
    } else {
      byId.set(slug, next);
      added++;
    }
  }

  /*
   * 清理不可靠的历史数据：
   * 本次榜单没覆盖到的旧记录一律清空 index，而不是留着来源不明的数字。
   * （旧文件里有过 45.42 / 42.7 这类小数指数 —— AA 的智能指数是整数，
   *   那些值不是从 AA 读到的。）
   */
  for (const rec of byId.values()) {
    if (best.has(rec.modelId)) continue;
    if (!rec.aaName) {
      rec.index = null;
      rec.rank = null;
      rec.source = 'Artificial Analysis';
      rec.measuredAt = measuredAt;
      rec.note = '本次榜单快照未覆盖该模型，指数待补';
    }
  }

  const out = [...byId.values()].sort((a, b) => {
    const ai = a.index ?? -1;
    const bi = b.index ?? -1;
    if (bi !== ai) return bi - ai;
    return (a.rank ?? 999) - (b.rank ?? 999);
  });
  fs.writeFileSync(intelPath, JSON.stringify(out, null, 2), 'utf8');

  const withIndex = out.filter((r) => r.index != null).length;
  console.log(
    `更新 ${updated} 条，新增 ${added} 条，合计 ${out.length} 条（其中有指数 ${withIndex} 条）`
  );

  const unmatched = rows.filter((r) => {
    if (r.index == null) return false;
    const s = slugFor(r.name);
    return !s || !modelIds.has(s);
  });
  if (unmatched.length) {
    console.log('\n榜单中本站未收录的模型:', unmatched.length, '个（不写入）');
    for (const u of unmatched.slice(0, 25)) {
      console.log(`  ${u.name} → ${slugFor(u.name) ?? '(无法识别)'}`);
    }
  }
}

main();
