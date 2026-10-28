/**
 * 批量抓取缺失渠道的官方定价页，并立即做「能否解析出价格」的自检。
 * 只抓真实页面，解析失败就如实报告，不编造。
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractPrices, extractTables, parseDivRows, stripTags, toPerMillion } from './parse-pricing-table';

const OUT = path.join(process.cwd(), '.probe');
fs.mkdirSync(OUT, { recursive: true });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface Target {
  id: string;
  name: string;
  urls: string[];
}

const TARGETS: Target[] = [
  {
    id: 'tencent-tokenhub',
    name: '腾讯云 TokenHub',
    urls: [
      'https://cloud.tencent.com/document/product/1823/97731',
      'https://cloud.tencent.com/document/product/1823/113953',
      'https://cloud.tencent.com/document/product/1823/111008',
      'https://cloud.tencent.com/document/product/1823/130054',
    ],
  },
  {
    id: 'ctyun',
    name: '天翼云·息壤',
    urls: [
      'https://www.ctyun.cn/products/ai',
      'https://www.ctyun.cn/document/100967',
      'https://www.ctyun.cn/h5/ai',
      'https://www.ctyun.cn/products/mds',
    ],
  },
  {
    id: 'cucloud',
    name: '联通云',
    urls: [
      'https://www.cucloud.cn/product/maas',
      'https://www.cucloud.cn/marketplace/ai',
      'https://www.cucloud.cn/product/ai',
    ],
  },
  {
    id: 'mobile-cloud',
    name: '移动云',
    urls: [
      'https://ecloud.10086.cn/product/mdi-ai',
      'https://ecloud.10086.cn/product/aidoc',
      'https://ecloud.10086.cn/product/ai',
    ],
  },
  {
    id: 'huawei-modelarts',
    name: '华为云 ModelArts',
    urls: [
      'https://support.huaweicloud.com/modelarts/modelarts_01_0501.html',
      'https://support.huaweicloud.com/price-modelarts/modelarts_03_0100.html',
      'https://support.huaweicloud.com/modelarts/modelarts_01_0001.html',
    ],
  },
  {
    id: 'infini-ai',
    name: '无问芯穹',
    urls: [
      'https://cloud.infini-ai.com/genius/model',
      'https://cloud.infini-ai.com/pricing',
      'https://cloud.infini-ai.com/genius/price',
    ],
  },
];

async function grab(url: string): Promise<{ html: string; status: number } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40000);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    clearTimeout(timer);
    const html = await res.text();
    return { html, status: res.status };
  } catch {
    return null;
  }
}

/** 粗判一个页面「有没有可解析的价格」 */
function inspect(html: string) {
  const tables = extractTables(html);
  const tableRows = tables.reduce((a, t) => a + t.length, 0);
  const text = stripTags(html);
  const prices = extractPrices(text).filter((p) => p.value > 0);
  const divRows = parseDivRows(html);
  return {
    bytes: html.length,
    tables: tables.length,
    tableRows,
    priceTokens: prices.length,
    divRows: divRows.length,
    hasPriceUnit: /元\/百万|元\/千|\$\/\s*(?:million|M)\s*tokens|元\/百万tokens/i.test(text),
  };
}

async function main() {
  const report: any[] = [];
  for (const t of TARGETS) {
    let best: any = null;
    for (const url of t.urls) {
      const r = await grab(url);
      if (!r) {
        console.log(`${t.id.padEnd(18)} ${url.slice(0, 62).padEnd(62)} ERR`);
        continue;
      }
      const info = inspect(r.html);
      const file = path.join(OUT, `fetch_${t.id}_${url.replace(/[^a-z0-9]+/gi, '_').slice(-40)}.html`);
      fs.writeFileSync(file, r.html, 'utf8');
      const line = `${t.id.padEnd(18)} ${String(r.status).padEnd(4)} ${String(info.bytes).padStart(8)}B tbl=${info.tables}/${info.tableRows}r price=${info.priceTokens} div=${info.divRows} unit=${info.hasPriceUnit ? 'Y' : 'n'}`;
      console.log(line);
      report.push({ id: t.id, url, status: r.status, ...info, file });
      const score = (info.hasPriceUnit ? 100 : 0) + info.divRows * 10 + info.priceTokens;
      if (!best || score > best.score) best = { score, url, file, ...info, status: r.status };
    }
    if (best) console.log(`  ★ ${t.name} 最佳: ${best.url}\n`);
  }
  fs.writeFileSync(path.join(OUT, 'fetch-report.json'), JSON.stringify(report, null, 2), 'utf8');
}

main();
