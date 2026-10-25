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
| Framework | `nextjs` |
| Build Command | `npm run build` |
| Install Command | `npm install --no-audit --no-fund` |
| Node Version | 22.x |

**关键配置说明**：本项目使用 Next.js `output: 'export'` 静态导出，产物在 `out/`。

- ✅ `vercel.json` 中**不能**设置 `outputDirectory: "out"` —— 会与 Next.js 框架预设冲突，导致构建报
  `The file ".../out/routes-manifest.json" couldn't be found`。
- ✅ Vercel 会自动识别 `output: 'export'` 并使用 `out/` 作为产物目录，无需手动指定。
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

部署工作流（`.github/workflows/deploy.yml`）采用 **`vercel build` + `vercel deploy --prebuilt`** 方案：
构建在 GitHub runner 上完成，只把静态产物上传到 Vercel。这样不依赖 Vercel 的 Git 集成，
国内网络环境下同样可靠。

在仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `VERCEL_TOKEN` | Vercel 账号的访问令牌（见下方获取方式）|
| `VERCEL_ORG_ID` | `team_onk3Co4tJV53iEuL3UPhh8Ap` |
| `VERCEL_PROJECT_ID` | `prj_spk2JAmo033slq7ARiqyI54Mkith` |

**获取 VERCEL_TOKEN**：

1. 打开 https://vercel.com/account/tokens
2. 点 **Create Token**，命名 `modelsmark-ci`，选 **Expiration** 期限
3. 点 **Create** 后**立刻复制**（只显示一次）
4. 粘贴到上面表格的 `VERCEL_TOKEN` secret 里

配置完成后，`main` 分支每次 push（改动 `src/`、`data/`、`scripts/` 等路径时）
会自动触发：安装依赖 → 类型检查 → 构建 → 部署到生产环境。

手动触发：**Actions → 构建并部署到 Vercel → Run workflow**

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
   - **Framework preset**：Next.js
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

部署后，`.github/workflows/scrape.yml` 会自动接管：

- 每周一 22:00 UTC（= 周一 06:00 CST）触发
- 跑 19 个渠道适配器 → 校验 → 有变化则提交 `data/` → 触发 `deploy.yml` 重新构建发布
- 失败时保留上期数据并在 `scrape-report.json` 记录

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

**Q: Vercel 报 `out/routes-manifest.json` 找不到**

`vercel.json` 里设置了 `outputDirectory: "out"`，与 Next.js 框架预设冲突。**删除该字段**——Vercel 会自动识别 `output: 'export'`。

**Q: Pages 部署后 404**

检查构建输出目录是否为 `out`（不是 `.next`）。本项目配置了 `output: 'export'`，产物在 `out/`。

**Q: 抓取任务全部失败**

多数海外站点（OpenAI、Anthropic、Gemini）对非浏览器请求返回 Forbidden 或需要 JS 渲染，适配器已用 Playwright 处理。若 GitHub Actions 上失败，通常是 IP 被限流，可手动触发重试。

**Q: 数据停在某天不更新**

查看 `data/snapshot.json` 的 `channelStatus` 字段。某个渠道 `status` 为 `stale` 说明该渠道抓取失败、沿用了上期数据，`dataAsOf` 是实际数据日期，`error` 是失败原因。
