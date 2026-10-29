'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { fmtCny, fmtInt, fmtPrice, fmtSpread, fmtValue, NA } from '../../lib/format';

/**
 * 可搜 / 可筛 / 可排序 / 默认折叠的数据表。
 *
 * 为什么必须做：首页主表 66 行、套餐页上百行，纯静态渲染时用户只能滚。
 * 表格是用来查的，不是用来读的 —— 超过 20 行就必须能搜能筛能排。
 *
 * Server / Client 边界（静态导出 output: 'export' 的硬约束）：
 * 服务端把行数据算好传进来，且必须是**可序列化**的扁平对象——
 * 所以列定义里不能有 render 函数，筛选也不能传 predicate，
 * 一律用「列类型 + tag」这种纯数据描述。
 */

export type CellType = 'text' | 'price' | 'cny' | 'int' | 'spread' | 'value' | 'pct';

export interface ColumnDef {
  key: string;
  label: string;
  type?: CellType;
  align?: 'left' | 'right';
  /** 默认不可排序，显式打开 */
  sortable?: boolean;
  /** 小屏隐藏（移动端取舍，详情页仍完整） */
  hideSm?: boolean;
  /** 该列的强调样式（如混合价加粗） */
  strong?: boolean;
}

export interface FilterDef {
  key: string;
  label: string;
}

export type CellValue = string | number | null | undefined;

export interface TableRow {
  id: string;
  name: string;
  vendor?: string;
  tags?: string[];
  [key: string]: CellValue | string[] | undefined;
}

export interface DataTableProps {
  rows: TableRow[];
  columns: ColumnDef[];
  filters?: FilterDef[];
  /** 默认显示行数，超出部分折叠（0 = 不折叠） */
  limit?: number;
  searchPlaceholder?: string;
  /** 行跳转模板，把 {id} 替换成行 id；不传则不生成链接 */
  linkPattern?: string;
  emptyText?: string;
}

function fmtCell(v: CellValue | string[] | undefined, type: CellType = 'text'): string {
  if (v == null || Array.isArray(v)) return NA;
  if (type === 'text') return String(v);
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  switch (type) {
    case 'price':
      return fmtPrice(n);
    case 'cny':
      return fmtCny(n);
    case 'int':
      return fmtInt(n);
    case 'spread':
      return fmtSpread(n);
    case 'value':
      return fmtValue(n);
    case 'pct':
      return `${(n * 100).toFixed(0)}%`;
    default:
      return String(v);
  }
}

function sortValue(v: CellValue | string[] | undefined): number | string | null {
  if (v == null || Array.isArray(v)) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n;
}

export default function DataTable({
  rows,
  columns,
  filters,
  limit = 0,
  searchPlaceholder = '搜索',
  linkPattern,
  emptyText = '没有匹配的记录',
}: DataTableProps) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState('all');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (active !== 'all' && !(r.tags ?? []).includes(active)) return false;
      if (!kw) return true;
      return (
        r.name.toLowerCase().includes(kw) ||
        (r.vendor ?? '').toLowerCase().includes(kw) ||
        r.id.toLowerCase().includes(kw)
      );
    });
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const va = sortValue(a[key]);
        const vb = sortValue(b[key]);
        // 空值永远排在最后，避免「—」因为被当成 0 而霸占榜首
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'zh-CN') * dir;
      });
    }
    return out;
  }, [rows, q, active, sort]);

  const collapsed = limit > 0 && !expanded;
  const visible = collapsed ? shown.slice(0, limit) : shown;

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
  };

  return (
    <div className="dt">
      <div className="dt-toolbar">
        <input
          className="dt-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {filters?.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`dt-filter${active === f.key ? ' on' : ''}`}
            onClick={() => setActive(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="dt-count">
          {shown.length === rows.length
            ? `${rows.length} 条`
            : `${shown.length} / ${rows.length} 条`}
        </span>
      </div>

      <div className="dt-scroll">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={[
                    c.align === 'right' ? 'right' : '',
                    c.hideSm ? 'hide-sm' : '',
                    c.sortable ? 'sortable' : '',
                    sort?.key === c.key ? 'sorted' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.label}
                  {c.sortable && (
                    <span className="dt-arrow">
                      {sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => {
                  const raw = r[c.key];
                  const text = fmtCell(raw, c.type);
                  return (
                    <td
                      key={c.key}
                      className={[
                        c.align === 'right' ? 'right' : '',
                        c.hideSm ? 'hide-sm' : '',
                        text === NA ? 'm-sub' : '',
                        c.type && text !== NA ? 'num' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {c.key === 'name' && linkPattern ? (
                        <Link href={linkPattern.replace('{id}', r.id)} className="dt-link">
                          {text}
                        </Link>
                      ) : c.strong ? (
                        <b>{text}</b>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="dt-empty">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {limit > 0 && shown.length > limit && (
        <button type="button" className="dt-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : `展开全部 ${shown.length} 条`}
        </button>
      )}
    </div>
  );
}
