import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllModelSlugs, getModelDetail } from '../../../lib/data';
import { cacheDiscount, formatDiscount, isStandardTier } from '../../../lib/compute';
import {
  CHANNEL_TYPE_DESC,
  CHANNEL_TYPE_LABEL,
  type ChannelType,
} from '../../../lib/types';

export const metadata = { title: '模型详情 — ModelsMark' };

/** 静态导出：枚举所有模型路由 */
export function generateStaticParams() {
  return getAllModelSlugs().map((slug) => ({ slug }));
}

/** 数字块：整数右对齐 + 小数左对齐，小数点连成竖线 */
function Num({
  v,
  dec = 2,
  prefix,
  suffix,
}: {
  v: number | null | undefined;
  dec?: number;
  prefix?: string;
  suffix?: string;
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
      {suffix ? <span className="s">{suffix}</span> : null}
    </>
  );
}

const BADGE: Record<ChannelType, string> = {
  official: 'badge-official',
  cloud: 'badge-cloud',
  carrier: 'badge-carrier',
  third: 'badge-third',
};

/**
 * 关键维度卡：标题右侧的「?」悬停后展开口径说明。
 *
 * 这四个数字对不熟悉比价口径的人来说是不可解读的 ——
 * 「云厂商均价 13.00」到底是贵还是便宜？「官方价」为什么是空的？
 * 所以每个维度都必须能点出它的定义、算法与适用边界。
 */
function MetricCard({
  label,
  value,
  note,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  hint: { title: string; body: React.ReactNode; limit?: string };
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span className="metric-info" aria-hidden>
          ?
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">{note}</div>
      <div className="metric-hint">
        <span className="hint-title">{hint.title}</span>
        {hint.body}
        {hint.limit ? <span className="hint-limit">{hint.limit}</span> : null}
      </div>
    </div>
  );
}

