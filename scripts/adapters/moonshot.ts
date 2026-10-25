import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 月之暗面 Kimi 官方适配器
 *
 * platform.moonshot.cn 的定价页是客户端渲染。
 * Kimi 以美元标价（$2/$10 等），ModelsMark 会在标准化层按汇率折算。
 */
export class MoonshotAdapter extends BaseAdapter {
  channelId = 'moonshot';
  channelName = '月之暗面官方';
  strategy = 'rendered' as const;
  url = 'https://platform.moonshot.cn/docs/pricing/chat';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const targets: Array<{ re: RegExp; slug: string; vendorId: string }> = [
      { re: /kimi-k3\.1-pro/i, slug: 'kimi-k3-1-pro', vendorId: 'kimi-k3.1-pro' },
      { re: /kimi-k3(?!\.)/i, slug: 'kimi-k3', vendorId: 'kimi-k3' },
    ];

    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2500);
      const nums = [...seg.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 500);
      if (nums.length < 2) continue;

      const input = nums[0];
      const output = nums[1];
      const cacheRead = nums[2] !== undefined && nums[2] < input ? nums[2] : null;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input,
          output,
          cacheRead,
          vendorModelId: t.vendorId,
          note: '官方以美元标价；三档推理 low/medium/max；高速度版本 2-3 倍速、价格 2 倍',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
