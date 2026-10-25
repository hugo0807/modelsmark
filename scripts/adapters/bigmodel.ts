import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 智谱 GLM 官方定价适配器
 *
 * open.bigmodel.cn/pricing 是单页应用，价格数据来自后端接口。
 * 页面用 React 渲染，因此用 rendered 策略。
 */
export class BigModelAdapter extends BaseAdapter {
  channelId = 'bigmodel';
  channelName = '智谱官方';
  strategy = 'rendered' as const;
  url = 'https://open.bigmodel.cn/pricing';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    for (const t of [
      { re: /glm-5\.3-flash/i, slug: 'glm-5-3-flash' },
      { re: /glm-5\.3/i, slug: 'glm-5-3' },
    ]) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 2500);
      const nums = [...seg.matchAll(/(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 1000);
      if (nums.length < 3) continue;

      // 页面列顺序不固定，用「输出价 = 最大值」的启发式
      const output = Math.max(...nums.slice(0, 6));
      const rest = nums.slice(0, 6).filter((n) => n !== output);
      const input = Math.max(...rest);
      const cacheRead = Math.min(...rest);

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'CNY',
          input,
          cacheRead: cacheRead < input ? cacheRead : null,
          output,
          vendorModelId: t.slug.replace(/-/g, '-'),
          note: '1M 上下文仅一档，不按长度加价',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
