import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 腾讯云 TokenHub 适配器
 *
 * TokenHub 是腾讯云的多模型聚合平台，价格与官方直售有差异（通常加价 10%-26%）。
 * 计费页在控制台内，公开文档路径为 product/1823/130055。
 */
export class TencentTokenHubAdapter extends BaseAdapter {
  channelId = 'tencent-tokenhub';
  channelName = '腾讯云 TokenHub';
  strategy = 'rendered' as const;
  url = 'https://cloud.tencent.com/document/product/1823/130055';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    const targets: Array<{ re: RegExp; slug: string; vendorId: string }> = [
      { re: /qwen3\.8-max/i, slug: 'qwen3-8-max', vendorId: 'qwen3.8-max' },
      { re: /glm-5\.3/i, slug: 'glm-5-3', vendorId: 'GLM-5.3' },
      { re: /kimi-k3/i, slug: 'kimi-k3', vendorId: 'kimi-k3' },
      { re: /hy3/i, slug: 'hunyuan-hy3', vendorId: 'Hy3' },
      { re: /minimax-m3/i, slug: 'minimax-m3', vendorId: 'MiniMax-M3' },
    ];

    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2000);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length < 2) continue;

      const input = nums[0];
      const output = nums[1];
      const cacheRead = nums[2] !== undefined && nums[2] < input ? nums[2] : null;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'CNY',
          input,
          output,
          cacheRead,
          vendorModelId: t.vendorId,
          note: 'TokenHub 转售价，通常较厂商官方加价 10%-26%',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
