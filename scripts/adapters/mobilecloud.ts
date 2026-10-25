import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 移动云适配器
 *
 * ecloud.10086.cn 的计费说明文档是静态页，价格以「元/百万tokens」列出，
 * 并采用「点数」双轨制（1000 点 = 1 元）。
 */
export class MobileCloudAdapter extends BaseAdapter {
  channelId = 'mobile-cloud';
  channelName = '移动云';
  strategy = 'static' as const;
  url = 'https://ecloud.10086.cn/op-help-center/doc/article/95323';

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.fetchHtml(this.url);

    const out: PriceRecord[] = [];

    // 移动云文档按「模型 + 输入长度档位」组织，逐个定位
    const targets: Array<{
      re: RegExp;
      slug: string;
      vendorId: string;
      tierLabel?: string;
      tier?: PriceRecord['tier'];
    }> = [
      {
        re: /GLM-5\.3[^0-9]/i,
        slug: 'glm-5-3',
        vendorId: 'GLM-5.3',
      },
      {
        re: /GLM-5\.3-Flash/i,
        slug: 'glm-5-3-flash',
        vendorId: 'GLM-5.3-Flash',
      },
      {
        re: /DeepSeek-V4\.1-Flash/i,
        slug: 'deepseek-v4-1-flash',
        vendorId: 'DeepSeek-V4.1-Flash',
      },
    ];

    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2000);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)\s*元\/百万tokens/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0);
      if (nums.length < 2) continue;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'CNY',
          input: nums[0],
          output: nums[1],
          cacheRead: nums[2] !== undefined && nums[2] < nums[0] ? nums[2] : null,
          vendorModelId: t.vendorId,
          tierLabel: t.tierLabel ?? null,
          note: '与官方同价；点数制计费（1000 点 = 1 元）',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
