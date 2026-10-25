import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * Google Gemini 官方定价适配器
 *
 * ai.google.dev/gemini-api/docs/pricing 是静态服务端渲染的，
 * 普通 fetch 即可拿到完整价格表（不像 OpenAI 那样被 Forbidden）。
 */
export class GeminiAdapter extends BaseAdapter {
  channelId = 'google-ai-studio';
  channelName = 'Google AI Studio';
  strategy = 'static' as const;
  url = 'https://ai.google.dev/gemini-api/docs/pricing';

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.fetchHtml(this.url);

    const targets: Array<{ re: RegExp; slug: string; promo?: string }> = [
      {
        re: /gemini-4-argon/i,
        slug: 'gemini-4-argon',
        promo: '引荐价 $2 / $10，至 2026-11-30',
      },
      { re: /gemini-3\.1-pro/i, slug: 'gemini-3-1-pro' },
      {
        re: /gemini-3\.8-flash/i,
        slug: 'gemini-3-8-flash',
        promo: '促销价至 2026-12-31；2027-01-01 起涨至 $1.5 / $7.5',
      },
    ];

    const out: PriceRecord[] = [];
    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const segment = html.slice(idx, idx + 4000);
      const nums = [...segment.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 500);

      if (nums.length < 2) continue;
      const input = nums[0];
      const output = nums[1];
      // 缓存输入价通常是第三个数，约为输入价的 10%
      const cacheRead = nums[2] !== undefined && nums[2] < input ? nums[2] : null;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input,
          output,
          cacheRead,
          vendorModelId: t.slug,
          promotional: !!t.promo,
          promoNote: t.promo ?? null,
          note: 'Batch 与 Flex 五折；Priority 处理 1.8 倍价；Pro 档超过 200K 提示需加价',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
