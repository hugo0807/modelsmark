# 部署指南

两种方案，任选其一。**推荐 Cloudflare Pages**：免费额度足够（静态站每月 10 万次请求），且国内访问比 Vercel 稳定。

---

## 方案 A：Cloudflare Pages（推荐）

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
3. 或进入账号首页 → 侧边栏 "Account ID"

### 4. 推代码到 GitHub

```bash
cd modelsmark
git init
git add .
git commit -m "feat: ModelsMark 初始版本"
git branch -M main
git remote add origin https://github.com/<你的用户名>/modelsmark.git
git push -u origin main
```

### 5. 配置 GitHub Secrets

在仓库页面：**Settings → Secrets and variables → Actions → New repository secret**

添加三个：

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 第 2 步复制的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | 第 3 步的 Account ID |
| `CLOUDFLARE_PROJECT_NAME` | `modelsmark`（自己起，全小写） |

### 6. 连接 Pages 项目

1. 打开 https://dash.cloudflare.com/pages
2. 点 **Create application** → **Connect to Git**
3. 授权 GitHub，选择 `modelsmark` 仓库
4. 构建配置：
   - **Framework preset**：Next.js
   - **Build command**：`npm run build`
   - **Build output directory**：`out`
   - **Root directory**：留空（仓库根就是 modelsmark）
5. 点 **Save and Deploy**

### 7. 补充环境变量

部署后如果页面数据不对，在 Pages 项目 → **Settings → Environment variables** 添加：

```
NODE_VERSION = 22
NEXT_TELEMETRY_DISABLED = 1
```

### 8. 验证

部署成功后会给出 `https://modelsmark.pages.dev` 之类的地址。

---

## 方案 B：Vercel

### 1. 注册

1. 打开 https://vercel.com/signup
2. 用 GitHub 账号一键登录（推荐，能自动关联仓库）

### 2. 导入项目

1. 登录后点 **Add New... → Project**
2. 选择 `modelsmark` 仓库
3. Framework 会自动识别为 Next.js，保持默认
4. **Build Command** 确认是 `npm run build`
5. 点 **Deploy**

### 3. 自定义域名（可选）

Vercel 会分配 `modelsmark.vercel.app`。绑定自己的域名：
**Settings → Domains → Add**，按提示加 CNAME 记录。

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

Windows 上残留的 node 进程占用了目录。执行 `taskkill //F //IM node.exe` 后重新构建。Linux 上不会出现。

**Q: Pages 部署后 404**

检查构建输出目录是否为 `out`（不是 `.next`）。本项目配置了 `output: 'export'`，产物在 `out/`。

**Q: 抓取任务全部失败**

多数海外站点（OpenAI、Anthropic、Gemini）对非浏览器请求返回 Forbidden 或需要 JS 渲染，适配器已用 Playwright 处理。若 GitHub Actions 上失败，通常是 IP 被限流，可手动触发重试。

**Q: 数据停在某天不更新**

查看 `data/snapshot.json` 的 `channelStatus` 字段。某个渠道 `status` 为 `stale` 说明该渠道抓取失败、沿用了上期数据，`dataAsOf` 是实际数据日期，`error` 是失败原因。
