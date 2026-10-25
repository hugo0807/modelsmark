import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * xAI Grok 官方适配器
 *
 * x.ai/docs/models 的价格写在模型卡片里，页面为客户端渲染。
 * Grok 4.7 起使用 200K 长上下文跳档：达到 200K 后整个请求按高费率计费。
 */
export class XaiAdapter extends BaseAdapter {
  channelId = 'xai';
  channelName = 'xAI 官方';
  strategy = 'rendered' as const;
  url = 'https://x.ai/docs/models';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/grok-4\.7/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 3000);
      const nums = [...seg.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 500);

      if (nums.length >= 3) {
        const input = nums[0];
        const output = nums[1];
        const cacheRead = nums[2] < input ? nums[2] : null;

        out.push(
          this.makeRecord('grok-4-7', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'USD',
            input,
            output,
            cacheRead,
            vendorModelId: 'grok-4.7',
            note: '500K 上下文；提示达到 200K 后整个请求按 $4 / $1 / $12 计费；无 Batch 折扣，Priority 2 倍',
          })
        );
      }
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
