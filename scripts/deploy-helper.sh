#!/usr/bin/env bash
#
# ModelsMark 部署助手
#
# 用法：
#   ./scripts/deploy-helper.sh check        检查配置完成度
#   ./scripts/deploy-helper.sh push         推送到 GitHub（需先配置 remote）
#   ./scripts/deploy-helper.sh secrets      生成配置 Secrets 的命令
#
# 这个脚本不存储任何凭据，只做检查和引导。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }

cmd_check() {
  echo "==================== ModelsMark 部署检查 ===================="
  echo ""

  echo -e "${BLUE}[1] 项目状态${NC}"
  if [ -d ".git" ]; then
    ok "Git 仓库已初始化（分支：$(git branch --show-current)）"
    local commits
    commits=$(git rev-list --count HEAD)
    ok "提交数：$commits"
    if [ -n "$(git status --porcelain)" ]; then
      warn "有未提交的改动："
      git status --short | head -5
    else
      ok "工作区干净"
    fi
  else
    err "未初始化 Git 仓库"
  fi
  echo ""

  echo -e "${BLUE}[2] GitHub 远程${NC}"
  if git remote get-url origin >/dev/null 2>&1; then
    ok "origin → $(git remote get-url origin)"
  else
    warn "未配置 origin 远程仓库"
    echo "     创建仓库后执行：git remote add origin https://github.com/<用户名>/modelsmark.git"
  fi
  echo ""

  echo -e "${BLUE}[3] 构建产物${NC}"
  if [ -d "out" ]; then
    local pages
    pages=$(find out -name "*.html" | wc -l | tr -d ' ')
    ok "out/ 存在，$pages 个 HTML 页面"
  else
    warn "out/ 不存在，需执行 npm run build"
  fi
  echo ""

  echo -e "${BLUE}[4] 数据完整性${NC}"
  if node -e "
    const fs=require('fs');
    const p=JSON.parse(fs.readFileSync('data/prices.json','utf8'));
    const m=JSON.parse(fs.readFileSync('data/seeds/models.json','utf8'));
    const s=JSON.parse(fs.readFileSync('data/seeds/scores.json','utf8'));
    console.log('  模型 ' + m.length + ' 个 · 价格 ' + p.length + ' 条 · 分数 ' + s.length + ' 条');
  " 2>/dev/null; then
    ok "数据文件可正常解析"
  else
    err "数据文件解析失败"
  fi
  echo ""

  echo -e "${BLUE}[5] GitHub Secrets（需在仓库页面配置）${NC}"
  echo "  仓库 → Settings → Secrets and variables → Actions → New repository secret"
  echo ""
  echo "  CLOUDFLARE_API_TOKEN     ← Cloudflare 仪表盘 → Profile → API Tokens → Create"
  echo "  CLOUDFLARE_ACCOUNT_ID    ← Cloudflare 仪表盘首页右侧"
  echo "  CLOUDFLARE_PROJECT_NAME  ← 建议填 modelsmark"
  echo ""

  echo "==========================================================="
}

cmd_push() {
  if ! git remote get-url origin >/dev/null 2>&1; then
    err "未配置 origin"
    echo ""
    echo "请先在 GitHub 创建空仓库（不要勾选 README/.gitignore/license），然后执行："
    echo "  git remote add origin https://github.com/<用户名>/modelsmark.git"
    exit 1
  fi

  info "推送到 $(git remote get-url origin)"
  git push -u origin main
  ok "推送完成"
  echo ""
  echo "下一步："
  echo "  1. 配置 GitHub Secrets（见 DEPLOY.md）"
  echo "  2. 在 Cloudflare Pages 连接该仓库，构建命令 npm run build，输出目录 out"
  echo "  3. 或在 Actions 页面手动触发 '每周抓取价格与跑分'"
}

cmd_secrets() {
  echo "配置 GitHub Secrets 的命令（需先安装 gh CLI）："
  echo ""
  echo "  gh auth login"
  echo "  gh secret set CLOUDFLARE_API_TOKEN"
  echo "  gh secret set CLOUDFLARE_ACCOUNT_ID"
  echo "  gh secret set CLOUDFLARE_PROJECT_NAME --body modelsmark"
  echo ""
  echo "或手动在仓库页面配置。"
}

case "${1:-check}" in
  check)   cmd_check ;;
  push)    cmd_push ;;
  secrets) cmd_secrets ;;
  *)
    echo "用法：$0 {check|push|secrets}"
    exit 1
    ;;
esac
