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

/**
 * 归一化路径，用于判断「当前页」。
 *
 * 产物把站内链接改成了 index.html 形式（为了 file:// 与子路径部署都能用），
 * 于是 pathname 会是 /channels/index.html 这种，直接和 /channels 比会永远不等。
 */
function normalizePath(p: string): string {
  const s = (p || '/').replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
  return s || '/';
}

export default function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = normalizePath(usePathname());

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
              className={`mnav-item${pathname === normalizePath(it.href) ? ' on' : ''}`}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
