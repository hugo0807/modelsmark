/**
 * 采集适配器框架
 *
 * 每个渠道一个适配器，实现 fetchPrices 方法。
 * 关键约定：
 * 1. 适配器只负责「拿到什么页面、解析出原始价格」，不做汇率换算、不做标准化
 * 2. 解析失败必须抛错，由调度层捕获并沿用上次数据，绝不返回空数组冒充成功
 * 3. 每个适配器需声明它的抓取方式（静态 HTML / 需渲染 / 需接口），供调度层选择策略
 */

import type { PriceRecord } from '../../src/lib/types';

/** 抓取方式 */
export type FetchStrategy =
  /** 静态 HTML，正则或 DOM 选择器即可解析 */
  | 'static'
  /** 需要执行 JS，用 Playwright 渲染后取 DOM */
  | 'rendered'
  /** 页面背后是 JSON 接口，直接调接口更稳 */
  | 'api';

export interface AdapterContext {
  /** 本次抓取时间 ISO */
  fetchedAt: string;
  /** Playwright browser 上下文，rendered 策略使用 */
  browser?: import('playwright').Browser;
  /** 日志输出 */
  log: (msg: string) => void;
}

export interface ChannelAdapter {
  /** 渠道 id，与 data/seeds/channels.json 对应 */
  channelId: string;
  /** 渠道名，用于日志 */
  channelName: string;
  /** 抓取方式 */
  strategy: FetchStrategy;
  /** 目标页面 URL */
  url: string;
  /** 反爬等待（毫秒），渲染前先等待 */
  waitMs?: number;
  /**
   * 抓取并解析价格
   * @returns 价格记录数组。解析出 0 条视为失败，应抛错
   */
  fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]>;
}

/**
 * 适配器基类，提供通用工具方法
 */
export abstract class BaseAdapter implements ChannelAdapter {
  abstract channelId: string;
  abstract channelName: string;
  abstract strategy: FetchStrategy;
  abstract url: string;
  waitMs = 1500;

  abstract fetchPrices(ctx: AdapterContext): Promise<PriceRecord[]>;

  /** 构造一条价格记录的公共部分 */
  protected makeRecord(
    modelId: string,
    channelId: string,
    fetchedAt: string,
    sourceUrl: string,
    overrides: Partial<PriceRecord> = {}
  ): PriceRecord {
    return {
      modelId,
      channelId,
      billingMode: 'payg',
      currency: 'CNY',
      input: null,
      cacheRead: null,
      cacheWrite: null,
      output: null,
      tier: { kind: 'none' },
      tierLabel: null,
      vendorModelId: null,
      sourceUrl,
      fetchedAt,
      promotional: false,
      promoNote: null,
      note: null,
      ...overrides,
    };
  }

  /**
   * 从文本中解析价格数字
   * 支持 "¥8.00" "8 元" "$2.00" "0.001 元/K" 等写法
   */
  protected parsePrice(text: string): number | null {
    if (!text) return null;
    // 去掉货币符号与单位，保留数字与小数点
    const cleaned = text.replace(/[¥$€£,\s]/g, '').replace(/元|万元|千tokens?|\/百万|\/1M|每百万/gi, '');
    const m = cleaned.match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * 从文本中解析上下文长度
   * 支持 "1M" "1048576" "1.05M" "262K" "1,048,576"
   */
  protected parseContext(text: string): number | null {
    if (!text) return null;
    const t = text.replace(/[, ]/g, '');
    let m = t.match(/([\d.]+)\s*([MK])/i);
    if (m) {
      const n = Number(m[1]);
      const mult = m[2].toUpperCase() === 'M' ? 1_000_000 : 1000;
      return Math.round(n * mult);
    }
    m = t.match(/(\d{5,})/);
    if (m) return Number(m[1]);
    return null;
  }

  /** 用 Playwright 打开页面并返回 HTML */
  protected async renderPage(ctx: AdapterContext): Promise<string> {
    if (!ctx.browser) {
      throw new Error(`${this.channelName}: 需要浏览器实例但未提供`);
    }
    const page = await ctx.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-CN',
    });
    try {
      await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(this.waitMs);
      return await page.content();
    } finally {
      await page.close();
    }
  }

  /** 抓取 JSON 接口 */
  protected async fetchJson<T>(ctx: AdapterContext, url: string): Promise<T> {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (!res.ok) {
      throw new Error(`${this.channelName}: HTTP ${res.status} ${url}`);
    }
    return (await res.json()) as T;
  }

  /**
   * 抓取 HTML 文本，跟随重定向。
   * 很多国内站点（DeepSeek 文档、硅基流动）会先做 301/302 跳转，
   * 不跟随重定向会拿到空响应。
   */
  protected async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    if (!res.ok) {
      throw new Error(`${this.channelName}: HTTP ${res.status} ${url}`);
    }
    return await res.text();
  }

  /**
   * 用浏览器提取页面上的表格文本。
   * 比正则可靠：表格结构由 DOM 保证，行列对应关系不会错位。
   *
   * @param tableIndex 第几个表格（从 0 开始）
   */
  protected async extractTable(
    ctx: AdapterContext,
    tableIndex = 0
  ): Promise<string | null> {
    if (!ctx.browser) {
      throw new Error(`${this.channelName}: 需要浏览器实例但未提供`);
    }
    const page = await ctx.browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'zh-CN',
    });
    try {
      await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(this.waitMs);
      const text = await page.evaluate((idx: number) => {
        const tables = document.querySelectorAll('table');
        const t = tables[idx];
        return t ? (t as HTMLElement).innerText : null;
      }, tableIndex);
      return text;
    } finally {
      await page.close();
    }
  }

  /**
   * 从表格文本中按行提取数值。
   * 表格文本形如 "LABEL\tVALUE1\tVALUE2"，用制表符或换行切分。
   */
  protected parseTableRows(tableText: string): string[][] {
    return tableText
      .split('\n')
      .map((line) => line.split('\t').map((c) => c.trim()))
      .filter((row) => row.length > 0 && row.some((c) => c.length > 0));
  }

  /**
   * 从一行中提取所有价格数字（含货币符号与小数）。
   *
   * 注意：会跳过行首的标签文字，避免把 "1M TOKENS"、"2024" 之类
   * 出现在标签里的数字误当成价格。
   */
  protected parseNumbersInRow(row: string): number[] {
    // 先把非价格语境（TOKEN、CONTEXT、LIMIT 等）所在的片段剔除
    const cleaned = row.replace(/\b\d+\s*(M|K)?\s*TOKENS?\b/gi, ' ');
    return [...cleaned.matchAll(/-?\d+(?:\.\d+)?/g)]
      .map((m) => Number(m[0]))
      .filter((n) => Number.isFinite(n));
  }
}
