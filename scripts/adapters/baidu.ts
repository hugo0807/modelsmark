import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 百度智能云千帆适配器
 *
 * ERNIE 5.1 按输入长度分档：≤32K 与 32K-128K 单价不同。
 */
export class BaiduQianfanAdapter extends BaseAdapter {
  channelId = 'baidu-qianfan';
  channelName = '百度智能云千帆';
  strategy = 'rendered' as const;
  url = 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/hlrk4akp7';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/ERNIE-5\.1|ERNIE 5\.1/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 3000);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length >= 2) {
        out.push(
          this.makeRecord('ernie-5-1', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: nums[0],
            output: nums[1],
            cacheRead: nums[2] !== undefined && nums[2] < nums[0] ? nums[2] : null,
            vendorModelId: 'ERNIE-5.1',
            tier: {
              kind: 'long_context',
              threshold: 32768,
              unit: 'token',
              note: '32K-128K 档单价为 6 / 22',
            },
            tierLabel: '≤32K',
            note: '按量 / tokens 量包 / TPM 三种模式，部分模型分段计费',
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
