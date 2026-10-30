/**
 * 通用价格表解析器 —— 从已抓取的官方页面 HTML 中提取「模型 → 输入/输出/缓存」价格。
 *
 * 铁律：
 * 1. 只解析真实 HTML，不生成任何推测值
 * 2. 每条记录必须带 quote（页面原文片段）与 sourceUrl，供接地校验
 * 3. 解析不到就报错，不返回空数组冒充成功
 *
 * 支持三类页面结构：
 *   A. 语义化 <table>（百度千帆、华为云文档）
 *   B. div 网格（腾讯云 TokenHub 产品页 .model-row）
 *   C. 内嵌 JSON state（window.__TRI_PAGE_STATE__ 等）
 */
import fs from 'node:fs';
import path from 'node:path';

/** 解析出的原始价格条目 */
export interface ParsedPrice {
  /** 页面上的模型名原文 */
  rawName: string;
  /** 归一化后的模型 id（由调用方映射） */
  modelId?: string;
  /** 输入价（每百万 token） */
  input: number | null;
  /** 输出价 */
  output: number | null;
  /** 缓存命中价 */
  cacheRead: number | null;
  /** 档位标签，如「高峰」「输入>512k」 */
  tierLabel: string | null;
  /** 原文片段 */
  quote: string;
}

/**
 * 从一段文字里抠出所有「数字 + 单位」的价格，返回 {value, unit} 列表
 *
 * 关键：不能把「输入：0.5元输出：2元」里的 0.5 和 2 都当成普通数字提取，
 * 必须先按标签切分（输入/输出/缓存/命中），否则会串位。
 */
export function extractPrices(text: string): { value: number; unit: string; raw: string }[] {
  const out: { value: number; unit: string; raw: string }[] = [];
  // 形如 6 元/百万tokens  /  0.004 元/千tokens  /  $1.2 /M tokens
  const re =
    /([¥$￥]?)\s*(\d+(?:\.\d+)?)\s*(元|¥|\$)?\s*(\/\s*(?:百万|千|M|K)\s*(?:tokens?)?|元\s*\/\s*(?:百万|千)tokens?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    const unit = (m[4] || '').replace(/\s+/g, '').toLowerCase();
    out.push({ value, unit, raw: m[0].trim() });
  }
  return out;
}

/**
 * 解析「单格里挤着多个价格」的形态。
 * 腾讯云刊例价表形如：输入：0.5元 输出：2元
 *
 * @returns { input, output, cacheRead } —— 单位已归一到每百万 token
 */
export function parseCompactPriceCell(
  cell: string,
  defaultScale = 1
): { input: number | null; output: number | null; cacheRead: number | null } {
  const res: { input: number | null; output: number | null; cacheRead: number | null } = {
    input: null,
    output: null,
    cacheRead: null,
  };
  if (!cell) return res;

  // 以标签为分隔点切段：输入 / 输出 / 缓存命中 / 命中缓存 / 缓存
  const labelRe = /(缓存命中|命中缓存|显式缓存命中|缓存|输出|输入)/g;
  const marks: { label: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(cell)) !== null) {
    marks.push({ label: m[1], idx: m.index });
  }
  if (!marks.length) return res;

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx + marks[i].label.length;
    const end = i + 1 < marks.length ? marks[i + 1].idx : cell.length;
    const seg = cell.slice(start, end);
    const ps = extractPrices(seg);
    if (!ps.length) continue;
    // 该段里取第一个价格；若该段又含「元」等单位的数字，取带单位的那个
    const withUnit = ps.find((p) => p.unit);
    const v = toPerMillion((withUnit ?? ps[0]).value, (withUnit ?? ps[0]).unit, defaultScale);
    if (v == null) continue;
    const label = marks[i].label;
    if (/缓存/.test(label)) res.cacheRead = v;
    else if (/输出/.test(label)) res.output = v;
    else if (/输入/.test(label)) res.input = v;
  }
  return res;
}

