import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPackages, getAllPayg, loadDataset } from '../../lib/data';
import { CHANNEL_TYPE_LABEL, type ChannelType } from '../../lib/types';

export const metadata: Metadata = {
  title: '套餐对比 — ModelsMark',
  description:
    '各渠道 Token Plan / 资源包 / Agent Plan 套餐横向对比：额度、周期、价格、折合单价。',
};

/** 数字块：整数右对齐 + 小数左对齐，使同列各行的小数点连成一条竖线 */
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

function quotaText(quota: number | null | undefined, unit: string | undefined): string {
  if (unit === 'calls') return quota == null ? '—' : `${quota.toLocaleString('zh-CN')} 次`;
  if (unit === 'credits') {
    return quota == null ? '积分制（不设单一额度）' : `${quota.toLocaleString('zh-CN')} credits`;
  }
  if (unit === 'mixed') return quota == null ? '积分制（不设单一额度）' : `${quota.toLocaleString('zh-CN')} tokens`;
  if (quota == null) return '—';
  if (quota >= 1_000_000_000) return `${(quota / 1_000_000_000).toFixed(2)} 亿 tokens`;
  if (quota >= 10_000) return `${(quota / 10_000).toFixed(0)} 万 tokens`;
  return `${quota.toLocaleString('zh-CN')} tokens`;
}

