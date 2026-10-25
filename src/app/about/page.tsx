import { loadDataset } from '../../lib/data';
import type { BenchmarkCategory } from '../../lib/types';

export const metadata = { title: '标准说明 — ModelsMark' };

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

export default function AboutPage() {
  const ds = loadDataset();

  const grouped = new Map<BenchmarkCategory, typeof ds.benchmarks>();
  for (const b of ds.benchmarks) {
    if (!grouped.has(b.category)) grouped.set(b.category, []);
    grouped.get(b.category)!.push(b);
  }

  return (
    <>
      <section className="page-head">
        <h1>标准说明</h1>
        <p>每个基准测什么 · 为什么重要 · 什么时候该看它</p>
      </section>

      <div
        className="card card-pad"
        style={{ marginBottom: 20, background: 'var(--bg-subtle)' }}
      >
        <div className="card-title">读分之前先知道三件事</div>
        <ol
          style={{
            margin: '10px 0 0',
            paddingLeft: 20,
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.9,
          }}
        >
          <li>
            所有分数来自第三方评测机构（Artificial Analysis
            等），ModelsMark 只做聚合与可视化，不自行跑分，因此无法保证与厂商自测完全一致。
          </li>
          <li>
            推理档位差异会显著影响分数。本页所有数据统一采用「拉满」档位，但 Claude
            系列可能含 fallback 调用、GPT 系列可能计入 cyberguards 拦截。
          </li>
          <li>
            单一基准不能代表综合能力。请用「性价比矩阵」和「每任务成本」交叉判断，而非只看某一项排名。
          </li>
        </ol>
      </div>

      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((cat) => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--border)',
            }}
          >
            {CATEGORY_LABEL[cat]}
            <span
              style={{
                marginLeft: 8,
                fontWeight: 400,
                fontSize: 12,
                color: 'var(--text-tertiary)',
              }}
            >
              {grouped.get(cat)!.length} 项
            </span>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {grouped.get(cat)!.map((b) => (
              <div className="bench-expl" key={b.id} id={b.id}>
                <h3>
                  {b.name}
                  <span className="cat">{CATEGORY_LABEL[b.category]}</span>
                  {b.vendorOwned && (
                    <span className="tag" style={{ marginLeft: 8 }}>
                      厂商自建
                    </span>
                  )}
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        fontWeight: 400,
                        color: 'var(--accent)',
                      }}
                    >
                      官方链接 ↗
                    </a>
                  )}
                </h3>
                <p style={{ fontWeight: 500, color: 'var(--text)' }}>{b.summary}</p>
                <p>{b.explanation}</p>
                <div className="use">
                  <strong>什么时候该看它：</strong>
                  {b.useCase}
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    　·　计分方式：{b.scoring}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="card-title">数据来源与更新机制</div>
        <p className="card-sub" style={{ margin: 0, lineHeight: 1.85 }}>
          <strong>价格</strong>
          ：国内模型取厂商官方定价页，另采集阿里云百炼、火山引擎方舟、腾讯云 TokenHub、百度智能云千帆、移动云、天翼云、联通云、七牛云、硅基流动共 10 家云平台的刊例价；
          海外模型取 Anthropic、OpenAI、Google Gemini、xAI 官网。海外价格按央行公布的人民币汇率中间价折算为人民币展示。
          <br />
          <strong>跑分</strong>
          ：来自 Artificial Analysis 等第三方评测机构，采用各模型推理档位拉满的设定。
          <br />
          <strong>更新</strong>
          ：每周一 06:00 自动抓取，生成新快照并重新发布。若某渠道抓取失败，系统保留其上期数据并标注实际数据日期，不会用空值覆盖。
          <br />
          <strong>免责</strong>
          ：价格以厂商官网刊例价为准，不含可能的税费与活动价；实际账单以采购合同与订单页为准。
        </p>
      </div>
    </>
  );
}
