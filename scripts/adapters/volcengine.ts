import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 火山引擎方舟适配器
 *
 * 豆包模型的按量价格按输入长度分档（0-32K / 32K-128K / ...），
 * 且缓存需额外按小时收存储费 0.017 元 / 百万 tokens / 小时。
 */
export class VolcengineArkAdapter extends BaseAdapter {
  channelId = 'volcengine-ark';
  channelName = '火山引擎方舟';
  strategy = 'rendered' as const;
  url = 'https://www.volcengine.com/docs/82379/1099320';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/doubao-seed-2\.1-pro/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 3000);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length >= 2) {
        out.push(
          this.makeRecord('doubao-seed-2-1-pro', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: nums[0],
            output: nums[1],
            cacheRead: nums[2] !== undefined && nums[2] < nums[0] ? nums[2] : null,
            vendorModelId: 'doubao-seed-2.1-pro',
            tier: {
              kind: 'long_context',
              threshold: 32768,
              unit: 'token',
              note: '0-32K 档，长上下文档位单价最高翻 4 倍',
            },
            tierLabel: '≤32K',
            note: '缓存存储另收 0.017 元 / 百万 token / 小时；低延迟与批量推理有独立价格',
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
