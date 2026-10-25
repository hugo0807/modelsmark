import { BaseAdapter, type AdapterContext } from '../lib/types';
import type { PriceRecord } from '../../src/lib/types';

/**
 * DeepSeek 官方定价适配器
 *
 * api-docs.deepseek.com 是 Docusaurus 静态站，价格在第一个 <table> 里。
 *
 * 重要：官方页面现以美元计价（$0.15 / $0.60 等），
 * 与国内其他厂商的人民币口径不同。ModelsMark 统一按原始币种存储、
 * 标准化层再折算成人民币。
 *
 * 表格结构：
 *   行 0:  MODEL | deepseek-flash(1) | deepseek-v4-pro
 *   行 14: PRICING | 1M INPUT TOKENS (CACHE HIT) | OFF-PEAK | $0.003 | $0.022
 *   行 15: PEAK | $0.006 | $0.044
 *   行 16: 1M INPUT TOKENS (CACHE MISS) | OFF-PEAK | $0.15 | $0.66
 *   行 17: PEAK | $0.3 | $1.32
 *   行 18: 1M OUTPUT TOKENS | OFF-PEAK | $0.6 | $1.98
 *   行 19: PEAK | $1.2 | $3.96
 *
 * 解析策略：不依赖固定的列索引，而是在价格行里按顺序提取价格，
 * 第 N 个价格对应表头里第 N 个模型。这样表头加一列也不会错位。
 */
export class DeepSeekAdapter extends BaseAdapter {
  channelId = 'deepseek';
  channelName = 'DeepSeek 官方';
  strategy = 'rendered' as const;
  url = 'https://api-docs.deepseek.com/quick_start/pricing/';
  waitMs = 2000;

  async fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]> {
    const tableText = await this.extractTable(ctx, 0);
    if (!tableText) {
      throw new Error(`${this.channelName}: 未找到价格表格`);
    }

    const rows = this.parseTableRows(tableText);

    // 从表头行读出模型顺序
    const headerRow = rows.find((r) => r.some((c) => /deepseek-flash/i.test(c)));
    if (!headerRow) {
      throw new Error(`${this.channelName}: 未找到模型表头行`);
    }
    const modelOrder: Array<{ slug: string; vendorId: string }> = [];
    for (const cell of headerRow) {
      if (/deepseek-flash/i.test(cell)) {
        modelOrder.push({ slug: 'deepseek-v4-1-flash', vendorId: 'deepseek-flash' });
      } else if (/deepseek-v4-pro/i.test(cell)) {
        modelOrder.push({ slug: 'deepseek-v4-pro', vendorId: 'deepseek-v4-pro' });
      }
    }
    if (modelOrder.length === 0) {
      throw new Error(`${this.channelName}: 表头未列出任何已知模型`);
    }

    // 按类别收集价格行
    const cacheHit = this.collectPriceRows(rows, 'CACHE HIT');
    const cacheMiss = this.collectPriceRows(rows, 'CACHE MISS');
    const outputTier = this.collectPriceRows(rows, 'OUTPUT TOKENS');

    if (cacheMiss.length === 0 || outputTier.length === 0) {
      throw new Error(`${this.channelName}: 未找到 CACHE MISS / OUTPUT TOKENS 行`);
    }

    const out: PriceRecord[] = [];

    modelOrder.forEach((m, idx) => {
      const missOffpeak = cacheMiss.find((r) => r.tier === 'offpeak');
      const missPeak = cacheMiss.find((r) => r.tier === 'peak');
      const outOffpeak = outputTier.find((r) => r.tier === 'offpeak');
      const outPeak = outputTier.find((r) => r.tier === 'peak');
      if (!missOffpeak || !outOffpeak) return;

      const input = missOffpeak.prices[idx];
      const output = outOffpeak.prices[idx];
      if (input === undefined || output === undefined) return;

      const hitOffpeak = cacheHit.find((r) => r.tier === 'offpeak');
      const hitPeak = cacheHit.find((r) => r.tier === 'peak');

      out.push(
        this.makeRecord(m.slug, this.channelId, ctx.fetchedAt, this.url, {
          currency: 'USD',
          input,
          cacheRead: hitOffpeak?.prices[idx] ?? null,
          output,
          vendorModelId: m.vendorId,
          tier: { kind: 'offpeak', window: 'OFF-PEAK', note: '空闲时段单价' },
          tierLabel: '空闲时段',
          note: '官方以美元计价；硬盘缓存不额外收存储费；上下文 1M，最大输出 384K',
        })
      );

      const peakInput = missPeak?.prices[idx];
      const peakOutput = outPeak?.prices[idx];
      if (peakInput !== undefined && peakOutput !== undefined) {
        out.push(
          this.makeRecord(m.slug, this.channelId, ctx.fetchedAt, this.url, {
            currency: 'USD',
            input: peakInput,
            cacheRead: hitPeak?.prices[idx] ?? null,
            output: peakOutput,
            vendorModelId: m.vendorId,
            tier: { kind: 'peak', window: 'PEAK', note: '高峰时段单价' },
            tierLabel: '高峰时段',
            note: null,
          })
        );
      }
    });

    if (out.length === 0) {
      throw new Error(`${this.channelName}: 表格结构变化，未解析出任何价格`);
    }
    return out;
  }

  /**
   * 收集某个计价类别的价格行。
   * 每行按出现顺序提取价格，第 N 个价格对应表头第 N 个模型。
   */
  private collectPriceRows(
    rows: string[][],
    label: string
  ): { tier: 'offpeak' | 'peak'; prices: number[] }[] {
    const result: { tier: 'offpeak' | 'peak'; prices: number[] }[] = [];

    for (const row of rows) {
      const joined = row.join(' ');
      if (!joined.includes(label)) continue;

      // 逐单元格取数字，跳过标签单元格（含字母的 cell）
      const prices: number[] = [];
      for (const cell of row) {
        // 纯标签单元格（OFF-PEAK / PEAK / 1M INPUT TOKENS）不含价格
        const isLabel = /OFF-PEAK|PEAK|TOKENS|CACHE|PRICING/i.test(cell);
        if (isLabel) continue;
        const nums = this.parseNumbersInRow(cell);
        if (nums.length > 0) prices.push(nums[0]);
      }

      if (prices.length === 0) continue;

      const isOffpeak = joined.includes('OFF-PEAK') || joined.includes('OFF PEAK');
      result.push({ tier: isOffpeak ? 'offpeak' : 'peak', prices });
    }

    return result;
  }
}
