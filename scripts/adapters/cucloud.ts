import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 联通云适配器
 *
 * 联通云自 2026-09-25 起对 DeepSeek-V4-Flash-0731 实行峰谷定价，
 * 高峰时段 8:00-22:00，空闲时段价格为一半。
 */
export class CucloudAdapter extends BaseAdapter {
  channelId = 'cucloud';
  channelName = '联通云';
  strategy = 'rendered' as const;
  url = 'https://www.cucloud.cn/announcement-news.html?id=464';
  waitMs = 2000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/DeepSeek-V4-Flash-0731/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 3000);
      const nums = [...seg.matchAll(/¥\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);

      if (nums.length >= 6) {
        // 公告顺序：高峰输入、高峰输出、高峰缓存、空闲输入、空闲输出、空闲缓存
        out.push(
          this.makeRecord('deepseek-v4-1-flash', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: nums[0],
            output: nums[1],
            cacheRead: nums[2],
            vendorModelId: 'DeepSeek-V4-Flash-0731',
            tier: {
              kind: 'peak',
              window: '北京时间 8:00-22:00',
              note: '高峰时段单价',
            },
            tierLabel: '高峰时段',
            note: '2026-09-25 起实行峰谷定价',
          })
        );

        out.push(
          this.makeRecord('deepseek-v4-1-flash', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: nums[3],
            output: nums[4],
            cacheRead: nums[5],
            vendorModelId: 'DeepSeek-V4-Flash-0731',
            tier: {
              kind: 'offpeak',
              window: '北京时间 22:00-次日 8:00',
              note: '空闲时段为高峰价的一半',
            },
            tierLabel: '空闲时段',
            note: null,
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
