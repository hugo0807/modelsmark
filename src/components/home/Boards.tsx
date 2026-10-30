/**
 * 三个 Top5 榜 —— 能力指数最高 / 价格最低 / 性价比最优。
 *
 * 两个刻意的设计：
 *
 * 1. 价格榜必须同时给输入 / 缓存读 / 输出。
 *    只给一个混合价，用户既看不出这个价怎么来的，也没法按自己的负载重算。
 *
 * 2. 用「能力指数」而不是「价差」做第三个榜。
 *    价差榜回答的是「同一模型换哪家渠道省得多」——那是渠道榜的问题；
 *    首页要回答的是「该选哪个模型」，第三个维度该是能力与价格的比值。
 */

import Link from 'next/link';

import { fmtInt, fmtPrice, NA } from '../../lib/format';
import type { RankRow } from '../../lib/selectors';

export default function Boards({
  intelligence,
  price,
  value,
}: {
  intelligence: RankRow[];
  price: RankRow[];
  value: RankRow[];
}) {
  return (
    <div className="boards">
      <Board
        title="能力指数最高"
        unit="指数"
        rows={intelligence}
        // 整数，无需小数位
        renderValue={(v) => fmtInt(v)}
      />
      <Board
        title="价格最低"
        unit="¥ / 百万 tokens"
        rows={price}
        renderValue={(v) => fmtPrice(v)}
        extra
      />
      <Board
        title="性价比最优"
        unit="¥ / 每分指数"
        rows={value}
        renderValue={(v) => (v == null ? NA : v.toFixed(3))}
      />
    </div>
  );
}

function Board({
  title,
  unit,
  rows,
  renderValue,
  extra = false,
}: {
  title: string;
  unit: string;
  rows: RankRow[];
  renderValue: (v: number | null) => string;
  /** 是否额外展示输入 / 缓存读 / 输出三列（目前只有价格榜需要） */
  extra?: boolean;
}) {
  return (
    <div className="board">
      <h3>
        {title}
        <span className="board-unit">{unit}</span>
      </h3>
      <table className="data">
        <thead>
          <tr>
            <th className="rank-col" />
            <th>模型</th>
            {/* 输入 / 缓存读 / 输出 三列只在大屏显示，小屏靠下面的混合价与上面的单位行 */}
            {extra && (
              <>
                <th className="right hide-sm">输入</th>
                <th className="right hide-sm">缓存读</th>
                <th className="right hide-sm">输出</th>
              </>
            )}
            <th className="right">{extra ? '混合价' : unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="rank">{i + 1}</td>
              <td>
                <Link className="m-link" href={`/models/${r.id}`}>
                  {r.name}
                </Link>
              </td>
              {extra && (
                <>
                  <td className="right num hide-sm">{fmtPrice(r.input ?? null)}</td>
                  <td className="right num hide-sm m-sub">{fmtPrice(r.cacheRead ?? null)}</td>
                  <td className="right num hide-sm">{fmtPrice(r.output ?? null)}</td>
                </>
              )}
              <td className="right num">
                <b>{renderValue(r.value)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
