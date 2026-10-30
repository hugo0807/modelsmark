import type { Metadata } from 'next';
import Link from 'next/link';
import '../styles/globals.css';
import MobileNav from '../components/layout/MobileNav';
import { loadDataset } from '../lib/data';

export const metadata: Metadata = {
  title: 'ModelsMark — 全球模型 API 价格与能力基准',
  description:
    '同一模型在各渠道的真实报价横向对比：官方直售、云厂商、运营商、第三方 Token Hub。价格全部来自官方定价页，每条可溯源。',
  keywords: ['大模型', 'API 价格', 'Token 定价', '跑分', 'benchmark', 'LLM', 'Token Plan'],
};

const NAV = [
  { href: '/', label: '首页' },
  { href: '/channels', label: '渠道对比' },
  { href: '/plans', label: '套餐对比' },
  { href: '/benchmarks', label: '能力榜' },
  { href: '/about', label: '说明' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const ds = loadDataset();

  const modelCount = ds.aggregates.length;
  const channelCount = new Set(ds.prices.map((p) => p.channelId)).size;

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
              <span className="fx-badge">1 USD = {ds.usdCny.toFixed(3)} CNY</span>
              <span>
                {modelCount} 模型 · {channelCount} 渠道
              </span>
              {/* ≤900px 时 .nav 会被隐藏，这里补上移动端入口，否则手机上没有导航 */}
              <MobileNav items={NAV} />
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
                数据抓取自各渠道官方定价页 · 快照 {ds.snapshotId} · 汇率取自央行中间价
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