export default async function ModelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = getModelDetail(slug);
  if (!detail) notFound();

  const { model, paygPrices, packagePrices, scores, intelligence } = detail;

  // 按渠道类型分组（4 类分隔带）
  const groups: Array<{ type: ChannelType; rows: typeof paygPrices }> = (
    ['official', 'cloud', 'carrier', 'third'] as ChannelType[]
  )
    .map((type) => ({
      type,
      rows: paygPrices.filter((p) => p.channel?.type === type),
    }))
    .filter((g) => g.rows.length > 0);

  const withBlend = paygPrices.filter((p) => p.blendedCny != null);
  const lowest = withBlend.length ? withBlend[0] : null;

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
        <MetricCard
          label="最低混合价"
          value={<Num v={detail.lowestBlendedCny} prefix="¥" />}
          note={
            detail.lowestChannelName ? (
              <>
                {detail.lowestChannelName} · 实际能拿到的最低价
              </>
            ) : (
              '暂无可比报价'
            )
          }
          hint={{
            title: '最低混合价',
            body: (
              <>
                全渠道里<b>最低</b>的那条报价，按 <b>输入 : 输出 = 3 : 1</b> 加权换算成
                「元 / 百万 tokens」。相比均价，它回答的是「同样用量在哪家买最省」。
              </>
            ),
            limit:
              '已排除批量推理、闲时折扣、长上下文溢价等不可复现的档位；免费模型与限流特惠价不参与计算。',
          }}
        />
        <MetricCard
          label="官方刊例价"
          value={<Num v={detail.officialBlendedCny} prefix="¥" />}
          note="厂商第一方直销价，比价的唯一基准"
          hint={{
            title: '官方刊例价',
            body: (
              <>
                模型厂商<b>自己</b>在官网卖的价格（如 OpenAI、Anthropic、智谱的直营渠道）。
                其他所有渠道相对它的溢价或折扣，才是有意义的比较。
              </>
            ),
            limit:
              '只有厂商第一方上架的模型才有此值。第三方模型或云厂商独家上架的版本没有官方价，这一栏留空属于正常情况。',
          }}
        />
        <MetricCard
          label="云厂商均价"
          value={<Num v={detail.cloudAvgCny} prefix="¥" />}
          note={`${detail.cloudCount} 家云厂商均值 · 3:1 混合价`}
          hint={{
            title: '云厂商均价',
            body: (
              <>
                各大云平台代售该模型的价格<b>算术平均</b>（阿里百炼、火山方舟、腾讯混元等）。
                反映的是「正规渠道」买这款模型的普遍价位。
              </>
            ),
            limit:
              '同一模型不同云厂商的价差可能超过 10 倍，平均值会掩盖这种差异 —— 想省钱应直接看「最低混合价」。',
          }}
        />
        <MetricCard
          label="综合智能指数"
          value={
            intelligence?.index ?? (
              <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-tertiary)' }}>
                未收录
              </span>
            )
          }
          note={
            intelligence?.rank ? `全球第 ${intelligence.rank} 名` : '评测机构暂未覆盖'
          }
          hint={{
            title: '综合智能指数',
            body: (
              <>
                第三方评测机构给出的<b>能力刻度</b>（Artificial Analysis 综合智能分）。
                有了它，价格才能和能力强弱放到一起比 —— 即「每一分能力要花多少钱」。
              </>
            ),
            limit:
              '只覆盖评测机构已收录的模型。未收录不代表能力差，只是缺少可比的公开数据。',
          }}
        />
      </div>

      {/* ── 各渠道报价（单张连续表 + 4 类分隔带）── */}
      <div className="section-title">
        各渠道报价 <span className="sub">按官方 / 云厂商 / 运营商 / 第三方分组，每行附来源</span>
      </div>
      <div className="table-scroll card" style={{ marginBottom: 12 }}>
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 190 }}>渠道</th>
              <th className="right">输入</th>
              <th className="right">缓存读</th>
              <th className="right">输出</th>
              <th className="right">3:1 混合价</th>
              <th className="right">对比官方</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              // 本组最低只取标准档：批量/低优/闲时等折扣档不参与，避免误导性低价
              const stdRows = g.rows.filter((r) => isStandardTier(r));
              const lowRow = (stdRows.length ? stdRows : g.rows)
                .slice()
                .sort((a, b) => (a.blendedCny ?? Infinity) - (b.blendedCny ?? Infinity))[0];
              return (
                <Fragment key={g.type}>
                  <tr className="chan-band">
                    <td colSpan={7}>
                      <span className={`badge ${BADGE[g.type]}`}>{CHANNEL_TYPE_LABEL[g.type]}</span>
                      <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>
                        {CHANNEL_TYPE_DESC[g.type]}
                      </span>
                      <span style={{ float: 'right', fontWeight: 400, color: 'var(--text-tertiary)' }}>
                        {g.rows.length} 家 · 标准档最低 {lowRow.channel?.name} ¥
                        {lowRow.blendedCny?.toFixed(2)}/M
                      </span>
                    </td>
                  </tr>
                  {g.rows.map((p, i) => (
                    <tr key={`${g.type}-${p.channelId}-${p.tierLabel ?? 'std'}-${i}`}>
                      <td style={{ fontWeight: 500 }}>
                        {p.channel?.name}
                        {p.tierLabel ? (
                          <span className="tag" style={{ marginLeft: 7 }}>
                            {p.tierLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className="right num">
                        <Num v={p.inputCny} />
                      </td>
                      <td className="right num" style={{ color: 'var(--text-secondary)' }}>
                        <Num v={p.cacheReadCny} />
                      </td>
                      <td className="right num">
                        <Num v={p.outputCny} />
                      </td>
                      <td className="right num" style={{ fontWeight: 600 }}>
                        <Num v={p.blendedCny} prefix="¥" />
                      </td>
                      <td className="right num">
                        {p.premiumRate === null ? (
                          <span className="flat">—</span>
                        ) : p.premiumRate === 0 ? (
                          <span className="flat">基准</span>
                        ) : p.premiumRate < 0 ? (
                          <span className="down num">
                            {Math.abs(Math.round(p.premiumRate * 100))}%
                          </span>
                        ) : (
                          <span className="up num">+{Math.round(p.premiumRate * 100)}%</span>
                        )}
                      </td>
                      <td>
                        <a
                          className="src-link"
                          href={p.evidence.sourceUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          title={p.evidence.quote.slice(0, 160)}
                        >
                          原文 ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 套餐跳转卡 ── */}
      {packagePrices.length > 0 ? (
        <div className="card card-pad" style={{ marginBottom: 12 }}>
          <div className="card-title">
            该模型有 {packagePrices.length} 个套餐方案
          </div>
          <p className="card-sub">
            套餐按量价口径不同（预付费额度 / 按次 / 积分制），折合单价统一为 ¥/M tokens
            后才可与刊例价比较。完整对比见套餐页。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {packagePrices.slice(0, 4).map((p, i) => (
              <span key={i} className="filter" style={{ cursor: 'default' }}>
                {p.channel?.name} · {p.packageTierName ?? p.tierLabel ?? '套餐'}
                {p.packageBlendedCny != null ? (
                  <span className="num" style={{ marginLeft: 6, fontWeight: 600 }}>
                    ¥{p.packageBlendedCny.toFixed(3)}/M
                  </span>
                ) : null}
              </span>
            ))}
            <Link href="/plans" className="filter" style={{ fontWeight: 600 }}>
              查看全部套餐对比 →
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── 能力基准 ── */}
      {scores.length > 0 ? (
        <>
          <div className="section-title">
            能力基准 <span className="sub">每项标注评测机构与快照日期</span>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>基准</th>
                  <th className="right">分数</th>
                  <th className="right">量纲</th>
                  <th className="right">缓存折扣</th>
                  <th>来源</th>
                  <th>口径标注</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.benchmarkId}>
                    <td>
                      <Link href={`/about#${s.benchmarkId}`} style={{ color: 'var(--accent)' }}>
                        {s.benchmark?.name ?? s.benchmarkId}
                      </Link>
                    </td>
                    <td className="right num" style={{ fontWeight: 600 }}>
                      {s.benchmark?.scale === 'Elo' ? Math.round(s.value) : s.value.toFixed(1)}
                    </td>
                    <td className="right" style={{ color: 'var(--text-secondary)' }}>
                      {s.benchmark?.scale}
                    </td>
                    <td className="right num">
                      {(() => {
                        const d = cacheDiscount(lowest ?? ({} as never));
                        return d === null ? (
                          <span className="flat">—</span>
                        ) : (
                          <span style={{ color: 'var(--down)' }}>↓ {formatDiscount(d)}</span>
                        );
                      })()}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {s.source}
                      {s.measuredAt ? ` · ${s.measuredAt}` : ''}
                    </td>
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
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {model.pricingUrl && (
          <a href={model.pricingUrl} target="_blank" rel="noreferrer" className="filter">
            官方定价页 ↗
          </a>
        )}
        {model.docsUrl && (
          <a href={model.docsUrl} target="_blank" rel="noreferrer" className="filter">
            官方文档 ↗
          </a>
        )}
        <Link href="/" className="filter">
          返回首页
        </Link>
        <Link href="/plans" className="filter">
          套餐对比
        </Link>
      </div>
    </>
  );
}
