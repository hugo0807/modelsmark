import Link from 'next/link';
import { loadDataset } from '../lib/data';
import { CHANNEL_TYPE_LABEL } from '../lib/types';
import ValueMatrix from '../components/ValueMatrix';

/** 数字块：整数右对齐 + 小数左对齐，使同列各行的小数点连成一条竖线 */
function Num({
  v,
  dec = 2,
  prefix,
}: {
  v: number | null | undefined;
  dec?: number;
  prefix?: string;
}) {
  if (v == null || !Number.isFinite(v)) return <span className="flat">—</span>;
  const s = v.toFixed(dec);
  const dot = s.indexOf('.');
  const i = dot < 0 ? s : s.slice(0, dot);
  const d = dot < 0 ? null : s.slice(dot);
  const body = d === null ? (
    <span className="n n-int">
      <span className="i">{i}</span>
    </span>
  ) : (
    <span className="n">
      <span className="i">{i}</span>
      <span className="d">{d}</span>
    </span>
  );
  return (
    <>
      {prefix ? <span className="p">{prefix}</span> : null}
      {body}
    </>
  );
}

export default function HomePage() {
  const ds = loadDataset();

  /*
   * 矩阵点：X = 全渠道最低混合价，Y = 智能指数
   *
   * 为什么用「全渠道最低」而不是「云厂商均价」做 X 轴：
   * 海外旗舰模型（Claude / GPT / Gemini / Grok）在国内云厂商没有转售价，
   * 用云厂商均价会把它们全部排除，矩阵只剩 6 个点。
   * 而「性价比」的本义就是「能力 ÷ 最低可得价格」，全渠道最低价才是正确口径。
   * 云厂商均价仍作为该模型的参考值保留在速览表里。
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
    .filter((x): x is NonNullable<typeof x> => x !== null);

  /*
   * 速览表排序：先按「是否有智能指数」分组，再按全渠道最低价升序。
   *
   * 为什么要有智能指数的排前面：智能指数目前只覆盖 13 个模型
   * （Artificial Analysis 榜单的收录部分），若纯按价格升序，
   * 这些模型会散落在长表中，「智能指数」列几乎全是「—」，
   * 表格看起来像是没有智能指数数据。
   */
  const overview = ds.aggregates
    .filter((a) => a.lowestBlendedCny != null)
    .sort((a, b) => {
      const ai = a.intelligence?.index ? 0 : 1;
      const bi = b.intelligence?.index ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return (a.lowestBlendedCny ?? 0) - (b.lowestBlendedCny ?? 0);
    });

  /*
   * 只统计「真正采到报价」的渠道。
   * 渠道表里还有 5 家已收录但尚无数据的渠道（Google AI Studio、Vertex、
   * xAI、天翼云、无问芯穹），把它们算进来会让「官方直售 9 家」这类说法
   * 虚高 —— 实际只有 6 家有价。
   */
  const pricedChannels = new Set(ds.prices.map((p) => p.channelId));
  const typeCount = (t: string) =>
    ds.channels.filter((c) => c.type === t && pricedChannels.has(c.id)).length;

  return (
    <>
      <section className="page-head page-head-slim">
        <h1>模型 API 价格与能力对比</h1>
      </section>

      {/* ── 性价比矩阵 ── */}
      <div className="section-title">
        性价比矩阵{' '}
        <span className="sub">
          横轴为全渠道最低混合价（3:1 输入输出加权，¥/M tokens，对数轴），纵轴为综合智能指数。左上角 = 又强又便宜
        </span>
      </div>
      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <ValueMatrix points={scatter} />
      </div>

      {/* ── 模型速览 ── */}
      <div className="section-title">
        模型速览 <span className="sub">点模型名进详情页看各渠道报价</span>
      </div>
      <div className="table-scroll card">
        <table className="data">
          <thead>
            <tr>
              <th>模型</th>
              <th>厂商</th>
              <th className="right">
                最低价
                <span className="th-info">?</span>
                <span className="th-hint">
                  <b>全渠道最低混合价</b>
                  <br />
                  全部渠道里最便宜的那一条，按输入 : 输出 = 3 : 1 加权成「元 / 百万 tokens」。
                  <span className="hint-limit">
                    已排除批量推理、闲时折扣、长上下文溢价等不可复现档位。
                  </span>
                </span>
              </th>
              <th className="right">
                最高价
                <span className="th-info">?</span>
                <span className="th-hint">
                  <b>全渠道最高混合价</b>
                  <br />
                  同一个模型在最贵的那家渠道的价格。与最低价并排看，
                  差值就是这个模型的「换渠道空间」。
                  <span className="hint-limit">
                    同样只取标准档（不含批量、闲时、长上下文溢价档）。
                    只有一家渠道报价时，最低 = 最高。
                  </span>
                </span>
              </th>
              <th className="right">
                价差
                <span className="th-info">?</span>
                <span className="th-hint">
                  <b>渠道价差倍数</b>
                  <br />
                  最高价 ÷ 最低价。1.0× 表示各渠道同价，数字越大说明换个渠道采购省得越多。
                  <span className="hint-limit">
                    按标准档计算，剔除不可复现的折扣档。
                  </span>
                </span>
              </th>
              <th className="right">
                智能指数
                <span className="th-info">?</span>
                <span className="th-hint">
                  <b>综合智能指数</b>
                  <br />
                  第三方评测机构（Artificial Analysis）给出的能力刻度，用来和价格对照。
                  <span className="hint-limit">
                    仅覆盖评测机构已跑分并公布的模型，显示「—」表示该模型暂无公开可比评测数据，
                    不代表能力差。
                  </span>
                </span>
              </th>
              <th className="right">
                可选渠道
                <span className="th-info">?</span>
                <span className="th-hint">
                  <b>可选渠道数</b>
                  <br />
                  提供该模型按量计费报价的渠道数量。数量越多，价格谈判空间通常越大。
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {overview.map((agg) => (
              <tr key={agg.model.id}>
                <td>
                  <Link className="m-link" href={`/models/${agg.model.id}`}>
                    <span
                      className={`dot ${
                        agg.model.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'
                      }`}
                      style={{ marginRight: 6 }}
                    />
                    {agg.model.name}
                  </Link>
                </td>
                <td className="m-sub">{agg.model.vendor}</td>
                <td className="right num" style={{ fontWeight: 600 }}>
                  {/* 表头是「全渠道最低」，这里必须取 lowestBlendedCny；
                      用 cloudAvgCny 会让没有云厂商转售价的模型显示成「—」 */}
                  <Num v={agg.lowestBlendedCny} prefix="¥" />
                </td>
                <td className="right num">
                  <Num v={agg.highestBlendedCny} prefix="¥" />
                </td>
                <td className="right num">
                  {agg.priceSpread != null ? `${agg.priceSpread.toFixed(1)}×` : '—'}
                </td>
                <td className="right num">{agg.intelligence?.index ?? '—'}</td>
                <td className="right num">{agg.paygPrices.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="footnote">
        <p>
          <strong>四种渠道类型</strong>
          ：{Object.entries(CHANNEL_TYPE_LABEL)
            .map(([k, v]) => `${v}(${typeCount(k)})`)
            .join(' · ')}
          。模型详情页按此顺序分组展示，每个渠道价都附来源链接。
        </p>
        <p>
          <strong>价格口径</strong>
          ：统一为「¥ / 百万 tokens」，3:1 混合价 = (3 × 输入 + 1 × 输出) ÷ 4。
          海外模型按央行中间价折算人民币。全渠道最低 = 该模型在所有渠道中标准档的最低混合价。
        </p>
      </div>
    </>
  );
}
