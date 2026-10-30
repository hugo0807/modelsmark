import Link from 'next/link';

import { loadDataset } from '../lib/data';
import { CHANNEL_TYPE_LABEL } from '../lib/types';
import { fmtInt } from '../lib/format';
import ValueMatrix from '../components/ValueMatrix';
import DataTable, { type ColumnDef, type FilterDef } from '../components/common/DataTable';
import Glossary from '../components/common/Glossary';
import TrustBar from '../components/home/TrustBar';
import VerdictCards from '../components/home/VerdictCards';
import Boards from '../components/home/Boards';
import FormulaBar from '../components/home/FormulaBar';
import {
  buildModelRows,
  buildVerdicts,
  toTableRows,
  topByIntelligence,
  topByPrice,
  topByValue,
  type ModelRow,
} from '../lib/selectors';

/*
 * 首页只回答一件事：**选哪个模型**。
 *
 * 之前这里同时塞了矩阵、价差榜、渠道说明等多套内容，
 * 导致页面没有一个明确的问题意识。现在的顺序是：
 *   数据可信度 → 结论三卡 → 矩阵 → 三个 Top5 → 全量表
 * 先给结论，再给证据，最后给可查的全量数据。
 * 「选哪家渠道」交给模型详情页，「套餐划不划算」交给套餐页。
 */

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: '模型', sortable: true },
  { key: 'input', label: '输入', type: 'price', align: 'right', sortable: true },
  {
    key: 'cacheRead',
    label: '缓存读',
    type: 'price',
    align: 'right',
    sortable: true,
    hideSm: true,
  },
  { key: 'output', label: '输出', type: 'price', align: 'right', sortable: true },
  {
    key: 'blended',
    label: '3:1 混合价',
    type: 'cny',
    align: 'right',
    sortable: true,
    strong: true,
  },
  { key: 'index', label: '能力指数', type: 'int', align: 'right', sortable: true },
  { key: 'value', label: '性价比 ¥/分', type: 'value', align: 'right', sortable: true },
  { key: 'channels', label: '渠道数', type: 'int', align: 'right', sortable: true },
];

const FILTERS: FilterDef[] = [
  { key: 'all', label: '全部' },
  { key: 'domestic', label: '国产' },
  { key: 'overseas', label: '海外' },
  { key: 'intel', label: '有能力指数' },
];

export default function HomePage() {
  const ds = loadDataset();
  const rows = buildModelRows(ds);

  /*
   * 默认排序：有能力指数的排前面，其次按混合价升序。
   *
   * 为什么不全量按价格升序：能力指数目前只覆盖评测机构已跑分的那部分模型，
   * 纯按价格排会让这些模型散落在长表里，表格看起来像「没有能力数据」。
   */
  const ordered: ModelRow[] = [...rows].sort((a, b) => {
    const ai = a.index != null ? 0 : 1;
    const bi = b.index != null ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return (a.blended ?? Infinity) - (b.blended ?? Infinity);
  });

  const verdicts = buildVerdicts(rows);
  const cheapest = topByPrice(rows, 1)[0];

  /*
   * 矩阵点：X = 全渠道最低混合价，Y = 能力指数。
   *
   * 用「全渠道最低」而不是「云厂商均价」做 X 轴：海外旗舰模型在国内云厂商
   * 没有转售价，用均价会把它们全部排除，矩阵只剩零星几个点。
   */
  const scatter = ds.aggregates
    .map((agg) => {
      if (!agg.intelligence?.index) return null;
      if (agg.lowestBlendedCny == null) return null;
      return {
        id: agg.model.id,
        name: agg.model.name,
        origin: agg.model.origin,
        x: agg.lowestBlendedCny,
        y: agg.intelligence.index,
        rank: agg.intelligence.rank,
        channels: agg.paygPrices.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  /*
   * 只统计「真正采到报价」的渠道：
   * 渠道表里还有已收录但本期没抓到价的渠道，把它们算进来会虚报覆盖度。
   */
  const pricedChannels = new Set(ds.prices.map((p) => p.channelId));
  const typeCount = (t: string) =>
    ds.channels.filter((c) => c.type === t && pricedChannels.has(c.id)).length;

  return (
    <>
      <TrustBar
        models={ds.models.length}
        channels={pricedChannels.size}
        prices={ds.prices.length}
        updatedAt={ds.updatedAt}
      />

      <div className="section-title">
        先看结论 <span className="sub">按能力指数、价格、性价比各取一个最优</span>
      </div>
      <VerdictCards verdicts={verdicts} />

      <div className="section-title">
        性价比矩阵{' '}
        <span className="sub">
          横轴最低混合价（对数）· 纵轴能力指数 · 左上角最优
        </span>
      </div>
      <div className="card card-pad">
        <ValueMatrix points={scatter} />
      </div>

      <div className="section-title">
        三个榜 <span className="sub">每个只看前 5 名 · 单位均为 ¥ / 百万 tokens</span>
      </div>
      <Boards
        intelligence={topByIntelligence(rows)}
        price={topByPrice(rows)}
        value={topByValue(rows)}
      />

      <div className="section-title">
        全部模型{' '}
        <span className="sub">
          价格取该模型最低价渠道的标准档 · 可搜索、筛选、排序
        </span>
      </div>
      <FormulaBar
        exampleIn={cheapest?.input ?? null}
        exampleOut={cheapest?.output ?? null}
        exampleBlend={cheapest?.value ?? null}
      />
      <DataTable
        rows={toTableRows(ordered)}
        columns={COLUMNS}
        filters={FILTERS}
        limit={12}
        searchPlaceholder="搜索模型或厂商"
        linkPattern="/models/{id}"
      />

      <div className="footnote">
        <p>
          <strong>口径在哪</strong>
          ：每个数字的算法、覆盖范围与不适用场景都在
          <Link href="/about">口径说明页</Link>
          ，这里只放要点：输入
          <Glossary term="input" />
          、缓存读
          <Glossary term="cacheRead" />
          、输出
          <Glossary term="output" />
          、混合价
          <Glossary term="blended" />
          、能力指数
          <Glossary term="intelligence" />
          、性价比
          <Glossary term="value" />
          。
        </p>
        <p>
          <strong>四种渠道类型</strong>
          ：{Object.entries(CHANNEL_TYPE_LABEL)
            .map(([k, v]) => `${v}(${typeCount(k)})`)
            .join(' · ')}
          。模型详情页按此顺序分组展示，每个渠道价都附官网来源链接。
        </p>
        <p>
          <strong>价格口径</strong>
          ：统一为「¥ / 百万 tokens」，3:1 混合价 = (3 × 输入 + 1 × 输出) ÷ 4，缓存读不计入。
          海外模型按央行中间价折算人民币（1 美元 = {ds.usdCny.toFixed(3)} 元）。
          全站共 {fmtInt(ds.prices.length)} 条报价，全部带来源取得时间与原文证据锚点。
        </p>
      </div>
    </>
  );
}
