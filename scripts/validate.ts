/**
 * 数据校验
 *
 * 在每次抓取后、提交前运行。任一项失败则退出码非 0，
 * GitHub Actions 会中止本次发布，避免把坏数据推上线。
 *
 * 校验项：
 * 1. 必需文件存在且可解析
 * 2. 外键完整性：price.modelId / price.channelId / score.benchmarkId 都能找到对应记录
 * 3. 价格合法性：非负、非 NaN
 * 4. 覆盖率：每个官方渠道至少有数据
 * 5. 跳变检测：与上次快照相比，同一条价格变动超过 30% 时告警（不阻断，但会写进报告）
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Benchmark, Channel, Model, PriceRecord, Score } from '../src/lib/types';

const DATA_DIR = path.join(process.cwd(), 'data');

let errors = 0;
let warnings = 0;

function fail(msg: string) {
  console.error(`✗ ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.warn(`! ${msg}`);
  warnings++;
}

function readJson<T>(file: string): T | null {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    fail(`缺少文件 ${file}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8')) as T;
  } catch (err) {
    fail(`${file} JSON 解析失败：${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function main() {
  console.log('===== ModelsMark 数据校验 =====');

  const models = readJson<Model[]>('seeds/models.json');
  const channels = readJson<Channel[]>('seeds/channels.json');
  const benchmarks = readJson<Benchmark[]>('seeds/benchmarks.json');
  const scores = readJson<Score[]>('seeds/scores.json');
  const prices = readJson<PriceRecord[]>('prices.json');
  const fx = readJson<{ rates: { date: string; usdCny: number }[] }>('fx.json');

  if (!models || !channels || !benchmarks || !scores || !prices || !fx) {
    console.error('\n基础文件缺失，终止校验');
    process.exit(1);
  }

  // 1. 唯一性
  const modelIds = new Set(models.map((m) => m.id));
  if (modelIds.size !== models.length) fail('models.json 存在重复 id');
  const channelIds = new Set(channels.map((c) => c.id));
  if (channelIds.size !== channels.length) fail('channels.json 存在重复 id');
  const benchIds = new Set(benchmarks.map((b) => b.id));
  if (benchIds.size !== benchmarks.length) fail('benchmarks.json 存在重复 id');

  // 2. 外键完整性
  for (const p of prices) {
    if (!modelIds.has(p.modelId)) fail(`价格记录引用了不存在的模型：${p.modelId}`);
    if (!channelIds.has(p.channelId)) fail(`价格记录引用了不存在的渠道：${p.channelId}`);
  }
  for (const s of scores) {
    if (!modelIds.has(s.modelId)) fail(`分数记录引用了不存在的模型：${s.modelId}`);
    if (!benchIds.has(s.benchmarkId)) fail(`分数记录引用了不存在的基准：${s.benchmarkId}`);
  }

  // 3. 价格合法性
  for (const p of prices) {
    const fields: Array<[string, number | null | undefined]> = [
      ['input', p.input],
      ['cacheRead', p.cacheRead],
      ['cacheWrite', p.cacheWrite],
      ['output', p.output],
    ];
    for (const [name, v] of fields) {
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number' || Number.isNaN(v)) {
        fail(`${p.modelId}@${p.channelId} 的 ${name} 不是有效数字：${v}`);
      } else if (v < 0) {
        fail(`${p.modelId}@${p.channelId} 的 ${name} 为负数：${v}`);
      }
    }
    // 按量价必须至少有一个价格字段
    if (p.billingMode === 'payg' && p.input === null && p.output === null) {
      fail(`${p.modelId}@${p.channelId} 的按量价缺少输入与输出单价`);
    }
    // 套餐价必须有额度与价格
    if (p.billingMode === 'package') {
      if (!p.packageTokens || !p.packagePrice) {
        fail(`${p.modelId}@${p.channelId} 的套餐价缺少额度或价格`);
      }
    }
  }

  // 4. 覆盖率：官方渠道必须有数据
  for (const c of channels.filter((x) => x.type === 'first_party')) {
    const n = prices.filter((p) => p.channelId === c.id).length;
    if (n === 0) {
      warn(`官方渠道 ${c.name}（${c.id}）当前无价格数据`);
    }
  }

  // 5. 跳变检测
  const prevPath = path.join(DATA_DIR, 'prices.prev.json');
  if (fs.existsSync(prevPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8')) as PriceRecord[];
      const key = (p: PriceRecord) =>
        `${p.modelId}::${p.channelId}::${p.billingMode}::${p.tierLabel ?? ''}`;
      const prevMap = new Map(prev.map((p) => [key(p), p]));
      for (const p of prices) {
        const old = prevMap.get(key(p));
        if (!old || p.billingMode !== 'payg') continue;
        const oi = old.input ?? 0;
        const ni = p.input ?? 0;
        if (oi > 0 && ni > 0) {
          const delta = (ni - oi) / oi;
          if (Math.abs(delta) > 0.3) {
            warn(
              `价格跳变 ${p.modelId}@${p.channelId}：${oi} → ${ni}（${(delta * 100).toFixed(0)}%），请人工复核`
            );
          }
        }
      }
    } catch {
      warn('prices.prev.json 解析失败，跳过跳变检测');
    }
  }

  // 6. 汇率合理性
  for (const r of fx.rates) {
    if (r.usdCny < 5 || r.usdCny > 9) {
      fail(`汇率 ${r.date} 数值异常：${r.usdCny}`);
    }
  }

  console.log('────────────────────────────');
  console.log(
    `模型 ${models.length} · 渠道 ${channels.length} · 基准 ${benchmarks.length} · 分数 ${scores.length} · 价格 ${prices.length}`
  );
  console.log(`错误 ${errors} 项 · 警告 ${warnings} 项`);

  if (errors > 0) {
    console.error('\n校验未通过，本次快照不予发布');
    process.exit(1);
  }
  console.log('校验通过');
}

main();
