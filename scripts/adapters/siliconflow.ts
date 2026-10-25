import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 硅基流动适配器
 *
 * 注意：api.siliconflow.cn/v1/models 需要 API Key 才能访问（返回 401），
 * 因此不能走公开接口，改为抓取官网价格页。
 * 官网是客户端渲染，需要 Playwright。
 */
export class SiliconFlowAdapter extends BaseAdapter {
  channelId = 'siliconflow';
  channelName = '硅基流动';
  strategy = 'rendered' as const;
  url = 'https://siliconflow.cn/pricing';
  waitMs = 3000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    // 硅基流动价格页按模型名逐行列出，此处逐个定位
    const targets: Array<{ re: RegExp; slug: string }> = [
      { re: /GLM-5\.3-Flash/i, slug: 'glm-5-3-flash' },
      { re: /GLM-5\.3/i, slug: 'glm-5-3' },
      { re: /DeepSeek-?V4\.1-?Flash/i, slug: 'deepseek-v4-1-flash' },
      { re: /DeepSeek-?V4-?Flash/i, slug: 'deepseek-v4-1-flash' },
      { re: /Kimi-?K3/i, slug: 'kimi-k3-1-pro' },
      { re: /Qwen3\.8/i, slug: 'qwen3-8-max' },
      { re: /MiMo-?V2\.6-?Pro/i, slug: 'mimo-v2-6-pro' },
      { re: /MiniMax-?M3/i, slug: 'minimax-m3' },
      { re: /Hy3/i, slug: 'hunyuan-hy3' },
    ];

    const seen = new Set<string>();
    for (const t of targets) {
      if (seen.has(t.slug)) continue;
      const idx = html.search(t.re);
      if (idx === -1) continue;
      const seg = html.slice(idx, idx + 1500);

      // 硅基流动以 $ 计价，例如 $0.30 / $1.20
      const nums = [...seg.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 0 && n < 500);
      if (nums.length < 2) continue;

      const input = nums[0];
      const output = nums[1];
      const cacheRead = nums[2] !== undefined && nums[2] < input ? nums[2] : null;

      seen.add(t.slug);
      out.push(
        this.makeRecord(t.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input,
          output,
          cacheRead,
          vendorModelId: t.slug,
          note: 'fp8 量化部署；1M 上下文；转售渠道价格通常高于厂商官方',
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何价格`);
    }
    return out;
  }
}
