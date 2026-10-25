# 部署指南

当前有两条可用路径：

| 路径 | 网址 | 适合场景 | 状态 |
|---|---|---|---|
| **A. 即时发布** | `https://modelsmark.app.workbuddy.host/?sharecode=B446I2BLWQ` | 马上要给人看、内部预览 | ✅ 已上线 |
| **B. GitHub + Vercel** | `https://modelsmark-sigma.vercel.app` | 长期运营、自动周更、源仓库托管 | ✅ 已上线（国内访问需绑自定义域名）|

路径 A 已可直接使用。路径 B 用于建立长期自动更新的基础设施——**两者不冲突**。

> ⚠️ **国内访问提示**：`*.vercel.app` 域名在中国大陆网络下通常无法直连（实测本机 DNS 解析正常但 TCP 连接超时）。要国内访问必须绑定自定义域名，见下方「路径 B-3」。

---

## 路径 B：GitHub + Vercel

### B-1. Vercel 项目已配置完成

| 配置项 | 值 |
|---|---|
| Project | `295698670-1601s-projects/modelsmark` |
| 生产域名 | `https://modelsmark-sigma.vercel.app` |
| Framework | `null`（按纯静态站发布）|
| Output Directory | `out` |
| Build Command | `npm run build` |
| Install Command | `npm install --no-audit --no-fund` |
| Node Version | 22.x |

**关键配置说明**：本项目使用 Next.js `output: 'export'` 静态导出，产物在 `out/`。

- ✅ `vercel.json` **必须**设置 `"framework": null` + `"outputDirectory": "out"`。
  若框架被识别为 `nextjs`，Vercel 会走服务端构建流程，产物目录不匹配，
  结果是**线上所有路径都返回 404 页面**（排查该问题时曾误判为"内容截断"，
  实为 404 页字节数与本地 `out/404.html` 完全一致）。
- ❌ 不要用 `vercel deploy --prebuilt`：该模式会把源码目录一并上传，
  Vercel 仍按源码项目识别框架，导致同样的 404 问题。
- ✅ `vercel.json` 已配置 `trailingSlash: true` 与静态资源缓存头。

如需重新部署：

```bash
cd modelsmark
vercel deploy --prod
```

### B-2. 推送代码到 GitHub

仓库地址：`https://github.com/hugo0807/modelsmark`

```bash
cd modelsmark
git remote -v                                    # 确认 origin 指向该仓库
git push -u origin main
```

### B-3. 配置 GitHub Actions 部署凭证

部署工作流（`.github/workflows/deploy.yml`）在 push 到 `main` 时自动触发：
拉取项目配置 → 部署到 Vercel 生产环境（构建由 Vercel 侧执行）。

在仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `VERCEL_TOKEN` | Vercel 账号的访问令牌（见下方获取方式）|

> `VERCEL_ORG_ID` 与 `VERCEL_PROJECT_ID` 非敏感，已直接写在 workflow 的 `env` 中，无需配置。

**获取 VERCEL_TOKEN**：

1. 打开 https://vercel.com/account/tokens
2. 点 **Create Token**，命名 `modelsmark-ci`，选 **Expiration** 期限
3. 点 **Create** 后**立刻复制**（只显示一次）
4. 粘贴到上面表格的 `VERCEL_TOKEN` secret 里

> ⚠️ **不要用 CLI 的会话 Token**：`vca_` 前缀的登录态约 6~7 小时后过期，
> 且 Vercel 已限制 `tokens create` 接口（返回 `Cannot create tokens for this app`），
> 只能在网页手动创建。

### 用脚本自动写入 Secret（可选）

如果希望由脚本完成加密写入（避免明文进入 shell 历史），仓库提供了
`scripts/write-gh-secrets.js`——它会用仓库公钥做 libsodium sealed box 加密后再提交：

```bash
node scripts/write-gh-secrets.js <PAT> VERCEL_TOKEN=<你的 token>
```

**前提**：所用 PAT 必须拥有 **Repository permissions → Secrets: Read and write**。
用 Fine-grained PAT 时若缺这一项，接口会返回
`403 Resource not accessible by personal access token`（此时 `actions/workflows`、
`actions/runs` 等读取接口仍是 200，容易误判为"权限已配好"）。

配置完成后，`main` 分支每次 push（改动 `src/`、`data/`、`scripts/` 等路径时）
会自动触发：安装依赖 → 类型检查 → 构建 → 部署到生产环境。

