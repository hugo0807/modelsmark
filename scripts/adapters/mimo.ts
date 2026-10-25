import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 小米 MiMo 官方适配器
 *
 * mimo.mi.com/pricing 是客户端渲染的 React 页面。
 */
export class MimoAdapter extends BaseAdapter {
  channelId = 'mimo';
  channelName = '小米 MiMo 官方';
  strategy = 'rendered' as const;
  url = 'https://mimo.mi.com/pricing';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    for (const t of [
      { re: /MiMo-V2\.6-Pro/i, slug: 'mimo-v2-6-pro' },
      { re: /MiMo-V2\.6-Flash/i, slug: 'mimo-v2-6-flash' },
    ]) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2500);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元|\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1] ?? m[2]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length < 2) continue;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'CNY',
          input: nums[0],
          output: nums[1],
          cacheRead: nums[2] !== undefined && nums[2] < nums[0] ? nums[2] : null,
          vendorModelId: t.slug.replace(/-/g, '-'),
          note: '全模态 MoE；UltraSpeed 为独立延迟档位，单价更高',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
