import { loadDataset } from '../../lib/data';
import { BenchCard } from '../../components/BenchCard';
import type { BenchmarkCategory } from '../../lib/types';

export const metadata = { title: '能力榜 — ModelsMark' };

const CATEGORY_LABEL: Record<BenchmarkCategory, string> = {
  coding: '编码工程',
  agent: 'Agent 能力',
  knowledge: '知识推理',
  document: '文档办公',
  chart: '图形图表',
  industry: '垂直行业',
};

export default function BenchmarksPage() {
  const ds = loadDataset();

  // 有跑分数据的模型才进榜
  const scoredModelIds = new Set(ds.scores.map((s) => s.modelId));
  const models = ds.models.filter((m) => scoredModelIds.has(m.id));

  const grouped = new Map<BenchmarkCategory, typeof ds.benchmarks>();
  for (const b of ds.benchmarks) {
    if (!grouped.has(b.category)) grouped.set(b.category, []);
    grouped.get(b.category)!.push(b);
  }

  return (
    <>
      <section className="page-head">
        <h1>能力榜</h1>
        <p>
          {ds.benchmarks.length} 项基准 × {models.length} 个模型。所有模型推理档位拉满。
          分数来自第三方评测机构，ModelsMark 不自行跑分。
        </p>
      </section>

      <div className="filters">
        <span className="filter on">全部 {ds.benchmarks.length}</span>
        {[...grouped.entries()].map(([cat, list]) => (
          <span key={cat} className="filter">
            {CATEGORY_LABEL[cat]} {list.length}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
          颜色区分归属地，不代表能力优劣
        </span>
      </div>

      {[...grouped.entries()].map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {CATEGORY_LABEL[cat]}
            <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)' }}>
              {list.map((b) => b.name).join(' · ')}
            </span>
          </div>
          <div className="bench-grid">
            {list.map((b) => (
              <BenchCard
                key={b.id}
                benchmark={b}
                models={models}
                scores={ds.scores}
                showExplanation
              />
            ))}
          </div>
        </div>
      ))}

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <div className="card-title">口径声明</div>
        <p className="card-sub" style={{ margin: 0, lineHeight: 1.8 }}>
          所有模型推理档位均拉满；Claude 系列分数可能包含回退调用（fallback），GPT
          系列可能计入内容安全拦截（cyberguards）。分数取自第三方评测机构，ModelsMark
          只做聚合与可视化，不自行跑分，因此无法保证与厂商自测完全一致。
          <br />
          Kimi Code Bench 3.0 为月之暗面自建基准，其余 13 项为第三方机构评测。
        </p>
      </div>
    </>
  );
}
