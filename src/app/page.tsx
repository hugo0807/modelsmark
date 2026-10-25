import Link from 'next/link';
import { loadDataset, getChannelMap, getModelMap } from '../lib/data';
import { formatCny, formatDelta, deltaColor, round2 } from '../lib/compute';

export default function HomePage() {
  const ds = loadDataset();
  const channelMap = getChannelMap();
  const modelMap = getModelMap();

  const payg = ds.prices.filter((p) => p.billingMode === 'payg');
  const packages = ds.prices.filter((p) => p.billingMode === 'package');

  // 最便宜按量价：每个模型只取官方渠道中最低的那一档
  const cheapestByModel = new Map<string, (typeof payg)[number]>();
  for (const p of payg) {
    if (channelMap.get(p.channelId)?.type !== 'first_party') continue;
    if (p.blendedCny === null) continue;
    const cur = cheapestByModel.get(p.modelId);
    if (!cur || p.blendedCny < (cur.blendedCny ?? Infinity)) {
      cheapestByModel.set(p.modelId, p);
    }
  }
  const cheapest = [...cheapestByModel.values()].sort(
    (a, b) => (a.blendedCny ?? Infinity) - (b.blendedCny ?? Infinity)
  );

  // 性价比散点：智能指数 × 官方渠道最低混合价
  const scatter = ds.intelligence
    .map((i) => {
      if (i.index === null) return null;
      const official = cheapestByModel.get(i.modelId);
      if (!official?.blendedCny) return null;
      const model = modelMap.get(i.modelId);
      if (!model) return null;
      return {
        name: model.name,
        origin: model.origin,
        x: official.blendedCny,
        y: i.index,
        rank: i.rank,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 本周变动：从 changes.json 汇总
  const changes = ds.changes.slice(0, 8);

  return (
    <>
      <section className="page-head">
        <h1>全球模型 API 价格与能力基准</h1>
        <p>
          国内厂商官方价 + {ds.channels.filter((c) => c.type === 'cloud').length} 家云平台刊例价，
          与海外官方价按同一汇率对齐。每周自动更新。
        </p>
      </section>

      <section className="metrics">
        <div className="metric">
          <div className="metric-label">收录模型</div>
          <div className="metric-value">{ds.models.length}</div>
          <div className="metric-note">
            国内 {ds.models.filter((m) => m.origin === 'domestic').length} · 海外{' '}
            {ds.models.filter((m) => m.origin === 'overseas').length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">价格渠道</div>
          <div className="metric-value">{ds.channels.length}</div>
          <div className="metric-note">
            官方 {ds.channels.filter((c) => c.type === 'first_party').length} · 云平台{' '}
            {ds.channels.filter((c) => c.type === 'cloud').length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">价格记录</div>
          <div className="metric-value">{payg.length}</div>
          <div className="metric-note">另有 {packages.length} 条套餐价</div>
        </div>
        <div className="metric">
          <div className="metric-label">能力基准</div>
          <div className="metric-value">{ds.benchmarks.length}</div>
          <div className="metric-note">{ds.scores.length} 条分数记录</div>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div className="card card-pad">
          <div className="card-title">性价比矩阵</div>
          <p className="card-sub">
            横轴为官方渠道 3:1 混合价（人民币 / 每百万 token，对数轴），纵轴为综合智能指数。
            左上角 = 又强又便宜。
          </p>
          <ValueMatrix points={scatter} />
        </div>

        <div className="card card-pad">
          <div className="card-title">本周价格变动</div>
          <p className="card-sub">相对上次快照的同渠道刊例价</p>
          {changes.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '12px 0' }}>
              本期无价格变动
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {changes.map((c, i) => {
                const model = modelMap.get(c.modelId);
                const channel = channelMap.get(c.channelId);
                const label =
                  c.kind === 'added'
                    ? '新增'
                    : c.kind === 'removed'
                      ? '下架'
                      : c.kind === 'promo_started'
                        ? '促销'
                        : c.kind === 'promo_ended'
                          ? '促销结束'
                          : formatDelta(c.delta);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1, color: 'var(--color-secondary)' }}>
                      {model?.name ?? c.modelId} · {channel?.name ?? c.channelId}
                    </span>
                    <span className="num" style={{ color: 'var(--text-tertiary)' }}>
                      {c.fromCny !== null ? formatCny(c.fromCny) : '—'} →{' '}
                      {c.toCny !== null ? formatCny(c.toCny) : '—'}
                    </span>
                    <span
                      className="num"
                      style={{ width: 62, textAlign: 'right', color: deltaColor(c.delta) }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <div className="card-title">最便宜的按量价（3:1 混合价）</div>
          <p className="card-sub">取每个模型在官方渠道的最低刊例价，含人民币折算</p>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>模型</th>
                <th>厂商</th>
                <th className="right">输入</th>
                <th className="right">输出</th>
                <th className="right">3:1 混合价</th>
                <th className="right">智能指数</th>
                <th className="right">渠道溢价</th>
              </tr>
            </thead>
            <tbody>
              {cheapest.slice(0, 12).map((p) => {
                  const model = modelMap.get(p.modelId);
                  const intel = ds.intelligence.find((i) => i.modelId === p.modelId);
                  // 云平台溢价：同一模型在所有云平台的溢价率区间
                  const cloudPremiums = ds.prices
                    .filter(
                      (x) =>
                        x.modelId === p.modelId &&
                        x.billingMode === 'payg' &&
                        channelMap.get(x.channelId)?.type === 'cloud' &&
                        x.premiumRate !== null
                    )
                    .map((x) => x.premiumRate!);
                  const premiumText =
                    cloudPremiums.length === 0
                      ? '—'
                      : cloudPremiums.length === 1
                        ? formatDelta(cloudPremiums[0])
                        : `${formatDelta(Math.min(...cloudPremiums))} ~ ${formatDelta(Math.max(...cloudPremiums))}`;
                  return (
                    <tr key={`${p.modelId}-${p.channelId}-${p.tierLabel}`}>
                      <td>
                        <Link href={`/models/${p.modelId}`} style={{ fontWeight: 500 }}>
                          <span
                            className={`dot ${model?.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'}`}
                            style={{ marginRight: 6 }}
                          />
                          {model?.name ?? p.modelId}
                        </Link>
                        {p.tierLabel && (
                          <span className="tag" style={{ marginLeft: 7 }}>
                            {p.tierLabel}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{model?.vendor}</td>
                      <td className="right num">{formatCny(p.inputCny)}</td>
                      <td className="right num">{formatCny(p.outputCny)}</td>
                      <td className="right num" style={{ fontWeight: 600 }}>
                        {formatCny(p.blendedCny)}
                      </td>
                      <td className="right num">
                        {intel?.index ?? (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                            未收录
                          </span>
                        )}
                      </td>
                      <td className="right num">
                        {premiumText === '—' ? (
                          <span style={{ color: 'var(--text-tertiary)' }}>无转售</span>
                        ) : (
                          <span
                            className={
                              cloudPremiums.every((x) => x > 0)
                                ? 'up'
                                : cloudPremiums.every((x) => x < 0)
                                  ? 'down'
                                  : 'flat'
                            }
                          >
                            {premiumText}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/**
 * 性价比矩阵散点图。
 * 用纯 SVG 绘制，避免引入图表库依赖 —— 静态站更轻。
 */
function ValueMatrix({
  points,
}: {
  points: { name: string; origin: string; x: number; y: number; rank: number | null }[];
}) {
  const W = 560;
  const H = 320;
  const PAD = { top: 14, right: 16, bottom: 34, left: 42 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // 对数轴映射
  const xs = points.map((p) => p.x);
  const xMin = Math.log10(Math.max(0.5, Math.min(...xs) * 0.7));
  const xMax = Math.log10(Math.max(...xs) * 1.4);
  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys) - 3;
  const yMax = Math.max(...ys) + 3;

  const sx = (v: number) => PAD.left + ((Math.log10(v) - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const gridVals = [1, 3, 10, 30, 100, 300];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}>
        <title>性价比矩阵</title>
        <desc>散点图：横轴为官方渠道 3:1 混合价（对数轴），纵轴为综合智能指数，左上角为高性价比模型</desc>

        {gridVals
          .filter((v) => Math.log10(v) >= xMin && Math.log10(v) <= xMax)
          .map((v) => (
            <g key={v}>
              <line
                x1={sx(v)}
                y1={PAD.top}
                x2={sx(v)}
                y2={PAD.top + plotH}
                stroke="rgba(0,0,0,0.07)"
                strokeWidth="0.5"
              />
              <text
                x={sx(v)}
                y={PAD.top + plotH + 15}
                textAnchor="middle"
                fontSize="10"
                fill="#8f8e88"
              >
                ¥{v}
              </text>
            </g>
          ))}

        {Array.from({ length: 5 }, (_, i) => {
          const v = yMin + ((yMax - yMin) / 4) * i;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={sy(v)}
                x2={PAD.left + plotW}
                y2={sy(v)}
                stroke="rgba(0,0,0,0.07)"
                strokeWidth="0.5"
              />
              <text
                x={PAD.left - 6}
                y={sy(v)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize="10"
                fill="#8f8e88"
              >
                {v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {points.map((p) => (
          <g key={p.name}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={5}
              fill={p.origin === 'domestic' ? '#d85a30' : '#5f5e5a'}
            >
              <title>{`${p.name}：${formatCny(p.x)}/M 混合价，指数 ${p.y}${p.rank ? `，第 ${p.rank} 名` : ''}`}</title>
            </circle>
          </g>
        ))}

        <text
          x={PAD.left + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#8f8e88"
        >
          官方渠道 3:1 混合价（元 / 每百万 token，对数轴）
        </text>
        <text
          x={11}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize="10"
          fill="#8f8e88"
          transform={`rotate(-90 11 ${PAD.top + plotH / 2})`}
        >
          综合智能指数
        </text>
      </svg>

      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginTop: 6,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="dot dot-overseas" /> 海外模型
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="dot dot-domestic" /> 国内模型
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }}>
          悬停查看数值
        </span>
      </div>
    </div>
  );
}
