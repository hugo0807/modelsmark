'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 性价比矩阵 —— 对数 X 轴（全渠道最低价）+ 线性 Y 轴（智能指数）
 *
 * 关键设计：
 * 1. 每个点旁直接标注模型名（小字），不依赖 hover 才能识别
 * 2. 标签碰撞避让：网格搜索最近的无冲突位置，必要时画引导线
 * 3. 对数轴让低价模型和高价模型能同屏对比
 */

export interface MatrixPoint {
  id: string;
  name: string;
  origin: 'domestic' | 'overseas';
  /** X：全渠道最低混合价 ¥/M tokens */
  x: number;
  /** Y：智能指数 */
  y: number;
  rank: number | null;
  channels: number;
}

const W = 1120;
const H = 520;
const PAD = { l: 52, r: 24, t: 18, b: 44 };

/** 标签框尺寸（估算） */
const LABEL_W = 104;
const LABEL_H = 16;

export default function ValueMatrix({ points }: { points: MatrixPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [width, setWidth] = useState(W);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 200) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) {
    return (
      <div className="empty-note" style={{ padding: '32px 0', textAlign: 'center' }}>
        暂无同时具备价格与智能指数的模型
      </div>
    );
  }

  const plotW = width - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs) * 0.72;
  const xMax = Math.max(...xs) * 1.35;
  const yMin = Math.max(0, Math.min(...ys) - (Math.max(...ys) - Math.min(...ys)) * 0.15);
  const yMax = Math.max(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.1;

  const logMin = Math.log10(xMin);
  const logMax = Math.log10(xMax);
  const sx = (v: number) => PAD.l + ((Math.log10(v) - logMin) / (logMax - logMin)) * plotW;
  const sy = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  // X 轴刻度：取 1/2/5 序列
  const ticks: number[] = [];
  for (let e = Math.floor(logMin); e <= Math.ceil(logMax); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= xMin && v <= xMax) ticks.push(v);
    }
  }
  const uniqueTicks = [...new Set(ticks)].sort((a, b) => a - b);

  // Y 轴刻度
  const yTicks: number[] = [];
  const yStep = (yMax - yMin) > 40 ? 20 : (yMax - yMin) > 15 ? 10 : 5;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) yTicks.push(v);

  // ── 标签避让 ──
  // 网格搜索：从点的默认位置出发，在候选偏移中找第一个不重叠的位置
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const OFFSETS = [
    [0, 0],
    [0, -18],
    [0, 16],
    [14, -10],
    [-14, -10],
    [14, 8],
    [-14, 8],
    [26, -20],
    [-26, -20],
    [26, 6],
    [-26, 6],
    [38, -28],
    [-38, -28],
    [38, 12],
    [-38, 12],
  ];

  const labels = points.map((p) => {
    const px = sx(p.x);
    const py = sy(p.y);
    let best = { lx: px + 10, ly: py - 8, found: false };

    for (const [dx, dy] of OFFSETS) {
      const lx = px + dx;
      const ly = py + dy;
      const box = { x: lx, y: ly, w: LABEL_W, h: LABEL_H };
      const clash = placed.some(
        (q) =>
          box.x < q.x + q.w + 3 &&
          box.x + box.w + 3 > q.x &&
          box.y < q.y + q.h + 2 &&
          box.y + box.h + 2 > q.y
      );
      if (!clash) {
        placed.push(box);
        best = { lx, ly, found: true };
        break;
      }
    }
    if (!best.found) {
      const lx = px + 10;
      const ly = py - 8;
      placed.push({ x: lx, y: ly, w: LABEL_W, h: LABEL_H });
      best = { lx, ly, found: false };
    }
    return { p, px, py, ...best };
  });

  return (
    <div ref={wrapRef} className="matrix-wrap">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label="模型性价比矩阵"
      >
        {/* 网格 */}
        {yTicks.map((v) => (
          <g key={`gy${v}`}>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={sy(v)}
              y2={sy(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD.l - 8} y={sy(v) + 4} textAnchor="end" className="axis-text">
              {v}
            </text>
          </g>
        ))}
        {uniqueTicks.map((v) => (
          <g key={`gx${v}`}>
            <line
              x1={sx(v)}
              x2={sx(v)}
              y1={PAD.t}
              y2={PAD.t + plotH}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text x={sx(v)} y={PAD.t + plotH + 18} textAnchor="middle" className="axis-text">
              ¥{v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v}
            </text>
          </g>
        ))}

        {/* 坐标轴标题 */}
        <text x={PAD.l + plotW / 2} y={H - 8} textAnchor="middle" className="axis-title">
          全渠道最低价（¥ / 百万 tokens，对数轴）
        </text>
        <text
          x={14}
          y={PAD.t + plotH / 2}
          textAnchor="middle"
          className="axis-title"
          transform={`rotate(-90 14 ${PAD.t + plotH / 2})`}
        >
          综合智能指数
        </text>

        {/* 点 + 标签 */}
        {labels.map(({ p, px, py, lx, ly }) => {
          const active = hover === p.id;
          const isDomestic = p.origin === 'domestic';
          const color = isDomestic ? 'var(--accent)' : 'var(--accent-overseas)';
          const needsLeader = Math.abs(lx - px) > 14 || Math.abs(ly - py) > 14;

          return (
            <g
              key={p.id}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              className="matrix-point"
            >
              {needsLeader ? (
                <line
                  x1={px}
                  y1={py}
                  x2={lx + (lx > px ? 0 : LABEL_W)}
                  y2={ly + LABEL_H / 2}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
              ) : null}
              <circle
                cx={px}
                cy={py}
                r={active ? 6 : 4.5}
                fill={color}
                fillOpacity={active ? 0.95 : 0.75}
                stroke="var(--bg-primary)"
                strokeWidth={1.5}
              />
              <text
                x={lx}
                y={ly + LABEL_H / 2 + 4}
                className={`matrix-label${active ? ' active' : ''}`}
                fill={active ? 'var(--text-primary)' : 'var(--text-secondary)'}
              >
                {p.name}
              </text>
              {/* 悬停时展开明细：React 19 会提升 SVG <title> 导致内容丢失，故用受控文本代替 */}
              {active ? (
                <text x={px} y={py - 14} textAnchor="middle" className="matrix-hover-info">
                  ¥{p.x.toFixed(2)}/M · 指数 {p.y} · {p.channels} 个渠道
                </text>
              ) : null}
              {/* SVG 内不使用 next/link：其生成的尾部斜杠会与客户端路由不一致，触发 hydration 报错 */}
              <a href={`/models/${p.id}`} aria-label={`${p.name} 各渠道报价`}>
                <circle cx={px} cy={py} r={11} fill="transparent" />
              </a>
            </g>
          );
        })}
      </svg>

      <div className="matrix-legend">
        <span>
          <i className="dot dot-domestic" /> 国内模型
        </span>
        <span>
          <i className="dot dot-overseas" /> 海外模型
        </span>
        <span className="matrix-hint">点击圆点查看该模型各渠道报价</span>
      </div>
    </div>
  );
}
