import type { Metadata } from 'next';
import Link from 'next/link';
import '../styles/globals.css';
import { loadDataset } from '../lib/data';

export const metadata: Metadata = {
  title: 'ModelsMark — 全球模型 API 价格与能力基准',
  description:
    '海外与国内大模型 API 价格实时对比，涵盖 19 个官方与云平台渠道，14 项能力基准跑分排名。每周自动更新。',
  keywords: ['大模型', 'API 价格', 'Token 定价', '跑分', 'benchmark', 'LLM'],
};

const NAV = [
  { href: '/', label: '概览' },
  { href: '/prices', label: '价格榜' },
  { href: '/benchmarks', label: '能力榜' },
  { href: '/about', label: '标准说明' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ds = loadDataset();

  return (
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="logo">
              Models<span>Mark</span>
            </Link>
            <nav className="nav">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="header-meta">
              <span className="fx-badge">1 USD = {ds.usdCny.toFixed(4)} CNY</span>
              <span>更新 {ds.updatedAt}</span>
            </div>
          </div>
        </header>

        <main className="wrap">{children}</main>

        <footer className="site-footer">
          <div className="wrap footer-inner">
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                ModelsMark
              </div>
              <div>
                数据每周自动抓取更新 · 快照 {ds.snapshotId} · 汇率取自央行中间价
              </div>
            </div>
            <div>
              跑分数据来自第三方评测机构，ModelsMark 不自行跑分。
              <br />
              价格以厂商官网刊例价为准，实际账单以采购合同与订单页为准。
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
