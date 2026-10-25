import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 阿里云百炼适配器
 *
 * help.aliyun.com 的文档页是服务端渲染，价格表在 HTML 中。
 * 注意：百炼同时上架了多家第三方模型（硅基流动、快手万擎直供），
 * 只取通义千问系列，避免与其他渠道重复。
 */
export class AliyunBailianAdapter extends BaseAdapter {
  channelId = 'aliyun-bailian';
  channelName = '阿里云百炼';
  strategy = 'static' as const;
  url = 'https://help.aliyun.com/zh/model-studio/model-pricing';

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.fetchHtml(this.url);

    const targets: Array<{ re: RegExp; slug: string; vendorId: string }> = [
      { re: /qwen3\.8-max/i, slug: 'qwen3-8-max', vendorId: 'qwen3.8-max' },
      { re: /qwen3\.7-max/i, slug: 'qwen3-7-max', vendorId: 'qwen3.7-max' },
      { re: /qwen3\.7-plus/i, slug: 'qwen3-7-plus', vendorId: 'qwen3.7-plus' },
      { re: /qwen3\.7-flash/i, slug: 'qwen3-7-flash', vendorId: 'qwen3.7-flash' },
      { re: /qwen3\.8-flash/i, slug: 'qwen3-8-flash', vendorId: 'qwen3.8-flash' },
    ];

    const out: PriceRecord[] = [];
    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2500);
      // 百炼价格写法为「12元」「36元」或「¥12」
      const nums = [...seg.matchAll(/(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*元?/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);

      if (nums.length < 2) continue;
      const input = nums[0];
      const output = nums[1];
      // 缓存价在百炼是输入价的 10-12.5%
      const cacheRead = nums[2] !== undefined && nums[2] < input ? nums[2] : null;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'CNY',
          input,
          output,
          cacheRead,
          vendorModelId: t.vendorId,
          note: '百万级上下文；缓存命中按标准输入约 10-12.5% 计费；支持 Batch 折扣',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
