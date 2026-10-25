# ModelsMark

全球模型 API 价格与能力基准对比平台。覆盖 19 个官方与云平台渠道、29 个模型、14 项能力基准，每周自动抓取更新。

## 功能

| 页面 | 路径 | 内容 |
|---|---|---|
| 概览 | `/` | 性价比矩阵散点图、本周价格变动、最便宜的按量价排行 |
| 价格榜 | `/prices` | 模型 × 渠道的按量刊例价与套餐价，含缓存价、溢价率、混合价 |
| 能力榜 | `/benchmarks` | 14 项基准的模型排名条形图 + 能力雷达 |
| 标准说明 | `/about` | 每项基准测什么、为什么重要、什么时候该看它 |
| 模型详情 | `/models/[slug]` | 单模型的全部渠道价格、套餐方案、跑分表现 |

## 技术栈

- **前端**：Next.js 15（App Router）+ React 19 + TypeScript，纯静态导出
- **数据**：JSON 文件 + 构建期标准化（无运行时数据库）
- **抓取**：Playwright + 原生 fetch，每渠道一套适配器
- **调度**：GitHub Actions（每周一 06:00 CST）
- **部署**：Cloudflare Pages 或 Vercel

## 目录结构

```
modelsmark/
├── data/
│   ├── prices.json          # 按量价 + 套餐价（抓取生成）
│   ├── changes.json         # 与上次快照的差分（抓取生成）
│   ├── fx.json              # 汇率序列（抓取生成）
│   ├── snapshot.json        # 快照元信息与各渠道抓取状态
│   ├── prices.prev.json     # 上期价格，供跳变检测
│   └── seeds/               # 人工维护的元数据
│       ├── models.json      # 模型定义
│       ├── channels.json    # 渠道定义
│       ├── benchmarks.json  # 基准定义与释义
│       ├── scores.json      # 跑分分数
│       └── intelligence.json# 综合智能指数
├── scripts/
│   ├── run-scrape.ts        # 抓取调度主程序
│   ├── validate.ts          # 数据校验（发布前必须通过）
│   ├── screenshot.cjs       # 页面截图（设计评审用）
│   ├── diagnose-trace.cjs   # 排查构建问题用
│   ├── lib/types.ts         # 适配器基类与通用工具
│   └── adapters/            # 19 个渠道各一套适配器
├── src/
│   ├── app/                 # 页面路由
│   ├── components/          # 共享组件
│   ├── lib/
│   │   ├── types.ts         # 核心数据类型
│   │   ├── compute.ts       # 汇率换算、混合价、溢价率、差分
│   │   └── data.ts          # 数据加载与标准化
│   └── styles/globals.css   # 设计系统
└── .github/workflows/
    ├── scrape.yml           # 每周抓取 + 校验 + 提交数据
    └── deploy.yml           # 构建 + 部署到 Cloudflare Pages
```

## 本地开发

```bash
npm install
npm run dev          # 开发服务器 http://localhost:3000
npm run typecheck    # 类型检查
npm run validate     # 数据校验
npm run scrape       # 手动跑一次抓取
npm run build        # 生产构建，产物在 out/
```

### 抓取单个渠道

```bash
npm run scrape -- --only siliconflow
npm run scrape -- --only deepseek
```

### Windows 构建注意事项

Next.js 15.5 在 Windows 上构建时，若有**残留的 node 进程**占用 `.next` 目录，会报 `EPERM: operation not permitted, open '.next/trace'`。

这不是代码问题。解决办法：

```bash
# 1. 结束残留进程
taskkill //F //IM node.exe

# 2. 清理构建目录后重新构建
npx next build
```

Linux / macOS / GitHub Actions 无此问题。

## 数据口径

### 价格

- 单位一律为**每百万 token**
- 国内模型用人民币，海外模型用美元；统一按央行公布的人民币汇率中间价折算成人民币展示
- 原始币种与原始数值同时保留（`inputNative` / `inputCny`），可回溯
- **3:1 混合价** = `(输入价 × 3 + 输出价) / 4`，是横向比价的主指标
- **溢价率** = 该渠道混合价相对官方渠道最低价的偏离，仅对云平台渠道计算
- **缓存折扣** = 1 − 缓存读取价 ÷ 标准输入价

### 计费档位

不同时段/长度/批量的价格用 `tier` 字段表达，不做数值展开：

| 类型 | 说明 | 示例 |
|---|---|---|
| `offpeak` | 空闲时段 | DeepSeek、联通云 |
| `peak` | 高峰时段 | DeepSeek、联通云 |
| `long_context` | 长上下文档位 | MiniMax（512K）、豆包（32K）、Gemini（200K）、OpenAI（272K） |
| `batch` | 批量推理折扣 | 各家通用 |

### 套餐价

与按量价分开存放、独立展示，因为两者口径不同：按量价是单价，套餐价是总量承诺。
折算方式为 `月费 ÷ 额度`，因输入输出合并抵扣，按 3:1 假设估算。

### 跑分

- 全部来自第三方评测机构（Artificial Analysis 为主），**ModelsMark 不自行跑分**
- 推理档位统一为「拉满」
- 每个分数标注：是否含 fallback 调用、是否计入 cyberguards 拦截、来源机构、评测日期
- Kimi Code Bench 3.0 为月之暗面自建基准，已明确标注
- 部分厂商 model card 的自测分数标注为「厂商自测」，与第三方分数区分

## 关键设计原则

**抓取失败绝不用空值覆盖。** 某渠道抓取失败时，系统保留其上期数据并标记 `status: 'stale'` 与实际数据日期，绝不写入空价格。价格网站一旦显示错误的低价，代价是真金白银。

**发布前必须通过校验。** `npm run validate` 检查外键完整性、价格合法性、覆盖率与跳变幅度，任一项失败则中止本次发布（GitHub Actions 会因此中断）。

**数据可回溯。** 每条价格记录都带 `sourceUrl` 与 `fetchedAt`；每周快照独立存档，可画出价格变化曲线。

## 部署

见 [DEPLOY.md](./DEPLOY.md)。