手动触发：**Actions → 构建并部署到 Vercel → Run workflow**
（手动触发需要 PAT 具备 **Actions: Read and write**；push 触发则只需 Contents 写权限。）

### B-4. 绑定自定义域名（国内访问必需，可选）


**第一步：在 Vercel 添加域名**

1. 打开 https://vercel.com/295698670-1601s-projects/modelsmark/settings/domains
2. 点 **Add Domain**，输入你的域名，例如 `modelsmark.com` 或 `www.modelsmark.com`
3. Vercel 会给出两条 DNS 记录要求

**第二步：在域名 DNS 服务商添加解析记录**

Vercel 默认推荐 A 记录（任选其一，指向任一 IP 均可）：

| 类型 | 主机 | 值 | TTL |
|---|---|---|---|
| A | `@`（根域） | `76.76.21.21` | 60 |
| CNAME | `www` | `cname.vercel-dns.com` | 60 |

> 若使用阿里云/腾讯云 DNS，也可直接用 CNAME：`@` → `cname.vercel-dns.com`，并按域名商要求把根域 CNAME 转为 A 记录（DNSPod 需付费套餐支持）。

**第三步：等待验证**

Vercel 会在 DNS 生效后自动签发证书（通常 1-30 分钟）。验证通过后生产域名会自动切换到你的域名。

**注意事项**：

- 中国大陆服务器提供商的域名需完成 **ICP 备案**才能绑定（Vercel 会提示 "Domain is not compliant with ICP"）。这是硬性要求。
- 若无备案，可用香港/海外节点域名，或直接沿用路径 A 的 `workbuddy.host` 域名。

---

## 路径 B 备选：Cloudflare Pages

### 1. 注册 Cloudflare 账号

1. 打开 https://dash.cloudflare.com/sign-up
2. 邮箱注册，验证邮箱
3. 选择 Free 套餐（免费版够用，不需要选 Pro）

### 2. 创建 API Token

1. 登录后进入 https://dash.cloudflare.com/profile/api-tokens
2. 点 **Create Token** → 选 **Edit Cloudflare Workers** 模板，或用 Custom Token：
   - Permissions：`Account` → `Pages` → `Edit`
   - Account Resources：选你的账号
3. 点 **Continue to Summary** → **Create Token**
4. **立刻复制 Token**（只显示这一次），备用

### 3. 拿到 Account ID

1. 打开 https://dash.cloudflare.com/
2. 右侧任一区域旁边有一串 32 位十六进制字符，那就是 **Account ID**

### 4. 配置 GitHub Secrets

在仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 2 步复制的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | 第 3 步的 Account ID |
| `CLOUDFLARE_PROJECT_NAME` | `modelsmark`（自己起，全小写）|

### 5. 连接 Pages 项目

1. 打开 https://dash.cloudflare.com/pages
2. 点 **Create application** → **Connect to Git**
3. 授权 GitHub，选择 `modelsmark` 仓库
4. 构建配置：
   - **Framework preset**：None（纯静态站，见路径 B-1 的关键说明）
   - **Build command**：`npm run build`
   - **Build output directory**：`out`
   - **Root directory**：留空（仓库根就是 modelsmark）
5. 点 **Save and Deploy**

---

## 网络环境说明（重要）

本机实测：国内网络下 `github.com` 与 `*.vercel.app` 均存在连接不稳定/被阻断的情况，但 `api.github.com`、`api.vercel.com` 可达。

**GitHub 授权被阻断时的绕过方案**：

```bash
# 关闭 git 代理（全局生效）
git config --global http.proxy ""
git config --global https.proxy ""

# 设备码授权走 API 直连时可用固定 IP
curl --noproxy '*' --resolve github.com:443:140.82.113.3 \
  -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -d '{"client_id":"Iv1.b507a08c87ecfe98","scope":"repo read:org workflow"}' \
  https://github.com/login/device/code
```

---

## 周更调度是否已生效

项目里有三个工作流，各自职责如下：

| 工作流 | 触发方式 | 职责 |
|---|---|---|
| `deploy.yml` | push 到 `main`（限定路径）/ 手动 | 构建并部署到 Vercel 生产环境 |
| `scrape.yml` | 每周一 22:00 UTC（= 周一 06:00 CST）/ 手动 | 跑 19 个渠道适配器 → 校验 → 有变化则提交 `data/` |
| `health-check.yml` | push 到 `main` / 每周一 15:00 UTC / 手动 | 巡检线上站点各页面是否正常 |

