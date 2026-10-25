import Link from 'next/link';
import { Fragment } from 'react';
import { loadDataset, getChannelMap, getModelMap } from '../../lib/data';
import { formatCny, formatDelta, deltaColor, cacheDiscount, formatDiscount } from '../../lib/compute';

export const metadata = { title: '价格榜 — ModelsMark' };

export default function PricesPage() {
  const ds = loadDataset();
  const channelMap = getChannelMap();
  const modelMap = getModelMap();

  const byModel = new Map<string, typeof ds.prices>();
  for (const p of ds.prices) {
    if (!byModel.has(p.modelId)) byModel.set(p.modelId, []);
    byModel.get(p.modelId)!.push(p);
  }

  const ordered = [...byModel.entries()].sort((a, b) => {
    const pa = Math.min(
      ...a[1].filter((x) => x.billingMode === 'payg').map((x) => x.blendedCny ?? Infinity)
    );
    const pb = Math.min(
      ...b[1].filter((x) => x.billingMode === 'payg').map((x) => x.blendedCny ?? Infinity)
    );
    return pa - pb;
  });

  return (
    <>
      <section className="page-head">
        <h1>价格榜</h1>
        <p>
          每个模型在各渠道的按量刊例价与套餐价。单位为每百万 token，
          海外模型已按 1 USD = {ds.usdCny.toFixed(4)} CNY 折算。
        </p>
      </section>

      <div className="filters">
        <span className="filter on">全部渠道 {ds.channels.length}</span>
        <span className="filter">仅官方 {ds.channels.filter((c) => c.type === 'first_party').length}</span>
        <span className="filter">仅云平台 {ds.channels.filter((c) => c.type === 'cloud').length}</span>
        <span className="filter">按量价</span>
        <span className="filter">套餐价</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          按量 {ds.prices.filter((p) => p.billingMode === 'payg').length} 条 · 套餐{' '}
          {ds.prices.filter((p) => p.billingMode === 'package').length} 条
        </span>
      </div>

      <div className="card table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: '24%' }}>模型 / 渠道</th>
              <th className="right">输入</th>
              <th className="right">缓存读取</th>
              <th className="right">缓存写入</th>
              <th className="right">输出</th>
              <th className="right">缓存折扣</th>
              <th className="right">3:1 混合价</th>
              <th className="right">溢价率</th>
              <th>计费方式 / 备注</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(([modelId, prices]) => {
              const model = modelMap.get(modelId);
              const paygRows = prices
                .filter((p) => p.billingMode === 'payg')
                .sort((a, b) => (a.blendedCny ?? Infinity) - (b.blendedCny ?? Infinity));
              const planRows = prices.filter((p) => p.billingMode === 'package');

              return (
                <Fragment key={modelId}>
                  <tr className="model-group">
                    <td colSpan={9}>
                      <span
                        className={`dot ${model?.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'}`}
                        style={{ marginRight: 7 }}
                      />
                      <Link href={`/models/${modelId}`}>{model?.name ?? modelId}</Link>
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {model?.vendor}
                        {model?.contextWindow
                          ? ` · ${(model.contextWindow / 1000000).toFixed(2).replace(/\.?0+$/, '')}M 上下文`
                          : ''}
                        {model?.openWeights ? ' · 开源权重' : ''}
                      </span>
                    </td>
                  </tr>

                  {paygRows.map((p) => {
                    const channel = channelMap.get(p.channelId);
                    return (
                      <tr key={`${p.channelId}-${p.tierLabel ?? 'std'}`}>
                        <td>
                          <span
                            className="dot"
                            style={{
                              background:
                                channel?.type === 'first_party'
                                  ? 'var(--accent)'
                                  : 'var(--domestic)',
                              marginRight: 7,
                            }}
                          />
                          {channel?.name}
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
                            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                          ) : (
                            <span className={deltaColor(p.premiumRate)}>
                              {formatDelta(p.premiumRate)}
                            </span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {p.promotional && <span className="tag tag-promo">促销</span>}{' '}
                          {p.currency === 'USD' && (
                            <span className="num" style={{ color: 'var(--text-tertiary)' }}>
                              $
                              {p.inputNative}/{p.outputNative}
                            </span>
                          )}{' '}
                          {p.promoNote ?? p.note ?? ''}
                        </td>
                      </tr>
                    );
                  })}

                  {planRows.map((p) => {
                    const channel = channelMap.get(p.channelId);
                    return (
                      <tr className="plan-row" key={`${p.channelId}-plan-${p.tierLabel}`}>
                        <td>
                          └ <span className="tag tag-plan">套餐</span>{' '}
                          {channel?.name} · {p.packageTierName ?? p.tierLabel}
                        </td>
                        <td className="right num" colSpan={3}>
                          {p.packageTokens
                            ? `${(p.packageTokens / 1000000).toFixed(0)} 万 token / ${p.packagePeriod}`
                            : '—'}
                        </td>
                        <td className="right num">
                          {p.packagePriceCny ? `¥${p.packagePriceCny}` : '—'}
                        </td>
                        <td className="right num" />
                        <td className="right num" style={{ color: 'var(--warn)' }}>
                          ≈ {formatCny(p.packageBlendedCny)}
                        </td>
                        <td className="right num" />
                        <td>
                          {p.packageMerged && '输入输出合并抵扣 · '}
                          {p.packageManualActivation && '需手动激活 · '}
                          {p.note ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 12,
        }}
      >
        <div className="card card-pad">
          <div className="card-title">缓存价怎么读</div>
          <p className="card-sub" style={{ margin: 0, lineHeight: 1.8 }}>
            <strong>缓存读取</strong>是重复请求同一段前缀时的单价，通常是标准输入价的 10% 上下；
            <strong>缓存写入</strong>是首次把内容写入缓存的代价，Anthropic 收 1.25 倍输入价，OpenAI 不单收。
            <strong>缓存折扣</strong>列显示读取价相对标准输入省了多少。
          </p>
        </div>
        <div className="card card-pad">
          <div className="card-title">为什么缓存比价更重要</div>
          <p className="card-sub" style={{ margin: 0, lineHeight: 1.8 }}>
            缓存命中与未命中的价差可达上百倍。固定 system prompt 的多轮对话、
            反复检索的 RAG 场景，缓存命中率往往能到 60% 以上——
            同一份负载，开不开缓存的账单可能差几倍。这比单纯比价更影响总成本。
          </p>
        </div>
        <div className="card card-pad">
          <div className="card-title">缓存的隐藏成本</div>
          <p className="card-sub" style={{ margin: 0, lineHeight: 1.8 }}>
            部分厂商按小时收缓存存储费（火山方舟 0.017 元 / 百万 token / 小时），
            长期挂载大 system prompt 会持续累积。DeepSeek 的硬盘缓存不额外收存储费。
            也要注意最小缓存块粒度要求——内容太短可能根本命不中。
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 12,
        }}
      >
        <div className="card card-pad">
          <div className="card-title">套餐价怎么折算</div>
          <p className="card-sub" style={{ margin: 0 }}>
            量包额度 ÷ 月费 = 每百万 token 均价。因输入输出合并抵扣，按 3:1
            混合假设折算，实际以你的调用结构为准。
          </p>
        </div>
        <div className="card card-pad">
          <div className="card-title">套餐的坑</div>
          <p className="card-sub" style={{ margin: 0 }}>
            有有效期（多为 1 个月）、需手动激活、部分绑定指定模型、超额回落到按量价。折扣价以订单页为准。
          </p>
        </div>
        <div className="card card-pad">
          <div className="card-title">为什么单列一栏</div>
          <p className="card-sub" style={{ margin: 0 }}>
            按量价是单价，套餐价是总量承诺，两者不可直接比较。单列后可算「切换门槛」：月用量越过某值即应转套餐。
          </p>
        </div>
      </div>
    </>
  );
}
