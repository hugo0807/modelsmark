import type { Metadata } from 'next';

import { loadDataset } from '../../lib/data';
import type { BenchmarkCategory } from '../../lib/types';
import { fmtInt } from '../../lib/format';
import { GLOSSARY, type GlossaryKey } from '../../lib/glossary';

export const metadata: Metadata = {
  title: '口径说明 — ModelsMark',
  description:
    '价格怎么算、基准测什么、数据从哪来、多久更新一次。全站所有数字的定义都写在这一页。',
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
 * 价格口径的展示顺序 —— 从「一个价格由什么组成」到「怎么比」再到「数据本身」。
 * 词条全部从 lib/glossary 取，页面不复制一遍文案：
 * 改口径只改一处，首页表头、模型页浮窗、本页说明会一起变。
 */
const PRICE_TERMS: GlossaryKey[] = [
  'input',
  'cacheRead',
  'output',
  'blended',
  'standardTier',
  'official',
  'spread',
  'package',
  'usdCny',
  'snapshot',
];

const INTELLIGENCE_TERMS: GlossaryKey[] = ['intelligence', 'value'];

/**
 * 口径唯一来源页。
 *
 * 之前同一套口径写在四处（首页 tooltip、模型页 hover、首页脚注、本页正文），
 * 改一处漏三处。现在正文由 GLOSSARY 渲染，页面上任何地方出现的口径提示
 * 都指向这里、且内容来自同一份定义。
 */
export default function AboutPage() {
  const ds = loadDataset();

  const grouped = new Map<BenchmarkCategory, typeof ds.benchmarks>();
  for (const b of ds.benchmarks) {
    if (!grouped.has(b.category)) grouped.set(b.category, []);
    grouped.get(b.category)!.push(b);
  }

  return (
    <>
      <h1 className="sr-only">口径说明</h1>

      <div className="trustbar">
        <span>
          <b>{fmtInt(ds.models.length)}</b>个模型
        </span>
        <span>
          <b>{fmtInt(ds.channels.length)}</b>个渠道
        </span>
        <span>
          <b>{fmtInt(ds.benchmarks.length)}</b>项基准
        </span>
        <span className="stamp">快照 {ds.updatedAt} · 每周一 06:00 更新</span>
      </div>

      <div className="card card-pad lead">
        <strong>ModelsMark 只做三件事</strong>：把各渠道的刊例价抓下来对齐成同一个单位、
        把第三方跑分聚合到模型上、然后让你自己比。
        本站不跑分、不代购、不投放广告，也不接受渠道的排名付费。
      </div>

      <div className="section-title">
        价格口径 <span className="sub">所有价格统一为 ¥ / 百万 tokens</span>
      </div>
      <div className="term-grid">
        {PRICE_TERMS.map((k) => {
          const g = GLOSSARY[k];
          return (
            <div className="term-card" key={k} id={k}>
              <div className="term-name">{g.term}</div>
              <div className="term-short">{g.short}</div>
              <p className="term-body">{g.body}</p>
              {g.limit ? <div className="term-limit">不算什么：{g.limit}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="section-title">
        能力与性价比 <span className="sub">「更划算」是怎么算出来的</span>
      </div>
      <div className="term-grid">
        {INTELLIGENCE_TERMS.map((k) => {
          const g = GLOSSARY[k];
          return (
            <div className="term-card" key={k} id={k}>
              <div className="term-name">{g.term}</div>
              <div className="term-short">{g.short}</div>
              <p className="term-body">{g.body}</p>
              {g.limit ? <div className="term-limit">不算什么：{g.limit}</div> : null}
            </div>
          );
        })}
      </div>

      <div className="section-title">
        基准口径 <span className="sub">共 {ds.benchmarks.length} 项 · 点开看这项到底测什么</span>
      </div>
      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="cat-title">
            {CATEGORY_LABEL[cat]}
            <span className="sub">{grouped.get(cat)!.length} 项</span>
          </div>
          <div className="term-list">
            {grouped.get(cat)!.map((b) => (
              <details className="term-det" key={b.id} id={b.id}>
                <summary>
                  <span className="term-det-name">{b.name}</span>
                  <span className="term-det-meta">
                    {b.scale}
                    {b.vendorOwned ? ' · 厂商自建' : ''}
                  </span>
                </summary>
                <div className="term-det-body">
                  <p>
                    <strong>测什么：</strong>
                    {b.summary}
                  </p>
                  <p>
                    <strong>为什么重要：</strong>
                    {b.explanation}
                  </p>
                  <p>
                    <strong>什么时候该看它：</strong>
                    {b.useCase}
                  </p>
                  <p className="term-det-foot">
                    计分：{b.scoring}
                    {b.url ? (
                      <>
                        {' · '}
                        <a href={b.url} target="_blank" rel="noreferrer">
                          官方链接 ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">数据来源与更新</div>
      <div className="card card-pad">
        <p className="src-line">
          <strong>价格</strong>
          ：国内模型取厂商官方定价页，另采集阿里云百炼、火山引擎方舟、腾讯云
          TokenHub、百度智能云千帆、移动云、天翼云、联通云、七牛云、硅基流动等平台的刊例价；
          海外模型取 Anthropic、OpenAI、Google Gemini、xAI 官网。每条价格都带原文证据链接，可逐条核对。
        </p>
        <p className="src-line">
          <strong>换算</strong>
          ：美元价按快照当日人民币汇率中间价折算，汇率随快照更新；所有价格统一折算为 ¥ / 百万 tokens。
        </p>
        <p className="src-line">
          <strong>跑分</strong>
          ：来自 Artificial Analysis 等第三方评测机构，采用各模型推理档位拉满的设定。Claude
          系列可能含 fallback 调用，GPT 系列可能计入 cyberguards 拦截，已在模型页逐条标注。
        </p>
        <p className="src-line">
          <strong>更新</strong>
          ：每周一 06:00 自动抓取并重建。若某渠道抓取失败，保留其上期数据并标注实际数据日期，不用空值覆盖。
        </p>
        <p className="src-line">
          <strong>免责</strong>
          ：价格以厂商官网刊例价为准，不含税费与活动价；实际账单以采购合同与订单页为准。
        </p>
      </div>
    </>
  );
}
