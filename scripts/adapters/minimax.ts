import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * MiniMax 官方适配器
 *
 * platform.minimaxi.com/document/price 是客户端渲染页面。
 * MiniMax 的输入超过 512K 后单价翻倍，需要分两档记录。
 */
export class MiniMaxAdapter extends BaseAdapter {
  channelId = 'minimax';
  channelName = 'MiniMax 官方';
  strategy = 'rendered' as const;
  url = 'https://platform.minimaxi.com/document/price';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const idx = html.search(/MiniMax-M3/i);
    if (idx !== -1) {
      const seg = html.slice(idx, idx + 3000);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元|\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1] ?? m[2]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length >= 2) {
        // 页面展示的是折前价（4.2 / 16.8 与 8.4 / 33.6），永久五折后为一半
        const rawInput = nums[0];
        const rawOutput = nums[1];
        const isPromo = /五折|5折|discount/i.test(seg);

        out.push(
          this.makeRecord('minimax-m3', this.channelId, ctx.fetchedAt, this.url, {
            currency: 'CNY',
            input: isPromo ? rawInput / 2 : rawInput,
            cacheRead: nums[2] !== undefined ? nums[2] / (isPromo ? 2 : 1) : null,
            output: isPromo ? rawOutput / 2 : rawOutput,
            vendorModelId: 'MiniMax-M3',
            tier: {
              kind: 'long_context',
              threshold: 524288,
              unit: 'token',
              note: '输入超过 512K 后单价翻倍',
            },
            tierLabel: '≤512K',
            promotional: isPromo,
            promoNote: isPromo ? '永久五折后价格' : null,
            note: '页面折前价 4.2 / 16.8（≤512K）、8.4 / 33.6（>512K）',
          })
        );

        // 长上下文档位
        if (nums.length >= 4) {
          out.push(
            this.makeRecord('minimax-m3', this.channelId, ctx.fetchedAt, this.url, {
              currency: 'CNY',
              input: isPromo ? nums[2] / 2 : nums[2],
              output: isPromo ? nums[3] / 2 : nums[3],
              vendorModelId: 'MiniMax-M3',
              tier: {
                kind: 'long_context',
                threshold: 524288,
                unit: 'token',
                note: '输入超过 512K 后单价翻倍',
              },
              tierLabel: '>512K',
              promotional: isPromo,
              promoNote: isPromo ? '永久五折后价格' : null,
              note: null,
            })
          );
        }
      }
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
