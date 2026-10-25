import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllModelSlugs, getModelDetail } from '../../../lib/data';
import { formatCny, formatDelta, deltaColor, cacheDiscount, formatDiscount } from '../../../lib/compute';

export const metadata = { title: '模型详情 — ModelsMark' };

/** 静态导出：枚举所有模型路由 */
export function generateStaticParams() {
  return getAllModelSlugs().map((slug) => ({ slug }));
}

export default async function ModelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = getModelDetail(slug);
  if (!detail) notFound();

  const { model, prices, scores, intel } = detail;
  const payg = prices.filter((p) => p.billingMode === 'payg');
  const plans = prices.filter((p) => p.billingMode === 'package');

  return (
    <>
      <section className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className={`dot ${model.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'}`}
            style={{ width: 10, height: 10 }}
          />
          <h1 style={{ margin: 0 }}>{model.name}</h1>
          {model.openWeights && <span className="tag tag-open">开源权重</span>}
        </div>
        <p style={{ marginTop: 8 }}>
          {model.vendor}
          {model.contextWindow
            ? ` · ${(model.contextWindow / 1000000).toFixed(2).replace(/\.?0+$/, '')}M 上下文`
            : ''}
          {model.params ? ` · ${model.params} 参数` : ''}
          {model.activeParams ? `（${model.activeParams} 激活）` : ''}
          {model.releasedAt ? ` · ${model.releasedAt} 发布` : ''}
        </p>
      </section>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">最低按量混合价</div>
          <div className="metric-value">
            {payg.length ? formatCny(Math.min(...payg.map((p) => p.blendedCny ?? Infinity))) : '—'}
          </div>
          <div className="metric-note">3:1 输入输出，每百万 token</div>
        </div>
        <div className="metric">
          <div className="metric-label">综合智能指数</div>
          <div className="metric-value">
            {intel?.index ?? (
              <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-tertiary)' }}>
                未收录
              </span>
            )}
          </div>
          <div className="metric-note">
            {intel?.rank ? `全球第 ${intel.rank} 名` : '评测机构暂未覆盖'} · Artificial Analysis
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">每任务成本</div>
          <div className="metric-value">
            {intel?.costPerTaskUsd ? `$${intel.costPerTaskUsd.toFixed(2)}` : '—'}
          </div>
          <div className="metric-note">完成一次智力指数任务的成本</div>
        </div>
        <div className="metric">
          <div className="metric-label">可选渠道</div>
          <div className="metric-value">{payg.length}</div>
          <div className="metric-note">{plans.length} 个套餐方案</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="card-title">各渠道价格</div>
          <p className="card-sub">海外渠道已折算人民币；括号内为原始美元价</p>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>渠道</th>
                <th className="right">输入</th>
                <th className="right">缓存读取</th>
                <th className="right">缓存写入</th>
                <th className="right">输出</th>
                <th className="right">缓存折扣</th>
                <th className="right">3:1 混合价</th>
                <th className="right">溢价率</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {payg.map((p) => (
                <tr key={`${p.channelId}-${p.tierLabel ?? 'std'}`}>
                  <td>
                    <span
                      className="dot"
                      style={{
                        background:
                          p.channel?.type === 'first_party'
                            ? 'var(--accent)'
                            : 'var(--domestic)',
                        marginRight: 7,
                      }}
                    />
                    {p.channel?.name}
                    {p.tierLabel && (
                      <span className="tag" style={{ marginLeft: 7 }}>
                        {p.tierLabel}
                      </span>
                    )}
                  </td>
                  <td className="right num">{formatCny(p.inputCny)}</td>
                  <td className="right num" style={{ color: 'var(--text-secondary)' }}>
                    {formatCny(p.cacheReadCny)}
                  </td>
                  <td className="right num" style={{ color: 'var(--text-secondary)' }}>
                    {formatCny(p.cacheWriteCny)}
                  </td>
                  <td className="right num">{formatCny(p.outputCny)}</td>
                  <td className="right num">
                    {(() => {
                      const d = cacheDiscount(p);
                      return d === null ? (
                        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <span style={{ color: '#3B6D11', fontWeight: 500 }}>
                          ↓ {formatDiscount(d)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="right num" style={{ fontWeight: 600 }}>
                    {formatCny(p.blendedCny)}
                  </td>
                  <td className="right num">
                    {p.premiumRate === null ? (
                      <span style={{ color: 'var(--text-tertiary)' }}>官方</span>
                    ) : (
                      <span className={deltaColor(p.premiumRate)}>
                        {formatDelta(p.premiumRate)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {p.currency === 'USD' && (
                      <span className="num" style={{ color: 'var(--text-tertiary)' }}>
                        ${p.inputNative}/{p.outputNative}{' '}
                      </span>
                    )}
                    {p.promoNote ?? p.note ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {plans.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-pad" style={{ paddingBottom: 12 }}>
            <div className="card-title">套餐方案</div>
            <p className="card-sub">按量价与套餐价口径不同，分开展示</p>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>渠道</th>
                  <th>档位</th>
                  <th className="right">额度</th>
                  <th className="right">周期</th>
                  <th className="right">价格</th>
                  <th className="right">折合每百万 token</th>
                  <th>条件</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={`${p.channelId}-${p.packageTierName}`}>
                    <td>{p.channel?.name}</td>
                    <td>{p.packageTierName ?? p.tierLabel}</td>
                    <td className="right num">
                      {p.packageTokens
                        ? `${(p.packageTokens / 1000000).toFixed(0)} 万 token`
                        : '—'}
                    </td>
                    <td className="right">{p.packagePeriod ?? '—'}</td>
                    <td className="right num">
                      {p.packagePriceCny ? `¥${p.packagePriceCny}` : '—'}
                    </td>
                    <td className="right num" style={{ color: 'var(--warn)', fontWeight: 600 }}>
                      ≈ {formatCny(p.packageBlendedCny)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {p.packageMerged && '输入输出合并抵扣 · '}
                      {p.packageManualActivation && '需手动激活 · '}
                      {p.note ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scores.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-pad" style={{ paddingBottom: 12 }}>
            <div className="card-title">能力基准表现</div>
            <p className="card-sub">
              {scores.length} 项基准。推理档位{' '}
              {Array.from(new Set(scores.map((s) => s.effort).filter(Boolean))).join(' / ') || '未标注'}
            </p>
          </div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>基准</th>
                  <th className="right">分数</th>
                  <th className="right">量纲</th>
                  <th>来源</th>
                  <th>口径标注</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.benchmarkId}>
                    <td>
                      <Link
                        href={`/about#${s.benchmarkId}`}
                        style={{ color: 'var(--accent)' }}
                      >
                        {s.benchmark?.name ?? s.benchmarkId}
                      </Link>
                    </td>
                    <td className="right num" style={{ fontWeight: 600 }}>
                      {s.benchmark?.scale === 'Elo'
                        ? Math.round(s.value)
                        : s.value.toFixed(1)}
                    </td>
                    <td className="right" style={{ color: 'var(--text-secondary)' }}>
                      {s.benchmark?.scale}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.source}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {s.includesFallback && '含 fallback · '}
                      {s.includesCyberguards && '含 cyberguards · '}
                      {s.benchmark?.vendorOwned && '厂商自建基准'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {model.pricingUrl && (
          <a
            href={model.pricingUrl}
            target="_blank"
            rel="noreferrer"
            className="filter"
          >
            官方定价页 ↗
          </a>
        )}
        {model.docsUrl && (
          <a href={model.docsUrl} target="_blank" rel="noreferrer" className="filter">
            官方文档 ↗
          </a>
        )}
        <Link href="/prices" className="filter">
          返回价格榜
        </Link>
      </div>
    </>
  );
}
