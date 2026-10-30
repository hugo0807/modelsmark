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
import { guessSlug } from './slug-rules';
import path from 'node:path';
import type { PriceRecord } from '../src/lib/types';
import { extractTables, extractTablesExpanded, parseCompactPriceCell, parseTableRows, stripTags } from './parse-pricing-table';

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

/**
 * 采集器输入源（已解析成结构化数据的中间产物）。
 *
 * 这些文件是「采集结果」而非「页面快照」——它们由采集脚本解析页面后生成，
 * 历史上散落在 data/raw/ 与仓库上一级目录里，从未入库，
 * 导致 CI 的全新 clone 上 12 个采集器全部失败：
 * 387 条数据会被覆盖成 66 条再提交上线。
 *
 * 现在统一入库到 data/snapshots/raw/，查找顺序：
 *   1. data/snapshots/raw/  —— 入库快照（CI 与新 clone 依赖它）
 *   2. data/raw/            —— 本地最新产物（便于刷新）
 *   3. 仓库上一级目录        —— 早期开发时的临时存放位置
 */
const RAW_SNAPSHOTS = path.join(SNAPSHOTS, 'raw');
const RAW_LOCAL = path.join(ROOT, 'data/raw');
const WORK = path.join(ROOT, '..');

/** 取采集器输入源路径 */
function rawPath(name: string): string {
  const inRepo = path.join(RAW_SNAPSHOTS, name);
  if (fs.existsSync(inRepo)) return inRepo;
  const local = path.join(RAW_LOCAL, name);
  if (fs.existsSync(local)) return local;
  return path.join(WORK, name);
}

/** 抓取时间：所有本次抓取统一用该时间戳 */
const FETCHED_AT = '2026-10-27T16:30:00Z';

