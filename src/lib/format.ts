/**
 * 数字 / 日期 / 单位格式统一。
 *
 * 之前每个页面各写一份数字格式化（首页、模型页、套餐页三处重复），
 * 出现「同一数字在两页显示不同位数」的问题。全站统一从这里取。
 */

/** 缺失值统一显示为长破折号，不显示 0 也不显示 null */
export const NA = '—';

/** 价格：¥1.10（默认 2 位；小于 1 的价格保留 2 位已足够决策） */
export function fmtPrice(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return NA;
  return n.toFixed(digits);
}

/** 带货币符号：¥1.10 */
export function fmtCny(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return NA;
  return `¥${n.toFixed(digits)}`;
}

/** 整数：74 */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  return String(Math.round(n));
}

/** 倍数：2.4× */
export function fmtSpread(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  return `${n.toFixed(1)}×`;
}

/** 变化率：0.39 → +39%；-0.1 → -10% */
export function fmtSignedPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  const pct = n * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

/** 折扣：0.9 → 90% */
export function fmtDiscount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  const pct = n * 100;
  if (pct >= 99.5) return '>99%';
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

/** 性价比：¥/分，保留 3 位 */
export function fmtValue(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  return n.toFixed(3);
}

/** ISO 日期 → 2026-10-29（只取日期部分，不带时间与时区） */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : NA;
}

/** 月/年格式化：2026 年 10 月 */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return NA;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]} 年 ${Number(m[2])} 月` : NA;
}

/**
 * token 数量的中文可读形式。
 * 站内统一用「百万 tokens」计价，但用户习惯说「5000 万」，这里双向可读。
 */
export function fmtTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)} 亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(n % 10_000 === 0 ? 0 : 1)} 万`;
  return String(Math.round(n));
}

/** 金额千分位：12,345 */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  return Math.round(n).toLocaleString('zh-CN');
}

/**
 * 带货币符号的金额，超过 1 万折算成「¥1.2 万」。
 * 成本表的数字常常跨 4 个数量级，全用千分位反而扫不出大小关系。
 */
export function fmtMoneyCny(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return NA;
  const abs = Math.abs(n);
  if (abs >= 10_000) return `¥${(n / 10_000).toFixed(abs >= 100_000 ? 0 : 1)} 万`;
  return `¥${fmtMoney(n)}`;
}