/**
 * 归一化单位 → 每百万 token 的价格
 * - 千 tokens → ×1000
 * - M / 百万 → ×1
 * - K → ×1000
 * - 无单位：按传入 defaultScale 处理（默认 1，即已是每百万）
 */
export function toPerMillion(
  value: number,
  unit: string,
  defaultScale = 1
): number | null {
  if (unit.includes('千')) return round(value * 1000);
  if (unit.includes('百万') || unit.includes('/m')) return round(value);
  if (unit.includes('k')) return round(value * 1000);
  if (unit === '') return round(value * defaultScale);
  return null;
}

export function round(n: number, digits = 6): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * 清洗 HTML 标签与多余空白
 *
 * 注意：标签正则必须要求 '<' 后面紧跟字母或 '/'，
 * 否则正文里的字面 '<'（如百度千帆的「输入（输入=<32k）」）会被当成标签起始，
 * 把到下一个 '>' 为止的内容整段吞掉 —— 结果是「输入」子项被截断成「输入（输入=」。
 */
export function stripTags(html: string): string {
  return (
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * 解析语义化 <table> 表格。
 * 自动识别「模型名列」和「价格列」，按行方向或列方向两种布局都试。
 *
 * @param rows 已按行切分、每行是单元格文本数组
 */
export function parseTableRows(
  rows: string[][],
  opts: { modelCol?: number; priceCols?: number[]; headerHint?: RegExp } = {}
): ParsedPrice[] {
  const out: ParsedPrice[] = [];
  if (!rows.length) return out;

  const header = rows[0];
  const body = rows.slice(1);

  // ── 情况 1：价格横向排布（列方向）
  //   表头形如：模型 | 输入 | 输出 | 缓存命中
  if (opts.priceCols?.length) {
    for (const r of body) {
      const name = (r[opts.modelCol ?? 0] || '').trim();
      if (!name || name.length > 80) continue;
      const quote = r.join(' | ');
      const rec: ParsedPrice = {
        rawName: name,
        input: null,
        output: null,
        cacheRead: null,
        tierLabel: null,
        quote,
      };
      opts.priceCols.forEach((c, i) => {
        const cell = r[c];
        if (cell == null) return;
        const ps = extractPrices(cell);
        const v = ps.length ? toPerMillion(ps[0].value, ps[0].unit) : null;
        if (v == null) return;
        if (i === 0) rec.input = v;
        else if (i === 1) rec.output = v;
        else if (i === 2) rec.cacheRead = v;
      });
      if (rec.input != null || rec.output != null) out.push(rec);
    }
    return out;
  }

  // ── 情况 2：价格纵向排布（行方向）—— 百度千帆的形态
  //   行1: 模型名 | 子项 | 值 | 单位
  //   行2: (同上模型) | 输出 | 值 | 单位
  //   靠「子项」关键字判断输入/输出/缓存
  let cur: ParsedPrice | null = null;
  let curModel = '';
  const flush = () => {
    if (cur && (cur.input != null || cur.output != null || cur.cacheRead != null)) {
      out.push(cur);
    }
    cur = null;
  };
  for (const r of body) {
    const c = r.map((x) => (x || '').trim());
    const modelCell = c[0] || '';
    const sub = c.find((x) => /输入|输出|缓存|命中|推理|触发/.test(x)) || '';
    const nums = c
      .map((x) => extractPrices(x))
      .flat()
      .filter((p) => p.value > 0);

    // 有明确的子项关键字 + 数字 → 价格行
    if (sub && nums.length) {
      const p = nums[0];
      const v = toPerMillion(p.value, p.unit);
      if (v == null) continue;
      if (/缓存|命中/.test(sub)) {
        if (!cur) { cur = blank(curModel); }
        cur.cacheRead = v;
      } else if (/输出/.test(sub)) {
        if (!cur) { cur = blank(curModel); }
        cur.output = v;
      } else if (/输入/.test(sub)) {
        if (!cur) { cur = blank(curModel); }
        cur.input = v;
      } else if (/触发/.test(sub)) {
        // 搜索增强按次计费，单价不是 token 价，忽略
        continue;
      } else {
        continue;
      }
      if (cur) {
        cur.quote = c.join(' | ');
        cur.tierLabel = detectTier(sub);
      }
      continue;
    }

    // 模型名行（无价格）
    if (modelCell && modelCell.length < 80 && !nums.length) {
      flush();
      curModel = modelCell;
      continue;
    }
    // 模型名 + 同一行有价格（横向简表）
    if (modelCell && nums.length) {
      flush();
      curModel = modelCell;
      const rec = blank(modelCell);
      rec.quote = c.join(' | ');
      const ps = nums;
      rec.input = toPerMillion(ps[0].value, ps[0].unit);
      if (ps[1]) rec.output = toPerMillion(ps[1].value, ps[1].unit);
      if (ps[2]) rec.cacheRead = toPerMillion(ps[2].value, ps[2].unit);
      out.push(rec);
    }
  }
  flush();
  return out;

  function blank(name: string): ParsedPrice {
    return { rawName: name, input: null, output: null, cacheRead: null, tierLabel: null, quote: '' };
  }
}

/** 从子项描述里识别档位标签 */
export function detectTier(text: string): string | null {
  const m = text.match(/(高峰|空闲|峰谷|批量|输入\s*[<>=]+\s*\d+k?|输入\s*>\s*\d+k?|\(\d+,\s*\d+k\]|长上下文)/i);
  return m ? m[0].replace(/\s+/g, '') : null;
}

/** 从 HTML 中切出所有 <table> 并解析成行数组 */
export function extractTables(html: string): string[][][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  return tables.map((t) => {
    const trs = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    return trs.map((tr) => {
      const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      return tds.map((td) => stripTags(td));
    });
  });
}

/**
 * 同 extractTables，但会把 rowspan / colspan 展开成规整矩形，
 * 并把跨行单元格的内容「继承」到它覆盖的每一行。
 *
 * 为什么需要：百度千帆的计费表用 rowspan 做「模型名 / 版本名 / 服务内容」跨行：
 *   <td rowspan="12">ERNIE 4.5 Turbo</td>
 *   <td rowspan="4">ERNIE-4.5-Turbo-128K-Preview</td>
 *   <td rowspan="3">推理服务</td>
 *   <td>输入</td> <td>0.0008</td> ...
 * 续行只剩 3 格（子项 | 在线推理 | 批量推理）。
 * 若不展开，每行都会「列左移」——本该是「输入 | 0.0008 | 0.00032 | 元/千tokens」
 * 的四格会被读成 c[0]=子项、c[1]=在线推理、c[2]=批量推理、c[3]=单位，
 * 于是输入价被整段丢弃（模型详情页出现「输入价 —」）。
 *
 * 继承还有一个好处：模型名 / 版本名 / 单位会出现在每一个续行上，
 * 解析器不必再维护「当前模型是哪个」的状态。
 *
 * 已知边界：百度原表里部分 rowspan 声明值比实际覆盖行数少 1
 * （如「推理服务」声明 rowspan=3 却覆盖 4 行）。
 * 浏览器渲染时会容错补齐，我们把短行按「后续同组行」补空格即可。
 */
export function extractTablesExpanded(html: string): string[][][] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  return tables.map((t) => {
    const trs = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];

    /*
     * active[col] = 该列被上方单元格跨行占据 { text, remaining }
     * remaining = 还需被「后续多少行」继承（不含放置它的那一行）
     *
     * 关键：继承与释放在不同阶段完成。
     *   · 本行开始时，remaining > 0 的列 → 继承内容，且本行算作「被占用」
     *     （放置本行自己的单元格时必须跳过这些列）
     *   · 本行放置完成后，才把 remaining 减 1；减到 0 时释放列
     *
     * 若在继承的同时就释放列，跨行的最后一行的内容会抢占该列，
     * 导致整行左移一列（「输出」子项被当成「服务内容」）。
     */
    const active: Array<{ text: string; remaining: number } | null> = [];
    const rows: string[][] = [];

    for (const tr of trs) {
      const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      const row: string[] = [];
      let col = 0;

      // ① 继承：本行被上方 rowspan 覆盖的列
      const inherited: boolean[] = [];
      for (let c = 0; c < active.length; c++) {
        const a = active[c];
        if (a && a.remaining > 0) {
          row[c] = a.text;
          inherited[c] = true;
        }
      }

      // ② 按 HTML 规则放置本行的单元格（跳过本行被 rowspan 覆盖的列）
      for (const td of tds) {
        while (col < active.length && active[col] && active[col].remaining > 0) col += 1;

        const rowspan = Number(td.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] || 1);
        const colspan = Number(td.match(/colspan\s*=\s*"?(\d+)/i)?.[1] || 1);
        const text = stripTags(td);

        for (let k = 0; k < colspan; k++) {
          const c = col + k;
          row[c] = text;
          active[c] = rowspan > 1 ? { text, remaining: rowspan - 1 } : null;
        }
        col += colspan;
      }

      // ③ 本行处理完，跨行单元格的剩余覆盖次数减一；归零则释放该列
      for (let c = 0; c < active.length; c++) {
        const a = active[c];
        if (a && a.remaining > 0) {
          a.remaining -= 1;
          if (a.remaining === 0) active[c] = null;
        }
      }

      rows.push(row);
    }

    // ④ 补齐短行：原表 rowspan 声明不准时会有行比表头短
    const width = Math.max(...rows.map((r) => r.length));
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].length >= width) continue;
      const missing = width - rows[i].length;
      for (let j = i + 1; j < rows.length && j < i + 8; j++) {
        if (rows[j].length < width) continue;
        rows[i] = rows[i].concat(rows[j].slice(width - missing, width));
        break;
      }
      if (rows[i].length < width) rows[i] = rows[i].concat(new Array(width - rows[i].length).fill(''));
    }

    return rows;
  });
}

