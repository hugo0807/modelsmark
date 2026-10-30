import type { Metadata } from 'next';

import { loadDataset } from '../../lib/data';
import { CHANNEL_TYPE_LABEL, type ChannelType } from '../../lib/types';
import { fmtCny, fmtInt, fmtSpread, NA } from '../../lib/format';
import { buildChannelRanks, channelBoards, type ChannelRank } from '../../lib/selectors';

export const metadata: Metadata = {
  title: '渠道对比 — ModelsMark',
  description:
    '按渠道看：覆盖了多少模型、平均价格多少、相对全网最低价平均溢价多少。回答「在哪家买」。',
};

/**
 * 渠道页只回答一个问题：**在哪家买**。
 *
 * 模型页已经把「同一模型在各家多少钱」说清楚了，
 * 但采购还常问「这家渠道整体贵不贵 / 覆盖够不够」——
 * 那是模型维度看不出来的：有的渠道模型全但普遍溢价，有的便宜但只上架三四个模型。
 */

function Board({
  title,
  unit,
  rows,
  render,
}: {
  title: string;
  unit: string;
  rows: ChannelRank[];
  render: (r: ChannelRank) => string;
}) {
  return (
    <div className="board">
      <h3>
        {title}
        <span className="board-unit">{unit}</span>
      </h3>
      <table className="data">
        {/* 榜也要有表头 —— 没有 thead 时读屏软件读不出这两列是什么，校验脚本也会报列数不一致 */}
        <thead>
          <tr>
            <th className="rank-col" />
            <th>渠道</th>
            <th className="right">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="rank">{i + 1}</td>
              <td>{r.name}</td>
              <td className="right num">
                <b>{render(r)}</b>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="flat" style={{ padding: '12px 14px' }}>
                暂无可比数据
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function ChannelsPage() {
  const ds = loadDataset();
  const ranks = buildChannelRanks(ds);
  const { byCoverage, byAvg, byPremium } = channelBoards(ranks);

  const byType = new Map<ChannelType, ChannelRank[]>();
  for (const r of ranks) {
    const list = byType.get(r.type) ?? [];
    list.push(r);
    byType.set(r.type, list);
  }

  return (
    <>
      <h1 className="sr-only">渠道对比</h1>

      <div className="trustbar">
        <span>
          <b>{fmtInt(ranks.length)}</b>家在售渠道
        </span>
        <span>
          <b>{fmtInt(ds.prices.length)}</b>条官网报价
        </span>
        <span className="stamp">快照 {ds.updatedAt} · 每周一 06:00 更新</span>
      </div>

      <div className="section-title">
        三个榜 <span className="sub">每个只看前 5 家 · 覆盖、均价、溢价三个角度</span>
      </div>
      <div className="boards">
        <Board
          title="覆盖最广"
          unit="上架模型数"
          rows={byCoverage}
          render={(r) => `${fmtInt(r.coverage)} 个`}
        />
        <Board
          title="均价最低"
          unit="¥ / 百万 tokens"
          rows={byAvg}
          render={(r) => fmtCny(r.avgBlended)}
        />
        <Board
          title="溢价最高"
          unit="相对全网最低价"
          rows={byPremium}
          render={(r) => fmtSpread(r.avgPremium)}
        />
      </div>

      <div className="section-title">
        全部渠道{' '}
        <span className="sub">
          溢价 = 该渠道价 ÷ 该模型全网最低价，1.0× 表示这家永远是最低价
        </span>
      </div>
      {(['official', 'cloud', 'carrier', 'third'] as ChannelType[]).map((t) => {
        const list = byType.get(t) ?? [];
        if (!list.length) return null;
        return (
          <div className="card" key={t} style={{ marginBottom: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 200 }}>{CHANNEL_TYPE_LABEL[t]}</th>
                  <th className="right">覆盖模型</th>
                  <th className="right">平均混合价</th>
                  <th className="right">平均溢价</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="right num">{fmtInt(r.coverage)}</td>
                    <td className="right num">{fmtCny(r.avgBlended)}</td>
                    <td className="right num">
                      {r.avgPremium == null ? NA : `${r.avgPremium.toFixed(2)}×`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="footnote">
        <p>
          <strong>怎么读溢价</strong>：溢价是把该渠道某个模型的价格，
          除以这个模型在全网的最低价格后取平均。1.05× 表示「比最便宜的那家平均贵 5%」，
          2.00× 表示「平均贵一倍」。溢价低不等于每个模型都便宜，
          具体模型请回到它的详情页看各渠道报价。
        </p>
      </div>
    </>
  );
}
