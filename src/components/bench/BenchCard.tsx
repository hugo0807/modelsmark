'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { BenchmarkCategory, Origin } from '../../lib/types';

/** 一项基准下的一个模型得分行 */
export interface BenchRow {
  modelId: string;
  name: string;
  vendor: string;
  origin: Origin;
  value: number;
}

/** 传给客户端的基准数据：全部是可序列化的扁平字段 */
export interface BenchItem {
  id: string;
  name: string;
  category: BenchmarkCategory;
  scale: string;
  vendorOwned: boolean;
  url: string | null;
  summary: string;
  explanation: string;
  useCase: string;
  scoring: string;
  /** 已按分数降序排好 */
  rows: BenchRow[];
}

/**
 * 单项基准的排行榜卡片。
 *
 * 两个决定：
 * 1. 默认只显示前 8 名 —— 一张卡 30 行等于没有榜，超过的部分折叠。
 * 2. 「这基准测什么」放在卡片内点击展开，而不是跳去 /about ——
 *    看榜时被打断去另一个页面，回来就找不到刚才看的是哪一项了。
 */

const VISIBLE = 8;

export function BenchCard({ item }: { item: BenchItem }) {
  const [about, setAbout] = useState(false);
  const [all, setAll] = useState(false);

  const rows = all ? item.rows : item.rows.slice(0, VISIBLE);
  const max = item.rows.length ? item.rows[0].value : 1;
  const min = item.rows.length ? item.rows[item.rows.length - 1].value : 0;
  const range = max - min || 1;
  const hidden = item.rows.length - rows.length;

  return (
    <div className="bench-card">
      <div className="bench-head">
        <span className="bench-name">{item.name}</span>
        <span className="bench-cat">{item.scale}</span>
        {item.vendorOwned && <span className="tag">厂商自建</span>}
        <button
          type="button"
          className="bench-q"
          aria-expanded={about}
          onClick={() => setAbout((v) => !v)}
        >
          {about ? '收起' : '这基准测什么？'}
        </button>
      </div>

      {about ? (
        <div className="bench-about">
          <p>
            <strong>测什么：</strong>
            {item.summary}
          </p>
          <p>
            <strong>为什么重要：</strong>
            {item.explanation}
          </p>
          <p>
            <strong>什么时候该看它：</strong>
            {item.useCase}
          </p>
          <p className="bench-about-foot">
            计分：{item.scoring}
            {item.url ? (
              <>
                {' · '}
                <a href={item.url} target="_blank" rel="noreferrer">
                  官方链接 ↗
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {item.rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>本站暂无该基准的分数</div>
      ) : (
        rows.map((r, i) => (
          <div className="bench-row" key={r.modelId}>
            <span className="bench-rank">{i + 1}</span>
            <span className="bench-model">
              <span
                className={`dot ${r.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'}`}
                style={{ marginRight: 5 }}
              />
              <Link href={`/models/${r.modelId}`}>{r.name}</Link>
            </span>
            <span className="bench-bar">
              <span
                className="bench-fill"
                style={{
                  width: `${Math.max(((r.value - min) / range) * 100, 3)}%`,
                  background: r.origin === 'domestic' ? 'var(--domestic)' : 'var(--overseas)',
                }}
              />
            </span>
            <span className="bench-score">
              {item.scale === 'Elo' ? Math.round(r.value) : r.value.toFixed(1)}
            </span>
          </div>
        ))
      )}

      {item.rows.length > VISIBLE ? (
        <button type="button" className="bench-more" onClick={() => setAll((v) => !v)}>
          {all ? '收起' : `显示全部 ${item.rows.length} 个模型`}
        </button>
      ) : null}
    </div>
  );
}
