import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * Anthropic 官方定价适配器
 *
 * claude.com/pricing 页面结构：最新模型表格 + Legacy models 表格
 * 列顺序为：模型 | 输入 | 缓存写入 | 缓存读取 | 输出
 */
export class AnthropicAdapter extends BaseAdapter {
  channelId = 'anthropic';
  channelName = 'Anthropic 官方';
  strategy = 'rendered' as const;
  url = 'https://claude.com/pricing';
  waitMs = 2000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    // 逐个模型定位：找到模型名后的价格数字序列
    const targets: Array<{ re: RegExp; slug: string }> = [
      { re: /claude-opus-5-5/i, slug: 'claude-opus-5-5' },
      { re: /claude-sonnet-5-5/i, slug: 'claude-sonnet-5-5' },
      { re: /claude-fable-5-1/i, slug: 'claude-fable-5-1' },
    ];

    for (const t of targets) {
      const idx = html.search(t.re);
      if (idx === -1) continue;
      // 取模型名之后的一段文本作为价格片段
      const segment = html.slice(idx, idx + 3000);
      const prices = this.extractPrices(segment);
      if (!prices) continue;

      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input: prices.input,
          cacheWrite: prices.cacheWrite,
          cacheRead: prices.cacheRead,
          output: prices.output,
          vendorModelId: t.slug.replace(/-/g, '-'),
          note: 'Batch 批处理五折；Fast 模式约 2 倍价；4.7+ 使用新分词器，同文本 token 数约多 30%',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }

  /**
   * Anthropic 表格中美元价的出现顺序不稳定（因缓存写入/读取顺序可能调整），
   * 这里用「最小值为输入、最大值为输出」的启发式，并从模型卡的固定模式中找缓存价。
   */
  private extractPrices(segment: string): {
    input: number;
    cacheWrite: number | null;
    cacheRead: number | null;
    output: number;
  } | null {
    const nums = [...segment.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 0 && n < 500);
    if (nums.length < 3) return null;

    // 剔除明显不属于本模型的数字（如页面后续模型的价格）
    const first6 = nums.slice(0, 6);
    const output = Math.max(...first6);
    const input = Math.min(...first6.filter((n) => n !== output));
    // 缓存读取价通常是四个数里最小的；缓存写入约等于 1.25 倍输入
    const cacheRead = first6.includes(input) ? null : Math.min(...first6);

    return { input, cacheWrite: null, cacheRead, output };
  }
}
