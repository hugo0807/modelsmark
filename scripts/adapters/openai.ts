import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * OpenAI 官方定价适配器
 *
 * 注意：platform.openai.com/docs/pricing 会重定向到 developers.openai.com，
 * 且对非浏览器请求返回 Forbidden，所以必须用渲染策略。
 */
export class OpenAIAdapter extends BaseAdapter {
  channelId = 'openai';
  channelName = 'OpenAI 官方';
  strategy = 'rendered' as const;
  url = 'https://developers.openai.com/api/docs/pricing';
  waitMs = 2500;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    // 页面结构：模型名 → 输入 / 缓存输入 / 缓存写入 / 输出
    // 用宽松的文本模式匹配，避免因 DOM 结构调整而失效
    const modelPattern =
      /(gpt-6-astra|gpt-6\.1-sol|gpt-6-sol|gpt-6-luna|gpt-5\.6-sol|gpt-5\.6-terra|gpt-5\.6-luna)/gi;

    const chunks = html.split(modelPattern);
    for (let i = 1; i < chunks.length; i += 2) {
      const modelId = chunks[i].toLowerCase();
      const segment = chunks[i + 1] ?? '';
      const prices = this.extractFourPrices(segment);
      if (!prices) continue;

      const slug = this.mapToSlug(modelId);
      if (!slug) continue;

      out.push(
        this.makeRecord(slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input: prices[0],
          cacheRead: prices[1],
          cacheWrite: prices[2],
          output: prices[3],
          vendorModelId: modelId,
          note: '输入超过 272K 后输入翻倍、输出涨 1.5 倍；Batch 半价、Fast 双倍、Ultrafast 6 倍',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }

  /**
   * 从一段文本中提取四个美元价格。
   * 页面表格顺序为：输入 | 缓存输入 | 缓存写入 | 输出
   */
  private extractFourPrices(segment: string): [number, number, number, number] | null {
    const matches = [...segment.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 0 && n < 1000);
    if (matches.length < 4) return null;
    // 取该模型段落的前四个价格，按页面顺序
    return [matches[0], matches[1], matches[2], matches[3]];
  }

  /** 厂商模型名 → 站内 slug */
  private mapToSlug(id: string): string | null {
    const map: Record<string, string> = {
      'gpt-6-astra': 'gpt-6-astra',
      'gpt-6.1-sol': 'gpt-6-1-sol',
      'gpt-6-sol': 'gpt-6-1-sol',
      'gpt-6-luna': 'gpt-6-luna',
      'gpt-5.6-sol': 'gpt-6-astra',
      'gpt-5.6-terra': 'gpt-6-1-sol',
      'gpt-5.6-luna': 'gpt-6-luna',
    };
    return map[id] ?? null;
  }
}
