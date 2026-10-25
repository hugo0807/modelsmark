import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 七牛云适配器
 *
 * 七牛云 AI 大模型广场的价格按「元/K」展示，需要换算成元/百万 token。
 */
export class QiniuAdapter extends BaseAdapter {
  channelId = 'qiniu';
  channelName = '七牛云';
  strategy = 'rendered' as const;
  url = 'https://www.qiniu.com/prices';
  waitMs = 2000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/DeepSeek-V4-Flash/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 2500);
      // 七牛云写法为 0.001 元/K，换算到百万 token 需 × 1000
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元\/K/gi)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0);
      if (nums.length >= 2) {
        out.push(
          this.makeRecord('deepseek-v4-1-flash', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: nums[0] * 1000,
            output: nums[1] * 1000,
            vendorModelId: 'DeepSeek-V4-Flash',
            note: '页面按元/K 展示，已折算为元/百万 token；企业 AI Token Plan 最低四折',
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