/**
 * 解析腾讯云 TokenHub 风格：div 网格，每行一个 .model-row
 */
export function parseDivRows(html: string, rowSelector = 'model-row'): ParsedPrice[] {
  const rows = html.match(new RegExp(`class="[^"]*${rowSelector}[^"]*"[\\s\\S]*?(?=<div class="[^"]*${rowSelector}|$)`, 'g')) || [];
  const out: ParsedPrice[] = [];
  for (const r of rows) {
    const text = stripTags(r);
    const ps = extractPrices(text);
    if (ps.length < 2) continue;
    // 第一个非价格词是模型名
    const nameMatch = r.match(
      new RegExp(`class="[^"]*${rowSelector}[^"]*"[\\s\\S]*?<div[^>]*class="[^"]*model-name[^"]*"[^>]*>([\\s\\S]*?)</div>`)
    );
    const rawName = nameMatch ? stripTags(nameMatch[1]) : text.split(/\s{2,}/)[0] || '';
    const rec: ParsedPrice = {
      rawName,
      input: null,
      output: null,
      cacheRead: null,
      tierLabel: null,
      quote: text.slice(0, 300),
    };
    const vals = ps.map((p) => toPerMillion(p.value, p.unit)).filter((v): v is number => v != null);
    rec.input = vals[0] ?? null;
    rec.output = vals[1] ?? null;
    rec.cacheRead = vals[2] ?? null;
    if (rec.input != null) out.push(rec);
  }
  return out;
}

/** 读取本地抓取文件 */
export function readProbeFile(name: string, base = path.join(process.cwd(), '.probe')): string {
  const f = path.join(base, name);
  if (!fs.existsSync(f)) throw new Error(`抓取文件不存在: ${f}`);
  return fs.readFileSync(f, 'utf8');
}