export default function PlansPage() {
  const ds = loadDataset();
  const packages = getAllPackages();
  const payg = getAllPayg();
  const channelMap = new Map(ds.channels.map((c) => [c.id, c]));

  // 三类套餐
  const tokenPlans = packages.filter((p) => p.packageQuotaUnit === 'tokens');
  const callPlans = packages.filter((p) => p.packageQuotaUnit === 'calls');
  // 积分制：mixed（不限单一额度） + credits（如联通云团队版按 credits 结算）
  const mixedPlans = packages.filter(
    (p) => p.packageQuotaUnit === 'mixed' || p.packageQuotaUnit === 'credits'
  );

  // 刊例价对照：取该模型在官方渠道的标准档混合价
  const officialPrice = new Map<string, number>();
  for (const p of payg) {
    if (channelMap.get(p.channelId)?.type !== 'official') continue;
    if (p.tier.kind !== 'none' || p.tierLabel) continue;
    if (p.blendedCny == null) continue;
    const prev = officialPrice.get(p.modelId);
    if (prev == null || p.blendedCny < prev) officialPrice.set(p.modelId, p.blendedCny);
  }

  const modelName = (id: string) => ds.models.find((m) => m.id === id)?.name ?? id;
  /**
   * 套餐的「适用模型」列：
   * 多数套餐挂在具体模型下，直接显示模型名；
   * 少数是「打包型」套餐（载体模型），应显示其覆盖范围说明。
   */
  const scopeText = (p: { modelId: string; packageIncludes?: string | null }) => {
    const m = ds.models.find((x) => x.id === p.modelId);
    if (m && !/Token Plan$/.test(m.name) && !/套餐$/.test(m.name)) return modelName(p.modelId);
    return p.packageIncludes ?? modelName(p.modelId);
  };

  // 折合对照表：所有能折算出 ¥/M tokens 的套餐
  const comparable = packages
    .filter((p) => p.packageBlendedCny != null)
    .map((p) => {
      const list = officialPrice.get(p.modelId);
      const ratio = list ? p.packageBlendedCny! / list : null;
      return { p, list, ratio };
    })
    .sort((a, b) => (a.p.packageBlendedCny ?? 0) - (b.p.packageBlendedCny ?? 0));

  const lowestBlend = comparable.length ? comparable[0].p.packageBlendedCny! : null;

  return (
    <>
      {/*
       * 删掉原来的大标题区：导航已经写明这是哪个页面，
       * 上面再复述一遍「套餐对比 —— 各渠道的 Token Plan…」属于纯占位文字。
       * 这个页面用户只看一件事：套餐划不划算。
       * h1 用 sr-only 保留，只为无障碍与 SEO，不占版面。
       */}
      <h1 className="sr-only">套餐对比</h1>

      {/* ── 指标卡 ── */}
      <div className="metrics">
        <div className="metric">
          <div className="metric-label">套餐总数</div>
          <div className="metric-value">{packages.length}</div>
          <div className="metric-note">
            Token 制 {tokenPlans.length} · 次数制 {callPlans.length} · 积分制 {mixedPlans.length}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">最低折合单价</div>
          <div className="metric-value">
            <Num v={lowestBlend ?? null} dec={3} prefix="¥" />
          </div>
          <div className="metric-note">
            {comparable.length > 0
              ? `${comparable[0].p.channel?.name} · ${modelName(comparable[0].p.modelId)}`
              : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">覆盖渠道</div>
          <div className="metric-value">{new Set(packages.map((p) => p.channelId)).size}</div>
          <div className="metric-note">
            {[
              ...new Set(
                packages.map((p) => p.channel?.type).filter(Boolean) as ChannelType[]
              ),
            ]
              .map((t) => CHANNEL_TYPE_LABEL[t])
              .join(' / ')}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">快照</div>
          <div className="metric-value">{ds.snapshotId}</div>
          <div className="metric-note">数据更新 {ds.updatedAt}</div>
        </div>
      </div>

      {/* ── 表 1：Token 口径套餐 ── */}
      <div className="section-title">
        Token 口径套餐 <span className="sub">额度以 tokens 计，可直接折算 ¥/M tokens</span>
      </div>
      <div className="table-scroll table-wide card">
        <table className="data">
          <thead>
            <tr>
              <th className="nw">渠道</th>
              <th className="center nw">渠道属性</th>
              <th className="nw">套餐名称</th>
              <th className="nw">适用模型</th>
              <th className="right nw">额度</th>
              <th className="nw">周期</th>
              <th className="right nw">价格</th>
              <th className="right nw">折合 ¥/M tokens</th>
              <th className="right nw">对比刊例价</th>
              <th className="nw">条件</th>
              <th className="nw">来源</th>
            </tr>
          </thead>
          <tbody>
            {tokenPlans.map((p, i) => {
              const list = officialPrice.get(p.modelId);
              const ratio = list && p.packageBlendedCny ? p.packageBlendedCny / list : null;
              return (
                <tr key={`${p.modelId}-${p.channelId}-${i}`}>
                  <td>{p.channel?.name}</td>
                  <td className="center">
                    <span className={`badge ${BADGE[p.channel?.type ?? 'third']}`}>
                      {CHANNEL_TYPE_LABEL[p.channel?.type ?? 'third']}
                    </span>
                  </td>
                  <td className="pkg-name">
                    {p.packageTierName ?? '—'}
                    {p.packageManualActivation ? (
                      <span className="tag tag-plan">需手动开通</span>
                    ) : null}
                  </td>
                  <td className="m-sub">{scopeText(p)}</td>
                  <td className="right num nw">{quotaText(p.packageQuota, p.packageQuotaUnit)}</td>
                  <td>{p.packagePeriod ?? '—'}</td>
                  <td className="right num">
                    <Num v={p.packagePriceCny} prefix="¥" />
                  </td>
                  <td className="right num" style={{ fontWeight: 600 }}>
                    <Num v={p.packageBlendedCny} dec={3} prefix="¥" />
                  </td>
                  <td className="right num">
                    {ratio == null ? (
                      '—'
                    ) : ratio < 1 ? (
                      <span className="down num">{Math.round((1 - ratio) * 100)}%↓</span>
                    ) : (
                      <span className="up num">+{Math.round((ratio - 1) * 100)}%</span>
                    )}
                  </td>
                  <td className="m-sub nw">{p.note ? p.note.slice(0, 60) : '—'}</td>
                  <td>
                    <a
                      className="src-link"
                      href={p.evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      官网 ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── 表 2：按次数计的套餐 ── */}
      <div className="section-title">
        按次数计的套餐 <span className="sub">Agent Plan 等按调用次数结算，无法折算为 ¥/M tokens</span>
      </div>
      {callPlans.length > 0 ? (
        <div className="table-scroll table-wide card">
          <table className="data">
            <thead>
              <tr>
                <th className="nw">渠道</th>
                <th className="center nw">渠道属性</th>
                <th className="nw">套餐名称</th>
                <th className="nw">适用模型</th>
                <th className="right nw">额度</th>
                <th className="nw">周期</th>
                <th className="right nw">价格</th>
                <th className="right nw">折合 ¥/次</th>
                <th className="nw">包含能力</th>
                <th className="nw">条件</th>
                <th className="nw">来源</th>
              </tr>
            </thead>
            <tbody>
              {callPlans.map((p, i) => (
                <tr key={`${p.modelId}-${p.channelId}-${i}`}>
                  <td>{p.channel?.name}</td>
                  <td className="center">
                    <span className={`badge ${BADGE[p.channel?.type ?? 'third']}`}>
                      {CHANNEL_TYPE_LABEL[p.channel?.type ?? 'third']}
                    </span>
                  </td>
                  <td className="pkg-name">{p.packageTierName ?? '—'}</td>
                  <td className="m-sub">{scopeText(p)}</td>
                  <td className="right num nw">{quotaText(p.packageCalls, 'calls')}</td>
                  <td>{p.packagePeriod ?? '—'}</td>
                  <td className="right num">
                    <Num v={p.packagePriceCny} prefix="¥" />
                  </td>
                  <td className="right num" style={{ fontWeight: 600 }}>
                    <Num v={p.packagePerCallCny} dec={4} prefix="¥" />
                  </td>
                  <td className="m-sub nw">{p.packageIncludes ?? '—'}</td>
                  <td className="m-sub nw">{p.note ? p.note.slice(0, 50) : '—'}</td>
                  <td>
                    <a
                      className="src-link"
                      href={p.evidence.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      官网 ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty-note">
          本期数据中暂无按调用次数计价的套餐。火山方舟 Agent Plan、阿里云 Agent Plan
          等按次数计的产品，官方未在定价页公开其按次单价表，故不收录。
        </div>
      )}

      {/* ── 表 3：积分制套餐 ── */}
      {mixedPlans.length > 0 ? (
        <>
          <div className="section-title">
            积分制套餐 <span className="sub">
              按积分扣减，不同模型抵扣系数不同，无法直接折算为统一单价
            </span>
          </div>
          <div className="table-scroll table-wide card">
            <table className="data">
              <thead>
                <tr>
                  <th className="nw">渠道</th>
                  <th className="center nw">渠道属性</th>
                  <th className="nw">套餐名称</th>
                  <th className="nw">适用模型</th>
                  <th className="right nw">价格</th>
                  <th className="nw">周期</th>
                  <th className="nw">额度口径</th>
                  <th className="nw">说明</th>
                  <th className="nw">来源</th>
                </tr>
              </thead>
              <tbody>
                {mixedPlans.map((p, i) => (
                  <tr key={`${p.modelId}-${p.channelId}-${i}`}>
                    <td>{p.channel?.name}</td>
                    <td className="center">
                      <span className={`badge ${BADGE[p.channel?.type ?? 'third']}`}>
                        {CHANNEL_TYPE_LABEL[p.channel?.type ?? 'third']}
                      </span>
                    </td>
                    <td className="pkg-name">{p.packageTierName ?? '—'}</td>
                    <td className="m-sub">{scopeText(p)}</td>
                    <td className="right num">
                      <Num v={p.packagePriceCny} prefix="¥" />
                    </td>
                    <td>{p.packagePeriod ?? '—'}</td>
                    <td className="m-sub nw">积分制</td>
                    <td className="m-sub">{p.note ? p.note.slice(0, 90) : '—'}</td>
                    <td>
                      <a
                        className="src-link"
                        href={p.evidence.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        官网 ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {/* ── 表 4：折合单价对照 ── */}
      <div className="section-title">
        折合单价对照 <span className="sub">套餐折合价 vs 该模型官方刊例价，倍率越低越划算</span>
      </div>
      <div className="table-scroll table-wide card">
        <table className="data">
          <thead>
            <tr>
              <th className="nw">渠道</th>
              <th className="nw">套餐</th>
              <th className="nw">适用模型</th>
              <th className="right nw">套餐折合 ¥/M</th>
              <th className="right nw">官方刊例价 ¥/M</th>
              <th className="right nw">相当于</th>
              <th className="nw">结论</th>
            </tr>
          </thead>
          <tbody>
            {comparable.map(({ p, list, ratio }) => (
              <tr key={`${p.modelId}-${p.channelId}-${p.packageTierName}`}>
                <td>{p.channel?.name}</td>
                <td className="pkg-name">{p.packageTierName ?? '—'}</td>
                <td className="m-sub">{modelName(p.modelId)}</td>
                <td className="right num" style={{ fontWeight: 600 }}>
                  <Num v={p.packageBlendedCny} dec={3} prefix="¥" />
                </td>
                <td className="right num">
                  <Num v={list} prefix="¥" />
                </td>
                <td className="right num">
                  {ratio == null ? (
                    '—'
                  ) : (
                    <span className={ratio <= 1 ? 'down num' : 'up num'}>
                      {(ratio * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="m-sub">
                  {ratio == null
                    ? '无官方价可对照'
                    : ratio <= 0.5
                      ? '约为刊例价一半，明显更划算'
                      : ratio <= 0.9
                        ? '低于刊例价，值得考虑'
                        : ratio <= 1
                          ? '与刊例价持平'
                          : '高于刊例价，不建议用套餐替代按量'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="footnote">
        <p>
          <strong>口径说明</strong>
          ：折合单价 = 套餐价格 ÷ 套餐额度 × 1,000,000，与按量刊例价同为「¥ / 百万 tokens」。
          输入输出合并抵扣的套餐按总额度均摊，不区分输入输出。
        </p>
        <p>
          <strong>未收录项</strong>
          ：官方未公开定价明细的产品（如按次数计的 Agent Plan 单价表、私有化部署报价）不予收录，
          避免出现无法溯源的数字。每一行都可点击「官网 ↗」回到原始定价页核验。
        </p>
      </div>
    </>
  );
}
