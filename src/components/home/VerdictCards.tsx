/**
 * 结论三卡 —— 能力最强 / 价格最低 / 性价比最优。
 *
 * 为什么放在最前面：比价站最常见的问题是「给了全部数据，但没给结论」，
 * 用户要自己在上百行里找出该选谁。这里先把三个维度的最优解摆出来，
 * 再让下面的矩阵与长表提供证据。
 *
 * 数值与文案全部由 selectors.buildVerdicts 从数据算出，
 * 页面不承担任何「谁第一」的判断 —— 数据更新后结论自动跟着变。
 */

import Link from 'next/link';

import type { Verdict } from '../../lib/selectors';

export default function VerdictCards({ verdicts }: { verdicts: Verdict[] }) {
  if (!verdicts.length) return null;

  return (
    <div className="verdicts">
      {verdicts.map((v) => (
        <div className="verdict" key={v.key}>
          <div className="verdict-label">{v.title}</div>
          <div className="verdict-name">
            <Link href={`/models/${v.modelId}`}>{v.modelName}</Link>
          </div>
          <div className="verdict-metric">
            {v.metric}
            <span className="verdict-unit">{v.metricUnit}</span>
          </div>
          <div className="verdict-why">{v.reason}</div>
          <Link className="verdict-go" href={`/models/${v.modelId}`}>
            看各渠道报价 →
          </Link>
        </div>
      ))}
    </div>
  );
}
