import type { Benchmark, Model, Score } from '../lib/types';

/** 跑分条：一项基准在各模型上的排名 */
export function BenchCard({
  benchmark,
  models,
  scores,
  showExplanation = false,
}: {
  benchmark: Benchmark;
  models: Model[];
  scores: Score[];
  showExplanation?: boolean;
}) {
  const rows = models
    .map((m) => {
      const s = scores.find(
        (x) => x.modelId === m.id && x.benchmarkId === benchmark.id
      );
      return { model: m, score: s };
    })
    .filter((r) => r.score !== undefined)
    .sort((a, b) => (b.score?.value ?? -1) - (a.score?.value ?? -1));

  const max = rows.length > 0 ? rows[0].score!.value : 1;
  const min = rows.length > 0 ? rows[rows.length - 1].score!.value : 0;
  const range = max - min || 1;

  return (
    <div className="bench-card">
      <div className="bench-head">
        <span className="bench-name">{benchmark.name}</span>
        <span className="bench-cat">{benchmark.scale}</span>
        {benchmark.vendorOwned && <span className="tag">厂商自建</span>}
        {showExplanation && (
          <a
            href={`/about#${benchmark.id}`}
            style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)' }}
          >
            这基准测什么？
          </a>
        )}
      </div>

      {rows.map(({ model, score }) => {
        const width = ((score!.value - min) / range) * 100;
        return (
          <div className="bench-row" key={model.id}>
            <span className="bench-model">
              <span
                className={`dot ${model.origin === 'domestic' ? 'dot-domestic' : 'dot-overseas'}`}
                style={{ marginRight: 5 }}
              />
              {model.name}
            </span>
            <span className="bench-bar">
              <span
                className="bench-fill"
                style={{
                  width: `${Math.max(width, 3)}%`,
                  background:
                    model.origin === 'domestic' ? 'var(--domestic)' : 'var(--overseas)',
                }}
              />
            </span>
            <span className="bench-score">
              {benchmark.scale === 'Elo'
                ? Math.round(score!.value)
                : score!.value.toFixed(1)}
            </span>
          </div>
        );
      })}

      {rows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>暂无数据</div>
      )}
    </div>
  );
}
