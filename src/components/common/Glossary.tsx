'use client';

import { useEffect, useRef, useState } from 'react';

import { GLOSSARY, type GlossaryKey } from '../../lib/glossary';

/**
 * 口径说明 —— 点击展开。
 *
 * 之前口径只藏在 hover 浮窗里（.metric-hint / .th-hint），
 * 触屏设备上根本打不开，键鼠用户也得「猜哪里能悬停」。
 * 这里改成点击展开，hover 只是增强，不再是唯一入口。
 */
export default function Glossary({
  term,
  label,
}: {
  term: GlossaryKey;
  /** 触发按钮上显示的文字，默认是「?」 */
  label?: string;
}) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <span className={`gloss${open ? ' gloss-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="gloss-q"
        aria-expanded={open}
        aria-label={`${entry.term}口径说明`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {label ?? '?'}
      </button>
      {open && (
        <span className="gloss-pop" role="tooltip">
          <b className="gloss-title">{entry.term}</b>
          <span className="gloss-short">{entry.short}</span>
          <span className="gloss-body">{entry.body}</span>
          {entry.limit && <span className="gloss-limit">不算什么：{entry.limit}</span>}
        </span>
      )}
    </span>
  );
}
