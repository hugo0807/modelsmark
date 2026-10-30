'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { fmtCny, fmtMoneyCny, fmtInt } from '../../lib/format';
import { estimateUsage, type ModelRow } from '../../lib/selectors';

/**
 * 成本计算器。
 *
 * 为什么必须能调配比和缓存命中率：
 * 只用「混合价 × 用量」会把长文生成（1:3）和批量摘要（10:1）算成同一个数，
 * 也会完全忽略缓存 —— 而缓存命中部分通常只有输入价的 1～3 折，
 * 对长对话与固定 system prompt 的场景是决定性的。
 */

const QTY_PRESETS = [
  { v: 100, label: '1 亿' },
  { v: 1_000, label: '10 亿' },
  { v: 5_000, label: '50 亿' },
  { v: 20_000, label: '200 亿' },
];

const RATIOS = [
  { share: 0.75, label: '3 : 1', desc: '对话 / RAG' },
  { share: 0.5, label: '1 : 1', desc: '混合负载' },
  { share: 0.25, label: '1 : 3', desc: '长文生成' },
  { share: 0.909, label: '10 : 1', desc: '批量摘要' },
];

const HITS = [0, 0.3, 0.6, 0.9];

const VISIBLE = 15;

export function CostCalculator({ rows }: { rows: ModelRow[] }) {
  const [qty, setQty] = useState(1_000);
  const [share, setShare] = useState(0.75);
  const [hit, setHit] = useState(0.3);
  const [all, setAll] = useState(false);

  const list = useMemo(
    () => estimateUsage(rows, { totalMillion: qty, inputShare: share, cacheHit: hit }),
    [rows, qty, share, hit]
  );

  const shown = all ? list : list.slice(0, VISIBLE);
  const cheapest = list[0];
  const dearest = list[list.length - 1];

  return (
    <>
      <div className="calc-panel">
        <div className="calc-row">
          <span className="calc-label">月用量</span>
          <input
            className="dt-search calc-num"
            type="number"
            min={0}
            step={100}
            value={qty}
            onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
            aria-label="月用量（百万 tokens）"
          />
          <span className="calc-unit">百万 tokens</span>
          {QTY_PRESETS.map((p) => (
            <button
              key={p.v}
              type="button"
              className={`dt-filter${qty === p.v ? ' on' : ''}`}
              onClick={() => setQty(p.v)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="calc-row">
          <span className="calc-label">输入 : 输出</span>
          {RATIOS.map((r) => (
            <button
              key={r.share}
              type="button"
              className={`dt-filter${share === r.share ? ' on' : ''}`}
              onClick={() => setShare(r.share)}
            >
              {r.label}
              <span className="calc-chip-sub">{r.desc}</span>
            </button>
          ))}
        </div>

        <div className="calc-row">
          <span className="calc-label">缓存命中率</span>
          <input
            className="calc-range"
            type="range"
            min={0}
            max={90}
            step={10}
            value={Math.round(hit * 100)}
            onChange={(e) => setHit(Number(e.target.value) / 100)}
            aria-label="缓存命中率"
          />
          <span className="calc-unit">{Math.round(hit * 100)}%</span>
          {HITS.map((h) => (
            <button
              key={h}
              type="button"
              className={`dt-filter${Math.abs(hit - h) < 1e-9 ? ' on' : ''}`}
              onClick={() => setHit(h)}
            >
              {Math.round(h * 100)}%
            </button>
          ))}
        </div>
      </div>

      {cheapest ? (
        <div className="calc-summary">
          这个用量下，最便宜的是 <Link href={`/models/${cheapest.id}`}>{cheapest.name}</Link>
          ，月成本 <b>{fmtMoneyCny(cheapest.monthly)}</b>；
          最贵的是 <Link href={`/models/${dearest.id}`}>{dearest.name}</Link>
          ，月成本 <b>{fmtMoneyCny(dearest.monthly)}</b>，相差{' '}
          <b>{dearest.monthly > 0 ? (dearest.monthly / cheapest.monthly).toFixed(1) : '—'} 倍</b>
          。价格取各模型全渠道最低标准档。
        </div>
      ) : (
        <div className="calc-summary">请先填入大于 0 的月用量。</div>
      )}

      <div className="dt-scroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 190 }}>模型</th>
              <th className="right">月成本</th>
              <th className="right">年成本</th>
              <th className="right hide-sm">等效单价</th>
              <th className="right hide-sm">其中缓存</th>
              <th className="right">能力指数</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/models/${e.id}`} className="dt-link">
                    {e.name}
                  </Link>
                  <span className="m-sub" style={{ marginLeft: 6, fontSize: 11 }}>
                    {e.vendor}
                  </span>
                </td>
                <td className="right num">
                  <b>{fmtMoneyCny(e.monthly)}</b>
                </td>
                <td className="right num">{fmtMoneyCny(e.yearly)}</td>
                <td className="right num hide-sm">{fmtCny(e.effective)}</td>
                <td className="right num hide-sm">
                  {fmtMoneyCny(e.parts.cache)}
                  {e.cacheAssumed ? <span className="calc-warn" title="该渠道未公布缓存价，按输入价保守计">*</span> : null}
                </td>
                <td className="right num">{e.index != null ? fmtInt(e.index) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {list.length > VISIBLE ? (
        <button type="button" className="dt-more" onClick={() => setAll((v) => !v)}>
          {all ? '只看最便宜的 15 个' : `显示全部 ${list.length} 个模型`}
        </button>
      ) : null}

      <div className="footnote">
        <p>
          <strong>怎么算的</strong>：月成本 = 输入用量 ×（1 − 命中率）× 输入价 ＋ 输入用量 ×
          命中率 × 缓存读价 ＋ 输出用量 × 输出价。等效单价 = 月成本 ÷ 月总用量。
        </p>
        <p>
          <strong>带 * 的行</strong>
          ：该模型的最低价渠道未公布缓存读价，缓存部分按输入价计，结果偏高而非偏低。
        </p>
        <p>
          <strong>不含什么</strong>
          ：套餐折扣、批量推理折扣、闲时折扣、税费与免费额度。要判断「买套餐是否更划算」请看套餐对比页。
        </p>
      </div>
    </>
  );
}