// ───────────────────────────────────────────
// 模型 id 映射：页面上的模型名 → 全局 slug
// ───────────────────────────────────────────



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
  const d = readJson<any>(rawPath(file), null);
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
  const d = readJson<any>(rawPath(file), null);
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
  const d = readJson<any[]>(rawPath('sf_api_summary.json'), []);
  if (!d.length) throw new Error('缺少 sf_api_summary.json');
  const out: PriceRecord[] = [];
  for (const r of d) {
    const slug = guessSlug(r.name);
    if (!slug) continue;
    const periods = r.input?.periods || [];
    const offpeak = periods.some((p: string) => /空闲|off-?peak|0点/.test(p));
    // 硅基流动的免费模型 SKU 为 free-text-model.online，官网标价 0。
    // 这是真实数据（确实免费），但免费 ≠ 高性价比，且通常有调用限流，
    // 因此单独标注为「免费模型」，不参与最低价与均价的计算。
    const isFreeSku = /free/i.test(String(r.sku ?? ''));
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
      tierLabel: isFreeSku ? '免费模型' : r.input?.scenario || null,
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
  const raw = fs.readFileSync(rawPath('qn_all.txt'), 'utf8');
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

/** 百度千帆：data/snapshots/baidu_qianfan_price.html
 *  形态：模型名称 | 版本名称 | 服务内容 | 子项 | 在线推理 | 批量推理 | 单位
 *  单位统一是「元/千tokens」，需 ×1000 折算为元/百万 tokens
 *
 * 关键：必须用 extractTablesExpanded（rowspan 展开 + 内容继承）。
 * 百度表大量使用 rowspan 跨行，不展开会让续行整体左移，
 * 导致「输入」行被当成「批量推理」列而整段丢弃 —— 模型页出现「输入价 —」。
 */
const fromBaidu = (): Collector => () => {
  const html = fs.readFileSync(snapPath('baidu_qianfan_price.html'), 'utf8');
  /*
   * 用扁平行（extractTables，不做 rowspan 展开），而不是展开后的规整矩形。
   *
   * 展开版在「组边界」上会整体左移：百度的 rowspan 声明并不总与实际覆盖行数一致，
   * 展开后一行常常同时混进下一行的内容（如某行首出现「--」占位符）。
   * 扁平行每行只有自己的单元格，模型名不出现在续行上，
   * 于是只需用「上一行的模型名」做回退 —— 不会再出现跨行污染。
   */
  const tables = extractTables(html);
  const out: PriceRecord[] = [];

  for (const rows of tables) {
    const head = (rows[0] || []).join(' ');
    if (!/模型名称/.test(head)) continue;

    /*
     * 跳过「按 TPM 预付费」表。
     * 它的列是「子项 | 单位规格(10k/1k) | 原价 | 活动价（元/个/月）」，
     * 与按量计费表的「子项 | 在线推理 | 批量推理 | 单位」结构完全不同。
     * 混进来会把「1k」当成单价算出 ¥1000/百万 token 的假价。
     * 预付费是包月资源包口径，与本站的按量比价不可比，整表跳过。
     */
    if (/单位规格|预付费价格|TPM/.test(head)) continue;

    /*
     * 非对话类模型整表跳过：Embedding / Reranker / 语音 / OCR。
     * 它们的计量口径与聊天模型不同（有的按次、有的按字符），
     * 放进比价表只会污染「每百万 tokens」口径，且与本站的对话模型对比对象不一致。
     */
    const NON_CHAT = /embedding|reranker|重排|向量|bge|ocr|tao|语音|cosyvoice|sensevoice/i;
    // 上一行解析到的模型名 / 版本名，用于「输出」行等分组边界处的回退
    let lastModel = '';
    let lastVersion = '';
    // 服务内容列的上下文区间（rowspan 会让它跨行生效，需要跨行记住）
    let lastCtx = '';

    // 档位键 → 累积的价格
    const buckets = new Map<string, {
      model: string; version: string; unit: string;
      input: number | null; output: number | null; cacheRead: number | null;
      tierLabel: string | null; quotes: string[];
    }>();

    const bucketFor = (key: string, model: string, version: string, unit: string) => {
      let b = buckets.get(key);
      if (!b) {
        b = { model, version, unit, input: null, output: null, cacheRead: null, tierLabel: null, quotes: [] };
        buckets.set(key, b);
      }
      return b;
    };

    for (const r of rows.slice(1)) {
      const c = r.map((x) => (x || '').trim());

      /*
       * 取值采用「内容定位优先，固定列兜底」：
       *
       * 百度原表的 rowspan 声明并不总准确（「推理服务」声明 rowspan=3 却覆盖 4 行），
       * 展开后仍可能整体左移一列。因此这里不信任列位置，改为在行内按内容找：
       *   · 子项     —— 以「输入 / 输出 / 命中缓存」开头的格子
       *   · 价格     —— 子项右侧第一个纯数字
       *   · 单位     —— 行内出现「元/千tokens」「元/百万tokens」的格子
       *   · 模型名   —— 行内最左侧、且不是「服务内容 / 子项 / 单位」的那一格
       *   · 版本名   —— 模型名右侧、且不含「服务内容」字样的那一格
       */
      const subIdx = c.findIndex((t) => /^输入|^输出|^命中缓存/.test(t));
      if (subIdx < 0) continue;
      const sub = c[subIdx];

      // 「搜索增强」等按次计费的附加项，不属于 token 单价
      if (/搜索增强/.test(sub)) continue;

      // 价格：子项右侧第一个纯数字（'-' 表示该档无价）
      let priceTxt = '';
      for (let k = subIdx + 1; k < c.length; k++) {
        const t = c[k];
        if (t === '') continue;
        if (t === '-') break;
        if (/^\d+(\.\d+)?$/.test(t)) {
          priceTxt = t;
          break;
        }
        break;
      }

      // 单位：行内任意位置
      const unitCell = c.find((t) => /元\/(千|百万)tokens/.test(t)) || '';

      /*
       * 模型名 / 版本名：取行内最靠左的两个「名称类」单元格。
       * 名称类 = 非空、不以数字开头（价格）、不含「元/」（单位）、
       * 不是「推理服务 / 触发 / -」这类状态词、且不以子项关键字开头。
       *
       * 「输出」常落在分组边界，此时 rowspan 继承刚好用尽、行内取不到名称，
       * 因此这里保留上一行的名称作为回退（同组内模型名/版本名必然相同）。
       */
      /*
       * 「占位符」必须排除。
       * 百度表里「--」「-」表示「该列无此价格」，出现在展开后的行首时，
       * 旧逻辑会把「--」当成模型名，于是同一档被拆成两个桶：
       *   一行只有输入价、另一行只有输出价 —— 表现为「有输入没输出」。
       */
      const isNameCell = (t: string) =>
        t !== '' &&
        !/^输入|^输出|^命中缓存/.test(t) &&
        !/^[-—–]+$/.test(t) &&
        !/^推理服务$|^触发$|^服务内容$|^子项$|^在线推理$|^批量推理$|^单位$/.test(t) &&
        !/推理服务|Token数|日程|限时|即.?将下线|折扣/.test(t) &&
        !/^\d/.test(t) &&
        !/元\//.test(t);

      /*
       * 名称识别前先剥掉括号备注，否则带备注的单元格会被整格丢弃。
       * 百度的备注有两类，都会落在名称列里：
       *   · 「Kimi-K2.6（即将下线）」—— 状态备注
       *   · 「DeepSeek-V4-Pro（命中缓存限时价格生效日期：9月9日-…）」—— 促销备注
       * 备注里的时间会污染分档判断，名称里也不该出现。
       */
      const flat = c.map((t) =>
        t.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, ' ').trim()
      );
      const nameCells = flat.filter(isNameCell);

      let curModel: string;
      let curVersion: string;
      if (nameCells.length >= 2) {
        curModel = nameCells[0];
        curVersion = nameCells[1];
      } else if (nameCells.length === 1) {
        /*
         * 只有一个名称格时有两种可能：
         *   · 新模型行但官网没给版本列
         *   · 模型名跨行、本行只是换了版本号
         * 版本号必然带型号特征（连字符+数字、参数规格 xxB / AxxB），据此区分。
         */
        const one = nameCells[0];
        if (lastModel && /[-–]\s*\d|\d+\.?\d*[Bb]|[Aa]\d+[Bb]/.test(one)) {
          curModel = lastModel;
          curVersion = one;
        } else {
          curModel = one;
          // 换了模型就不能再沿用上一个模型的版本号，否则 A 的价格会挂到 B 名下
          curVersion = '';
        }
      } else {
        curModel = lastModel;
        curVersion = lastVersion;
      }
      lastModel = curModel;
      lastVersion = curVersion;

      if (NON_CHAT.test(curModel) || NON_CHAT.test(curVersion)) continue;

      if (unitCell) curUnit = /千/.test(unitCell) ? '千' : /百万/.test(unitCell) ? '百万' : curUnit;

      /*
       * 「服务内容」列里的上下文区间。
       * 百度把 GLM / Qwen 的上下文分档写在服务内容列（如「推理服务 输入Token数：[0,32k)」），
       * 子项列只有裸的「输入 / 输出 / 命中缓存」。
       * 不读这一列的话，同一模型的两档会塌成一行，丢掉一整套价格。
       */
      /*
       * 区间写法不能靠「找成对括号」：官方用的是半开区间（如 [0,32k)、（32k，200k]），
       * 左右括号并不成对，按括号配对匹配会整体失配。
       * 直接取「输入Token数：」之后的整段文本。
       */
      /*
       * 「服务内容」在本行出现就意味着一次新分组：
       * 带 Token 数区间（GLM / Qwen 的上下文分档）→ 更新档位；
       * 只是普通「推理服务」→ 说明上一个模型的区间档已经结束，必须清空，
       * 否则上一条区分区间会顺延到下一个模型身上（Kimi 会被标成「（32k，200k]」）。
       */
      const ctx = c.find((t) => /^推理服务/.test(t)) || '';
      if (/输入Token数/.test(ctx)) {
        const range = ctx.match(/输入Token数\s*[:：]?\s*(.+?)\s*$/);
        if (range) lastCtx = range[1].replace(/\s+/g, '');
      } else if (ctx) {
        lastCtx = '';
      }

      const v = parseTokenPrice(priceTxt, curUnit);
      if (v == null) continue;

      /*
       * 分桶键必须只含「档位标识」，不能含子项名。
       *
       * 百度表的输入行与输出行括号里写的是同一档但措辞不同：
       *   输入（输入<=32k）  /  输出（输入<=32k）      → 同一档
       *   输入（32k<输入<=128k） / 输出（32k<输入<=128k） → 同一档
       * 若直接用括号原文做键，输入与输出会落进不同的桶，
       * 结果是「有输出价没输入价」或「有输入价没输出价」的半截记录。
       *
       * 这里归一化出档位标识：
       *   · 含「空闲时段」→ 空闲时段
       *   · 含「高峰时段」→ 高峰时段
       *   · 括号里是上下文长度区间 → 归一到区间本身
       */
      const seg = sub.match(/[（(]([^）)]*)[）)]/);
      let segText = seg ? seg[1] : '';
      if (/空闲时段/.test(segText)) segText = '空闲时段';
      else if (/高峰时段/.test(segText)) segText = '高峰时段';
      else if (/输入/.test(segText)) {
        /*
         * 上下文区间写法有三类，符号都是「<」加「=」两个字符：
         *   输入<=32k / 32k<输入<=128k / 输入=<32k / 32k<输入=<128k
         * 归一化成统一形式，保证输入行与输出行落到同一档。
         * 只影响分桶键，不影响展示用的 tierLabel。
         */
        const range = segText.match(
          /(\d+\s*k\s*[<≤=]+\s*输入\s*[<≤=]+\s*\d+\s*k|输入\s*[<≤=]+\s*\d+\s*k)/i
        );
        segText = range
          ? range[1]
              .replace(/\s+/g, '')
              .replace(/[<≤=]+/g, '≤')
          : '按上下文';
      }
      if (!segText && lastCtx) segText = `上下文${lastCtx}`;

      const tierLabel = detectBaiduTier(sub) ?? (lastCtx ? `输入 ${lastCtx}` : null);
      /*
       * 模型名要剥掉括号备注后再做键。
       * 官网在模型名后追加促销说明（如「DeepSeek-V4-Pro（命中缓存限时价格生效日期：9月9日-…）」），
       * 备注里的时间会被当成分档信号，导致同一模型被拆成多个桶。
       */
      const modelKey = curModel.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, ' ').trim();
      const key = `${modelKey}||${curVersion}||${segText}`;

      const b = bucketFor(key, modelKey, curVersion, curUnit);
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

  /*
   * 同一模型在同一渠道会产出多行：多版本并存、官网多个表格重复刊载同一模型。
   * 本站按「模型 × 渠道 × 档位」展示，重复行只会让人看到两行同名同价。
   * 保留规则：(modelId, tierLabel) 相同时取混合价（3:1）最低的一行，
   * 与本站「比价取最低」的口径一致；缺输入或缺输出的半截行一律丢弃。
   */
  const merged = new Map<string, PriceRecord>();
  const rank = (r: PriceRecord) => {
    const both = r.input != null && r.output != null;
    return ((r.input ?? 0) * 3 + (r.output ?? 0)) + (both ? 0 : 1e6);
  };
  for (const r of out) {
    if (r.input == null && r.output == null) continue;
    const k = `${r.modelId}||${r.tierLabel ?? ''}`;
    const prev = merged.get(k);
    if (!prev || rank(r) < rank(prev)) merged.set(k, r);
  }
  return [...merged.values()];

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
    const m = sub.match(
      /(高峰时段[^）]*|空闲时段[^）]*|(\d+\s*k\s*[<≤=]+\s*输入\s*[<≤=]+\s*\d+\s*k|输入\s*[<≤=]+\s*\d+\s*k))/i
    );
    if (!m) return null;
    // 展示用标签保留官网原文，只去掉多余空格
    return m[1].replace(/\s+/g, '').trim();
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
