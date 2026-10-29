'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * 移动端导航。
 *
 * 原样式表里 @media (max-width:900px) { .nav { display: none } }，
 * 手机上整站没有导航，从首页进去就出不来 —— 这是最严重的可访问性问题。
 * 这里补汉堡菜单，与桌面导航共用同一份导航项。
 */
export default function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="mnav">
      <button
        type="button"
        className="mnav-btn"
        aria-expanded={open}
        aria-label="打开导航菜单"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`mnav-icon${open ? ' x' : ''}`} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="mnav-text">菜单</span>
      </button>
      {open && (
        <nav className="mnav-panel" onClick={() => setOpen(false)}>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`mnav-item${pathname === it.href ? ' on' : ''}`}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
