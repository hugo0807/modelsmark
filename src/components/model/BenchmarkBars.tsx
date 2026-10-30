'use client';

import Link from 'next/link';
import { useState } from 'react';

import { NA } from '../../lib/format';

/**
 * 四项关键基准的横向柱图。
 *
 * 为什么改成柱图：原来的基准表一行六列，用户读到的是「86.6 / 百分比 / ↓42%」三个互不相干的数字，
 * 还得自己在脑子里换算「86.6% 算高还是低」。
 * 柱图把「水平」直接画出来，剩下的问题交给旁边的「?」。
 *
 * 为什么只放四项：模型详情页要回答的是「这个模型行不行」，
 * 不是「它所有分数是多少」。剩下的分数放在下面的完整表里，不影响可查。
 */

export interface BarItem {
  id: string;
  name: string;
  /** 该模型的分数 */
  value: number;
  /** 分数量纲：百分比 / Elo … */
  scale: string;
  /** 计分方式说明 */
  scoring: string;
  summary: string;
  explanation: string;
  useCase: string;
  /** 全站该基准的最高分 / 平均分，用来把柱子放进同级参照系 */
  peerBest: number | null;
  peerAvg: number | null;
  source: string | null;
  measuredAt: string | null;
  sourceUrl: string | null;
  vendorOwned: boolean;
}

/** 柱子宽度：百分比类直接用分数本身；Elo 类没有天花板，按全站最高分归一 */
function barWidth(it: BarItem): number {
  const raw = it.scale.includes('Elo')
    ? it.peerBest && it.peerBest > 0
      ? (it.value / it.peerBest) * 100
      : 0
    : it.value;
  return Math.max(2, Math.min(100, raw));
}

export default function BenchmarkBars({ items }: { items: BarItem[] }) {
  if (!items.length) return null;

  return (
    <div className="bars">
      {items.map((it) => (
        <Bar key={it.id} item={it} pct={barWidth(it)} />
      ))}
    </div>
  );
}

function Bar({ item, pct }: { item: BarItem; pct: number }) {
  const [open, setOpen] = useState(false);
  const isElo = item.scale.includes('Elo');
  const display = isElo ? String(Math.round(item.value)) : `${item.value.toFixed(1)}%`;

  return (
    <div className="bar-row">
      <div className="bar-head">
        <span className="bar-name">{item.name}</span>
        <span className="bar-score">{display}</span>
        <button
          type="button"
          className="bar-q"
          aria-expanded={open}
          aria-label={`${item.name} 测什么、怎么用`}
          onClick={() => setOpen((v) => !v)}
        >
          ?
        </button>
      </div>

      <div className="bar-track" title={`${display}（同基准全站最高 ${item.peerBest ?? NA}）`}>
        <span className="bar-fill" style={{ width: `${pct}%` }} />
        {item.peerAvg != null && (
          <span className="bar-avg" style={{ left: `${Math.max(0, Math.min(100, item.peerAvg))}%` }} />
        )}
      </div>

      <div className="bar-foot">
        {item.source ? `${item.source}${item.measuredAt ? ` · ${item.measuredAt}` : ''}` : NA}
        {item.vendorOwned ? ' · 厂商自建基准' : ''}
      </div>

      {open && (
        <div className="bar-pop">
          <span className="bar-pop-title">{item.name}</span>
          <span className="bar-pop-line">
            <b>测什么</b>：{item.summary}
          </span>
          <span className="bar-pop-line">
            <b>为什么重要</b>：{item.explanation}
          </span>
          <span className="bar-pop-line">
            <b>什么时候该看它</b>：{item.useCase}
          </span>
          <span className="bar-pop-line">
            <b>计分</b>：{item.scoring}
          </span>
          {item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
              出处 ↗
            </a>
          ) : (
            <Link href={`/about#${item.id}`}>完整口径 →</Link>
          )}
        </div>
      )}
    </div>
  );
}
