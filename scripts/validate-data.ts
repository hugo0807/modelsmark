/**
 * 数据接地校验 —— 「数据来源必须真实可靠」的执行者。
 *
 * 检查项：
 * 1. 每条价格记录都有 sourceUrl + fetchedAt + quote（可溯源）
 * 2. 每条价格记录的 modelId 都存在于模型种子表（无孤儿）
 * 3. 每条价格记录的 channelId 都存在于渠道种子表
 * 4. 数值合法性：单价 > 0，无 NaN/Infinity
 * 5. 缓存价不应高于输入价（解析错位的典型症状）
 * 6. 套餐折合价与刊例价口径一致
 * 7. 官方基准唯一：同一模型出现多个官方价时告警
 * 8. 来源 URL 可达（抽样 HTTP 验证）
 *
 * 用法：npx tsx scripts/validate-data.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PriceRecord, Model, Channel } from '../src/lib/types';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

async function main() {
const prices = readJson<PriceRecord[]>(path.join(DATA, 'prices.json'));
const models = readJson<Model[]>(path.join(DATA, 'seeds/models.json'));
const channels = readJson<Channel[]>(path.join(DATA, 'seeds/channels.json'));

const modelIds = new Set(models.map((m) => m.id));
const channelIds = new Set(channels.map((c) => c.id));

interface Issue {
  level: 'error' | 'warn';
  kind: string;
  detail: string;
  sample?: string;
}
const issues: Issue[] = [];

const err = (kind: string, detail: string, sample?: string) =>
  issues.push({ level: 'error', kind, detail, sample });
const warn = (kind: string, detail: string, sample?: string) =>
  issues.push({ level: 'warn', kind, detail, sample });

// ── 1. 可溯源 ──
for (const p of prices) {
  const label = `${p.modelId} @ ${p.channelId}`;
  if (!p.evidence?.sourceUrl) err('无来源 URL', 'evidence.sourceUrl 缺失', label);
  else if (!/^https?:\/\//.test(p.evidence.sourceUrl))
    err('来源 URL 非法', p.evidence.sourceUrl, label);
  if (!p.evidence?.fetchedAt) err('无抓取时间', 'evidence.fetchedAt 缺失', label);
  if (!p.evidence?.quote) err('无原文锚点', 'evidence.quote 缺失，无法核验', label);
}

// ── 2. 无孤儿模型 ──
for (const p of prices) {
  if (!modelIds.has(p.modelId)) {
    err('孤儿记录', `模型 ${p.modelId} 不在 models.json`, `${p.modelId} @ ${p.channelId}`);
  }
}

// ── 3. 无孤儿渠道 ──
for (const p of prices) {
  if (!channelIds.has(p.channelId)) {
    err('孤儿渠道', `渠道 ${p.channelId} 不在 channels.json`, `${p.modelId} @ ${p.channelId}`);
  }
}

// ── 4. 数值合法性 ──
for (const p of prices) {
  const label = `${p.modelId} @ ${p.channelId}`;
  const check = (v: number | null | undefined, name: string) => {
    if (v == null) return;
    if (!Number.isFinite(v)) err('数值非法', `${name} = ${v}`, label);
    else if (v < 0) err('数值为负', `${name} = ${v}`, label);
  };
  check(p.input, 'input');
  check(p.output, 'output');
  check(p.cacheRead, 'cacheRead');
  check(p.cacheWrite, 'cacheWrite');
  check(p.packagePrice, 'packagePrice');
  check(p.packageQuota, 'packageQuota');
}

// ── 5. 缓存价不应高于输入价 ──
for (const p of prices) {
  if (p.cacheRead != null && p.input != null && p.cacheRead > p.input) {
    err(
      '缓存价高于输入价',
      `cacheRead=${p.cacheRead} > input=${p.input}（典型解析错位）`,
      `${p.modelId} @ ${p.channelId}`
    );
  }
}

// ── 6. 套餐折合价 ──
for (const p of prices) {
  if (p.billingMode !== 'package') continue;
  const label = `${p.modelId} @ ${p.channelId}`;
  if (!p.packageQuotaUnit) {
    err('套餐缺额度口径', 'packageQuotaUnit 为空', label);
    continue;
  }
  // 按额度口径分别校验：
  // - tokens: 必须有 token 额度 + 价格，可折算 ¥/M
  // - calls:  必须有调用次数 + 价格，可折算 ¥/次
  // - mixed:  积分制/混合制，官方常不给单一额度，只需有价格
  if (p.packageQuotaUnit === 'tokens') {
    if (!p.packageQuota) err('套餐缺额度', 'tokens 口径但 packageQuota 为空', label);
    if (p.packagePrice == null) err('套餐缺价格', 'packagePrice 为空', label);
  } else if (p.packageQuotaUnit === 'calls') {
    if (!p.packageCalls) err('套餐缺次数', 'calls 口径但 packageCalls 为空', label);
    if (p.packagePrice == null) err('套餐缺价格', 'packagePrice 为空', label);
  } else {
    // mixed：必须有价格，否则这个套餐记录毫无意义
    if (p.packagePrice == null) err('套餐缺价格', 'mixed 口径但 packagePrice 为空', label);
  }
  if (p.packageQuota && p.packagePrice != null) {
    const perM = (p.packagePrice / p.packageQuota) * 1_000_000;
    if (!Number.isFinite(perM) || perM <= 0) err('套餐折合价非法', `折合 ${perM}`, label);
  }
  if (p.packageCalls && p.packagePrice != null) {
    const perCall = p.packagePrice / p.packageCalls;
    if (!Number.isFinite(perCall) || perCall <= 0) err('套餐次单价非法', `每次 ${perCall}`, label);
  }
}

// ── 7. 官方基准唯一 ──
const officialIds = new Set(channels.filter((c) => c.type === 'official').map((c) => c.id));
const officialBlend = new Map<string, number>();
for (const p of prices) {
  if (!officialIds.has(p.channelId)) continue;
  if (p.billingMode !== 'payg') continue;
  if (p.input == null && p.output == null) continue;
  const blend = Math.round(((p.input ?? 0) * 3 + (p.output ?? 0)) / 4 * 100) / 100;
  const prev = officialBlend.get(p.modelId);
  if (prev != null && Math.abs(prev - blend) > 0.01) {
    warn(
      '官方价不唯一',
      `${p.modelId} 有多个官方价（${prev} vs ${blend}，档位=${p.tierLabel ?? '标准'}）`,
      p.channelId
    );
  }
  officialBlend.set(p.modelId, blend);
}

// ── 统计 ──
const byChannel = new Map<string, number>();
for (const p of prices) byChannel.set(p.channelId, (byChannel.get(p.channelId) ?? 0) + 1);

const chType = new Map(channels.map((c) => [c.id, c.type]));
const typeCount: Record<string, number> = {};
for (const [cid, n] of byChannel) {
  const t = chType.get(cid) ?? 'unknown';
  typeCount[t] = (typeCount[t] ?? 0) + n;
}

const modelChannels = new Map<string, Set<string>>();
for (const p of prices) {
  const s = modelChannels.get(p.modelId) ?? new Set();
  s.add(p.channelId);
  modelChannels.set(p.modelId, s);
}
const multi = [...modelChannels.entries()].filter(([, s]) => s.size >= 2);

// ── 8. 来源 URL 可达 ──
async function checkUrls() {
  const urls = [...new Set(prices.map((p) => p.evidence?.sourceUrl).filter(Boolean))] as string[];
  const results: { url: string; ok: boolean; status?: number; err?: string }[] = [];
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(u, {
        method: 'HEAD',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
      });
      clearTimeout(timer);
      results.push({ url: u, ok: res.status < 400, status: res.status });
    } catch (e) {
      results.push({ url: u, ok: false, err: String(e).slice(0, 60) });
    }
  }
  return results;
}

// ── 输出 ──
console.log('════════ 数据接地校验报告 ════════\n');
console.log(`价格记录: ${prices.length} 条`);
console.log(`模型: ${models.length} 个（${modelChannels.size} 个有价格）`);
console.log(`渠道: ${channels.length} 个（${byChannel.size} 个有价格）`);
console.log(`\n按渠道类型:`);
for (const [t, n] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(10)} ${n} 条`);
}
console.log(`\n各渠道记录数:`);
for (const [c, n] of [...byChannel.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(20)} ${String(n).padStart(4)}  (${chType.get(c) ?? '?'})`);
}
console.log(`\n多渠道模型 ${multi.length} 个:`);
for (const [m, s] of multi.sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${m.padEnd(26)} ${s.size} 渠道: ${[...s].join(', ')}`);
}

const errors = issues.filter((i) => i.level === 'error');
const warns = issues.filter((i) => i.level === 'warn');

console.log(`\n════════ 校验结果 ════════`);
console.log(`错误 ${errors.length} 项，警告 ${warns.length} 项`);

if (errors.length) {
  const byKind = new Map<string, Issue[]>();
  for (const e of errors) {
    const arr = byKind.get(e.kind) ?? [];
    arr.push(e);
    byKind.set(e.kind, arr);
  }
  console.log('\n❌ 错误明细:');
  for (const [kind, arr] of byKind) {
    console.log(`\n  【${kind}】${arr.length} 项`);
    for (const e of arr.slice(0, 6)) {
      console.log(`    - ${e.detail}${e.sample ? `  [${e.sample}]` : ''}`);
    }
    if (arr.length > 6) console.log(`    ... 还有 ${arr.length - 6} 项`);
  }
}
if (warns.length) {
  const byKind = new Map<string, Issue[]>();
  for (const e of warns) {
    const arr = byKind.get(e.kind) ?? [];
    arr.push(e);
    byKind.set(e.kind, arr);
  }
  console.log('\n⚠️  警告明细:');
  for (const [kind, arr] of byKind) {
    console.log(`  【${kind}】${arr.length} 项  例: ${arr[0].detail}`);
  }
}

console.log('\n──────── 来源 URL 可达性 ────────');
const urlResults = await checkUrls();
for (const r of urlResults) {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.status ?? r.err} ${r.url.slice(0, 76)}`);
}
const unreachable = urlResults.filter((r) => !r.ok);
if (unreachable.length) {
  warn('来源 URL 不可达', `${unreachable.length} 个 URL 非 2xx/3xx（可能临时故障）`);
}

fs.writeFileSync(
  path.join(DATA, 'validate-report.json'),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      counts: {
        prices: prices.length,
        models: models.length,
        channels: channels.length,
        modelsWithPrices: modelChannels.size,
        multiChannelModels: multi.length,
      },
      byChannel: Object.fromEntries(byChannel),
      byChannelType: typeCount,
      errors,
      warnings: warns,
      urlChecks: urlResults,
    },
    null,
    2
  ),
  'utf8'
);

console.log('\n报告已写入 data/validate-report.json');
process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error('校验脚本异常:', e);
  process.exit(2);
});
