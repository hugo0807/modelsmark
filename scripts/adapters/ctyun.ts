import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * 天翼云 · 息壤适配器
 *
 * 天翼云公开页面主要是 Token 套餐（量包），按量单价需在模型广场详情页查看、
 * 控制台未公开。这里抓取公开可见的套餐信息。
 */
export class CtyunAdapter extends BaseAdapter {
  channelId = 'ctyun';
  channelName = '天翼云 · 息壤';
  strategy = 'rendered' as const;
  url = 'https://www.ctyun.cn/developer/article/858027579121733';
  waitMs = 2000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const html = await this.renderPage(ctx);
    const out: PriceRecord[] = [];

    // 套餐结构：每月 X 元，包含 Y 万 Tokens
    // 公开页出现的档位：轻享版 9.9/1000万、基础版 39.9/1500万、
    // 专业版 159.9/7000万、旗舰版 299.9/1.5亿
    const plans: Array<{
      name: string;
      price: number;
      tokens: number;
      modelId: string;
      vendorId: string;
    }> = [
      { name: '轻享版', price: 9.9, tokens: 10000000, modelId: 'deepseek-v4-1-flash', vendorId: 'DeepSeek-V4-Flash' },
      { name: '基础版', price: 39.9, tokens: 15000000, modelId: 'glm-5-3', vendorId: 'GLM-5' },
      { name: '专业版', price: 159.9, tokens: 70000000, modelId: 'glm-5-3', vendorId: 'GLM-5' },
      { name: '旗舰版', price: 299.9, tokens: 150000000, modelId: 'glm-5-3', vendorId: 'GLM-5' },
    ];

    for (const plan of plans) {
      // 确认页面上确实提到了该档位名，避免误配
      if (!html.includes(plan.name)) continue;

      out.push(
        this.makeRecord(plan.modelId, this.channelId, ctx.fetchedAt, this.url, {
          billingMode: 'package',
          currency: 'CNY',
          input: null,
          cacheRead: null,
          cacheWrite: null,
          output: null,
          tierLabel: plan.name,
          vendorModelId: plan.vendorId,
          note: '按量单价需在模型广场详情页查看，控制台未公开',
          packageTokens: plan.tokens,
          packagePeriod: '1 个月',
          packagePrice: plan.price,
          packageTierName: plan.name,
          packageMerged: true,
          packageManualActivation: true,
        })
      );
    }

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 页面结构变化，未解析出任何套餐`);
    }
    return out;
  }
}
