'use client';

import { useMemo, useState } from 'react';

import type { BenchmarkCategory, Origin } from '../../lib/types';
import { BenchCard, type BenchItem, type BenchRow } from './BenchCard';

/**
 * 能力榜的筛选与渲染。
 *
 * 之前 /benchmarks 的「筛选」是一排静态 span —— 点了没反应，
 * 属于典型的假交互：看起来能筛，实际只是标签。
 * 现在分类与归属地都是真实筛选，且筛的是行数据本身：
 * 选「只看国内」后，榜里的名次与柱长都按国内模型重算。
 *
 * 样式复用 DataTable 的 dt-* 一套，全站工具栏只有一种长相。
 */

export interface CategoryChip {
  key: BenchmarkCategory | 'all';
  label: string;
  count: number;
}

const ORIGINS: { key: Origin | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'domestic', label: '国内' },
  { key: 'overseas', label: '海外' },
];

export function BenchmarkBrowser({
  items,
  categories,
}: {
  items: BenchItem[];
  categories: CategoryChip[];
}) {
  const [cat, setCat] = useState<BenchmarkCategory | 'all'>('all');
  const [origin, setOrigin] = useState<Origin | 'all'>('all');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((b) => (cat === 'all' ? true : b.category === cat))
      .filter((b) =>
        s ? b.name.toLowerCase().includes(s) || b.summary.toLowerCase().includes(s) : true
      )
      .map((b) => ({
        ...b,
        rows: b.rows
          .filter((r) => (origin === 'all' ? true : r.origin === origin))
          .sort((x, y) => y.value - x.value) as BenchRow[],
      }));
  }, [items, cat, origin, q]);

  const totalRows = shown.reduce((n, b) => n + b.rows.length, 0);

  return (
    <div className="dt">
      <div className="dt-toolbar">
        <input
          className="dt-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜基准名或「测什么」"
          aria-label="搜索基准"
        />
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`dt-filter${cat === c.key ? ' on' : ''}`}
            onClick={() => setCat(c.key)}
          >
            {c.label} {c.count}
          </button>
        ))}
        <span className="dt-count">{totalRows} 条分数</span>
      </div>

      <div className="dt-toolbar">
        {ORIGINS.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`dt-filter${origin === o.key ? ' on' : ''}`}
            onClick={() => setOrigin(o.key)}
          >
            {o.label}
          </button>
        ))}
        <span className="dt-count">
          {origin === 'all'
            ? `${shown.length} 项基准`
            : `只看${origin === 'domestic' ? '国内' : '海外'}模型，名次按筛选结果重算`}
          <span style={{ marginLeft: 12 }}>
            <span className="dot dot-domestic" /> 国内
            <span className="dot dot-overseas" style={{ marginLeft: 8 }} /> 海外
          </span>
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="card card-pad" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          没有匹配的基准。
        </div>
      ) : (
        <div className="bench-grid">
          {shown.map((b) => (
            <BenchCard key={b.id} item={b} />
          ))}
        </div>
      )}
    </div>
  );
}
