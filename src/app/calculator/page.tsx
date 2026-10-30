import type { Metadata } from 'next';

import { loadDataset } from '../../lib/data';
import { buildModelRows } from '../../lib/selectors';
import { fmtInt } from '../../lib/format';
import { CostCalculator } from '../../components/calc/CostCalculator';

export const metadata: Metadata = {
  title: '成本估算 — ModelsMark',
  description:
    '输入月用量、输入输出配比与缓存命中率，直接算各模型一个月要花多少钱。价格取全渠道最低标准档。',
};

/**
 * 成本估算页只回答一个问题：**我用这么多，要花多少钱**。
 *
 * 单价对比（首页）解决不了这个问题 —— 用户真正拿到手的是一个月的账单，
 * 而账单取决于配比与缓存命中率，不是单价本身。
 */
export default function CalculatorPage() {
  const ds = loadDataset();
  const rows = buildModelRows(ds).filter((r) => r.input != null && r.output != null);

  return (
    <>
      <h1 className="sr-only">成本估算</h1>

      <div className="trustbar">
        <span>
          <b>{fmtInt(rows.length)}</b>个可算模型
        </span>
        <span>
          <b>{fmtInt(ds.channels.length)}</b>个渠道的最低价
        </span>
        <span className="stamp">快照 {ds.updatedAt} · 每周一 06:00 更新</span>
      </div>

      <div className="section-title">
        我用这么多，要花多少钱{' '}
        <span className="sub">价格取该模型全渠道最低标准档，改用量立刻重算</span>
      </div>

      <CostCalculator rows={rows} />
    </>
  );
}
