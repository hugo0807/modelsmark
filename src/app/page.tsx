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

  const payg = ds.prices.filter((p) => p.billingMode === 'payg');
  const packages = ds.prices.filter((p) => p.billingMode === 'package');

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

  // 速览表：按全渠道最低价升序
  const overview = ds.aggregates
    .filter((a) => a.lowestBlendedCny != null)
    .sort((a, b) => (a.lowestBlendedCny ?? 0) - (b.lowestBlendedCny ?? 0));

  const typeCount = (t: string) => ds.channels.filter((c) => c.type === t).length;

  return (
    <>
      <section className="page-head">
        <h1>同一个模型，各家多少钱</h1>
        <p>
          把模型厂商官方价、云厂商转售价、运营商价、第三方 Token Hub 价放在一起比。
          所有价格均抓自各家官方定价页，每一条都能点回原文核验。
        </p>
      </section>

      <section className="metrics">
        <div className="metric">
          <div className="metric-label">收录模型</div>
          <div className="metric-value">{ds.aggregates.length}</div>
          <div className="metric-note">
            国内 {ds.models.filter((m) => m.origin === 'domestic').length} · 海外{' '}
            {ds.models.filter((m) => m.origin === 'overseas').length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">价格渠道</div>
          <div className="metric-value">{new Set(ds.prices.map((p) => p.channelId)).size}</div>
          <div className="metric-note">
            官方 {typeCount('official')} · 云厂商 {typeCount('cloud')} · 运营商{' '}
            {typeCount('carrier')} · 第三方 {typeCount('third')}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">价格记录</div>
          <div className="metric-value">{payg.length}</div>
          <div className="metric-note">另有 {packages.length} 条套餐价</div>
        </div>
        <div className="metric">
          <div className="metric-label">快照</div>
          <div className="metric-value">{ds.snapshotId}</div>
          <div className="metric-note">
            更新 {ds.updatedAt} · 汇率 {ds.usdCny.toFixed(3)}
          </div>
        </div>
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
              <th className="right">全渠道最低</th>
              <th className="right">官方价</th>
              <th className="right">智能指数</th>
              <th className="right">可选渠道</th>
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
                  <Num v={agg.cloudAvgCny} prefix="¥" />
                </td>
                <td className="right num">
                  <Num v={agg.officialBlendedCny} prefix="¥" />
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