**串联关系**：`scrape.yml` 提交数据变更 → 自动触发 `deploy.yml` 重新构建发布 →
再触发 `health-check.yml` 校验线上结果，形成闭环。

失败时保留上期数据并在 `scrape-report.json` 记录。

### ⚠️ 前置条件：`VERCEL_TOKEN` 必须先配置好

`deploy.yml` 依赖仓库 Secret `VERCEL_TOKEN`。**未配置时 push 会触发部署但必然失败**，
工作流会在「校验 Token」步骤以 `::error::缺少 VERCEL_TOKEN secret` 终止，
不会产生任何部署（线上站点保持上一版，不受影响）。

配置方法见 [B-3](#b-3-配置-github-actions-部署凭证)。

### 本地无法直连 vercel.app 时怎么验证？

国内网络下 `*.vercel.app` 常连不上（实测 TCP 超时），本地 `curl` 无法判断线上是否正常。
**用 `health-check.yml` 验证**——它在 GitHub 海外 runner 上跑，能直连 vercel.app：

- 巡检 5 个路径（`/`、`/prices/`、`/benchmarks/`、`/about/`、`/models/glm-5-3/`）
- 检查 HTTP 状态码与响应体字节数
- 校验首页关键词（ModelsMark / 性价比 / 跑分）是否存在
- 校验 prices 页体积 > 50KB（404 页约 9KB，可据此区分）

手动触发：**Actions → 线上站点健康检查 → Run workflow**

> 排查 404 问题时，正是这个工作流的「prices 页体积」检查起了决定性作用：
> 线上返回 9227 字节，与本地 `out/404.html` 完全一致，由此确认是 404 页而非内容截断。

**注意**：GitHub Actions 在中国大陆访问不稳定，如果定时任务经常超时，可以改用自建服务器 + cron，或改用其他 CI（如 Gitee、Gitee Go）。

### 手动触发

不需要等定时，随时可以手动跑：

- Actions 页面 → **Scrape weekly prices and benchmarks** → **Run workflow**
- 想只跑某个渠道：在 `Run workflow` 的输入框填渠道 id（如 `siliconflow`）

---

## 本地验证部署产物

```bash
npm run build
npx serve out        # 或任意静态服务器
```

---

## 常见问题

**Q: 构建报 `EPERM: ... .next/trace`**

Windows 上残留的 node 进程占用了目录。项目已内置 `scripts/build-compat.cjs` 做降级处理（排他创建失败时自动退化为普通创建），`npm run build` 应能直接通过。若仍失败，执行 `taskkill //F //IM node.exe` 后重试。Linux 上不会出现。

**Q: Vercel 报 `out/routes-manifest.json` 找不到 / 线上全是 404**

**不要删除 `outputDirectory`**，这正是 404 的根因。本项目用 Next.js `output: 'export'` 静态导出，
产物在 `out/`；若框架被识别为 `nextjs`，Vercel 会走服务端构建流程并找不到 `out/`，
最终**所有路径返回 404 页**。

正确配置是 `vercel.json` 里：

```json
{ "framework": null, "outputDirectory": "out" }
```

项目级设置里也要对应改成 **Framework: None** + **Output Directory: out**。
快速判断线上是否中招：对比响应体字节数与本地 `out/404.html`——**完全一致就是 404 页**。

**Q: Pages 部署后 404**

检查构建输出目录是否为 `out`（不是 `.next`）。本项目配置了 `output: 'export'`，产物在 `out/`。
若用的是 Vercel，Framework preset 必须设为 **None**，不能是 Next.js。

**Q: 抓取任务全部失败**

多数海外站点（OpenAI、Anthropic、Gemini）对非浏览器请求返回 Forbidden 或需要 JS 渲染，适配器已用 Playwright 处理。若 GitHub Actions 上失败，通常是 IP 被限流，可手动触发重试。

**Q: 数据停在某天不更新**

查看 `data/snapshot.json` 的 `channelStatus` 字段。某个渠道 `status` 为 `stale` 说明该渠道抓取失败、沿用了上期数据，`dataAsOf` 是实际数据日期，`error` 是失败原因。
