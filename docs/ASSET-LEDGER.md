# ModelsMark 数据资产台账

最后更新：2026-10-28

## 总量

| 项 | 值 |
|---|---|
| 价格记录 | 361 条 |
| 模型 | 74 个 |
| 渠道定义 | 21 家 |
| 有数据渠道 | 16 家 |
| 真实智能指数 | 13 个模型 |
| 数据接地校验 | 0 错误 |

| 渠道类型 | 记录数 |
|---|---|
| carrier | 21 |
| cloud | 223 |
| official | 89 |
| third | 28 |

## 各渠道记录数

| 渠道 | 类型 | 记录数 | 官网来源 |
|---|---|---|---|
| 阿里云百炼 | cloud | 101 | https://help.aliyun.com/zh/model-studio/model-pricing |
| 火山引擎方舟 | cloud | 78 | https://www.volcengine.com/docs/82379/1099320 |
| 小米 MiMo 官方 | official | 40 | https://mimo.mi.com/docs/price/pay-as-you-go |
| 百度智能云千帆 | cloud | 30 | https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya |
| 智谱官方 | official | 24 | https://open.bigmodel.cn/pricing |
| 硅基流动 | third | 22 | https://siliconflow.cn/zh-cn/pricing |
| 移动云 | carrier | 13 | https://ecloud.10086.cn/op-help-center/doc/article/91592 |
| MiniMax 官方 | official | 9 | https://platform.minimaxi.com/document/price |
| 腾讯云 TokenHub | cloud | 8 | https://cloud.tencent.com/document/product/1823/97731 |
| 联通云 | carrier | 8 | https://www.cucloud.cn/announcement-news.html?id=464 |
| OpenAI 官方 | official | 6 | https://developers.openai.com/api/docs/pricing |
| 七牛云 | third | 6 | https://www.qiniu.com/pricing |
| 华为云 ModelArts | cloud | 6 | https://support.huaweicloud.com/price-maas/MaaS%E6%A8%A1%E5%9E%8B%E5%8D%B3%E6%9C%8D%E5%8A%A1%20%E8%AE%A1%E8%B4%B9%E8%AF%B4%E6%98%8E-pdf.pdf |
| DeepSeek 官方 | official | 4 | https://api-docs.deepseek.com/zh-cn/quick_start/pricing |
| Anthropic 官方 | official | 3 | https://platform.claude.com/docs/en/about-claude/pricing |
| 月之暗面官方 | official | 3 | https://platform.kimi.com/docs/pricing/chat |

## 数据口径

- **混合价**：3:1 输入输出加权（(输入×3+输出)/4），输入或输出缺失时不计算混合价
- **标准档**：排除闲时/批量/低优/经济版/五折/长上下文溢价档；高峰时段视同刊例价
- **全渠道最低**：仅取标准档的最低混合价，不含批量等不可复现折扣
- **对比官方**：官方渠道自身为基准（0%），其余渠道均以该基准计算
- **矩阵 X 轴**：全渠道最低混合价（对数）；Y 轴：Artificial Analysis 智能指数

## 已知数据缺口

- **智能指数**：Artificial Analysis 榜单共 28 个模型，项目收录其中 13 个，其余标注「待补」
- **华为云 PDF URL 返回 567 / OpenAI 返回 403**：反爬与临时状态，浏览器可正常访问，非数据缺陷

## 数据链路

```
ingest.ts            原始采集 + 解析（17 个渠道采集器）
build-models.ts      建/刷新模型表（含官网原始展示名）
clean-models.ts      别名归并 + 噪声剔除
merge-intelligence.ts 并入 Artificial Analysis 实抓指数
validate-data.ts     数据接地校验 → data/validate-report.json

npm run data:pipeline  =  ingest → models → clean → intel（必须按此顺序，
                        否则 clean 会把套餐记录当孤儿删掉）
```
