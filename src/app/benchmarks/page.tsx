import type { Metadata } from 'next';

import { loadDataset } from '../../lib/data';
import type { BenchmarkCategory } from '../../lib/types';
import { fmtInt } from '../../lib/format';
import {
  BenchmarkBrowser,
  type CategoryChip,
} from '../../components/bench/BenchmarkBrowser';
import type { BenchItem } from '../../components/bench/BenchCard';

export const metadata: Metadata = {
  title: '能力榜 — ModelsMark',
  description:
    '按基准看模型排名：编码、Agent、知识推理、文档办公、图形图表、垂直行业。可只看国内或只看海外。',
};

const CATEGORY_LABEL: Record<BenchmarkCategory, string> = {
  coding: '编码工程',
  agent: 'Agent 能力',
  knowledge: '知识推理',
  document: '文档办公',
  chart: '图形图表',
  industry: '垂直行业',
};

const CATEGORY_ORDER: BenchmarkCategory[] = [
  'coding',
  'agent',
  'knowledge',
  'document',
  'chart',
  'industry',
];

/**
 * 能力榜只回答一个问题：**谁在什么能力上强**。
 *
 * 排名按分数降序，颜色区分归属地而不是能力优劣；
 * 每项基准的解释放在卡片内展开，不跳页。
 */
export default function BenchmarksPage() {
  const ds = loadDataset();

  const modelById = new Map(ds.models.map((m) => [m.id, m]));
  const rowsByBench = new Map<string, BenchItem['rows']>();
  for (const s of ds.scores) {
    const m = modelById.get(s.modelId);
    if (!m) continue;
    const list = rowsByBench.get(s.benchmarkId) ?? [];
    list.push({
      modelId: m.id,
      name: m.name,
      vendor: m.vendor,
      origin: m.origin,
      value: s.value,
    });
    rowsByBench.set(s.benchmarkId, list);
  }

  const items: BenchItem[] = ds.benchmarks
    .map((b) => ({
      id: b.id,
      name: b.name,
      category: b.category,
      scale: b.scale,
      vendorOwned: b.vendorOwned,
      url: b.url,
      summary: b.summary,
      explanation: b.explanation,
      useCase: b.useCase,
      scoring: b.scoring,
      rows: (rowsByBench.get(b.id) ?? []).sort((x, y) => y.value - x.value),
    }))
    .sort((a, b) => {
      const d = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });

  const chips: CategoryChip[] = [
    { key: 'all', label: '全部', count: items.length },
    ...CATEGORY_ORDER.filter((c) => items.some((b) => b.category === c)).map((c) => ({
      key: c,
      label: CATEGORY_LABEL[c],
      count: items.filter((b) => b.category === c).length,
    })),
  ];

  const scoreCount = ds.scores.length;
  const scoredModels = new Set(ds.scores.map((s) => s.modelId)).size;

  return (
    <>
      <h1 className="sr-only">能力榜</h1>

      <div className="trustbar">
        <span>
          <b>{fmtInt(items.length)}</b>项基准
        </span>
        <span>
          <b>{fmtInt(scoreCount)}</b>条分数
        </span>
        <span>
          <b>{fmtInt(scoredModels)}</b>个模型参评
        </span>
        <span className="stamp">分数来自第三方机构 · 本站不自行跑分</span>
      </div>

      <div className="section-title">
        谁在什么能力上强 <span className="sub">点卡片右上角看这项基准到底测什么</span>
      </div>

      <BenchmarkBrowser items={items} categories={chips} />

      <div className="footnote">
        <p>
          <strong>怎么读</strong>：所有模型推理档位统一拉满；颜色只区分国内 / 海外，不代表能力优劣。
          Claude 系列分数可能含回退调用（fallback），GPT 系列可能计入内容安全拦截（cyberguards）。
        </p>
        <p>
          <strong>别只看一项</strong>：单一基准不能代表综合能力。选模型时请回到首页的性价比矩阵，
          把「能力指数」与「3:1 混合价」一起看。
        </p>
      </div>
    </>
  );
}
